#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
. ./evals/installed-state.sh
. ./local.conf
ADMIN_USER=${ADMIN_USER:?}
work=$(mktemp -d) || exit 1
mkdir -p /root/eval-state
cp local.conf "${work}/local.conf"
cron_was_up=0
trap 'cp "${work}/local.conf" local.conf || exit 1; if [ "${cron_was_up}" -eq 1 ]; then rcctl start cron >/dev/null || exit 1; fi; rm -rf "${work}"' EXIT
if rcctl check cron >/dev/null 2>&1; then cron_was_up=1; rcctl stop cron >/dev/null || exit 1; fi

capture() {
	state && state_paths /var/www/htdocs /var/unbound/etc /var/unbound/db && service_pids
}

check_read_only() {
	capture > "${work}/before" || return 1
	sh install.sh --check > "${work}/preview" || return 1
	capture > "${work}/after" || return 1
	cmp -s "${work}/before" "${work}/after"
}

plant() {
	while IFS='	' read -r path _mode; do printf '\n' >> "${path}"; done < evals/golden/modes.tsv
	for f in sbin/*; do printf '\n' >> /usr/local/sbin/"${f#sbin/}"; done
	chmod 644 /usr/local/sbin/health-check
	for user in "${ADMIN_USER}" deploy tunnel; do printf '\n' >> /home/"${user}"/.ssh/authorized_keys; done
	printf '\n' >> /etc/myname
	printf '\n' >> /etc/mail/virtual
	sed '/^root: contact$/d' /etc/mail/aliases > "${work}/aliases"
	cat "${work}/aliases" > /etc/mail/aliases
	sed '/ssh-alert/d' /etc/syslog.conf > "${work}/syslog"
	cat "${work}/syslog" > /etc/syslog.conf
	crontab -l | sed '/health-check/d' > "${work}/cron"
	crontab - < "${work}/cron"
	cp www/.well-known/security.txt /var/www/htdocs/server/old-security.txt
	rm /var/www/htdocs/server/.well-known/security.txt
	cat www/contact.gpg www/contact.gpg > /var/www/htdocs/server/contact.gpg
	openssl rand -hex 32 > "${work}/token"
	awk 'FNR == NR { token = $0; next } { gsub(/@FH_TOKEN@/, token); sub(/header set "Authorization" value /, "header\tset \"aUtHoRiZaTiOn\" value\t"); print }' "${work}/token" evals/fixtures/relayd-before.conf > /etc/relayd.conf
}

files() {
	{
		cut -f1 evals/golden/modes.tsv
		for f in sbin/*; do echo /usr/local/sbin/"${f#sbin/}"; done
		find www -type f | sed 's#^www/#/var/www/htdocs/server/#'
		printf '/home/%s/.ssh/authorized_keys\n' "${ADMIN_USER}" deploy tunnel
		printf '%s\n' /etc/myname /etc/mail/virtual /etc/mail/aliases /etc/syslog.conf /var/cron/tabs/root /var/unbound/etc/blocklist.conf
	} > "${work}/paths"
	while IFS= read -r path; do grep -qxF "File: ${path}" "${work}/preview" || return 1; done < "${work}/paths"
	grep -q '^@@' "${work}/preview" && grep -q 'old-security.txt' "${work}/preview" &&
		grep -q 'replace, mode 755' "${work}/preview"
}

services() {
	grep -qxF 'Action: rcctl restart sshd syslogd httpd relayd smtpd unbound' "${work}/preview" || return 1
	grep -qxF 'Action: pfctl -f /etc/pf.conf' "${work}/preview" || return 1
	grep -qxF 'Action: unbound-anchor' "${work}/preview" || return 1
	for service in neurons_room slowcgi; do
		if [ -x /etc/rc.d/"${service}" ]; then
			grep -qxF "Action: rcctl disable ${service}" "${work}/preview" || return 1
			if rcctl check "${service}" >/dev/null 2>&1; then grep -qxF "Action: rcctl stop ${service}" "${work}/preview" || return 1; fi
		fi
	done
}

private_values() {
	if grep -qF -f "${work}/token" "${work}/preview"; then return 1; fi
	tr -d '\000' < "${work}/preview" > "${work}/without-nul"
	cmp -s "${work}/preview" "${work}/without-nul" && grep -q '\[redacted\]' "${work}/preview"
}

generated_files() {
	paths='/etc/ssl/teoyujie.org.fullchain.pem /etc/ssl/private/teoyujie.org.key /etc/ssl/apps.crt /etc/ssl/private/apps.key /etc/mail/srs.conf /var/unbound/etc/blocklist.conf /var/unbound/db/root.key'
	unbound_was_up=0
	if rcctl check unbound >/dev/null 2>&1; then unbound_was_up=1; rcctl stop unbound >/dev/null || return 1; fi
	mkdir "${work}/saved"
	for path in ${paths}; do name=${path##*/}; cp -p "${path}" "${work}/saved/${name}" && rm "${path}" || return 1; done
	sed "s/^ADMIN_USER=.*/ADMIN_USER=${ADMIN_USER}_next/" "${work}/local.conf" > local.conf
	check_read_only
	result=$?
	for path in ${paths}; do
		if [ -e "${path}" ]; then result=1; fi
		name=${path##*/}
		cp -p "${work}/saved/${name}" "${path}" || result=1
		grep -F "${path}" "${work}/preview" >/dev/null || result=1
	done
	if [ "${unbound_was_up}" -eq 1 ]; then rcctl start unbound >/dev/null || result=1; fi
	cp "${work}/local.conf" local.conf
	cp "${work}/preview" /root/eval-state/preview-generated.log
	[ "${result}" -eq 0 ]
}

render_failure() {
	mv etc/crontab "${work}/source-crontab" || return 1
	capture > "${work}/before" || return 1
	result=0
	if sh install.sh --check > "${work}/render-error" 2>&1; then result=1; fi
	capture > "${work}/after" || result=1
	mv "${work}/source-crontab" etc/crontab || return 1
	cmp -s "${work}/before" "${work}/after" || result=1
	cp "${work}/render-error" /root/eval-state/preview-render-error.log
	[ "${result}" -eq 0 ]
}

installed_matches() {
	sh install.sh --live > /root/eval-state/preview-install.log 2>&1 || return 1
	check_read_only || return 1
	cp "${work}/preview" /root/eval-state/preview-after.log
	if grep -q '^@@' "${work}/preview"; then return 1; fi
	[ ! -e /var/www/htdocs/server/old-security.txt ] &&
		cmp -s www/contact.gpg /var/www/htdocs/server/contact.gpg &&
		[ ! -e /etc/hostname.wg0.new ]
}

sh evals/legacy-plant.sh || exit 1
plant || exit 1
expect vm:preview-read-only check_read_only
cp "${work}/preview" /root/eval-state/preview-full.log
expect vm:preview-files files
expect vm:preview-services services
expect vm:preview-private private_values
expect vm:preview-generated generated_files
expect vm:preview-render-failure render_failure
expect vm:preview-installed installed_matches
finish
