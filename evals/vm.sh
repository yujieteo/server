#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
. ./local.conf
state=/root/eval-state
g=evals/golden
mkdir -p "${state}"

secret_hash() {
	case $1 in
	wg) awk '$1 == "wgkey" { print $2 }' /etc/hostname.wg0 | sha256 -q ;;
	srs) sha256 -q /etc/mail/srs.conf ;;
	*) sha256 -q "$1" ;;
	esac
}

snapshot() {
	secret_hash wg > "${state}/wg"
	secret_hash srs > "${state}/srs"
	secret_hash /etc/ssl/private/teoyujie.org.key > "${state}/tls"
	secret_hash /etc/ssl/private/apps.key > "${state}/apps"
	echo "snapshot kept: no value printed"
}

same_as_before() {
	current=$(secret_hash "$2")
	saved=$(cat "${state}/$1")
	[ "${current}" = "${saved}" ]
}

wg_normal() {
	sed 's/^wgkey .*/wgkey KEY/' /etc/hostname.wg0
}

wg_is_up() {
	peer_lines=$(ifconfig wg0 | grep -c wgpeer)
	want_peers=$(echo "${WG_PEERS:-}" | wc -w | tr -d ' ')
	ifconfig wg0 | grep -q 'inet 10.8.0.1 netmask 0xffffff00' &&
		ifconfig wg0 | grep -q 'wgport 51820' &&
		[ "${peer_lines}" -eq "${want_peers}" ]
}

modes_are() {
	want=$1
	shift
	for f in "$@"; do
		got=$(mode_of "${f}")
		[ "${got}" = "${want}" ] || return 1
	done
}

block_of() {
	crontab -l | sed -n '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/p' | awk -f evals/keep.awk
}

aliases_block() {
	sed -n '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/p' /etc/mail/aliases
}

deploy_line() {
	echo "from=\"10.8.0.0/24,127.0.0.1\",restrict,command=\"/usr/local/sbin/deploy-only\" ${DEPLOY_KEY:-}"
}

watch_start() {
	rm -f "${state}/stop" "${state}/samples"
	(
		while [ ! -e "${state}/stop" ]; do
			if ifconfig wg0 > /dev/null 2>&1; then
				up_count=$(ifconfig wg0 | grep -c wgpeer)
				echo "up ${up_count}"
			else
				echo gone
			fi
			sleep 0.1
		done
	) > "${state}/samples" 2>&1 &
	watcher=$!
}

watch_stop() {
	touch "${state}/stop"
	wait "${watcher}"
}

never_gone() {
	[ -s "$1" ] && ! grep -qx gone "$1"
}

peers_stayed() {
	seen=$(sort -u "$2" | tr '\n' ' ')
	[ "${seen}" = "up $1 " ]
}

waited_before_change() {
	waited=$(awk -v same="up $1" '$0 == same { n++; next } { exit } END { print n + 0 }' "$2")
	[ "${waited}" -ge 15 ]
}

conf_is() {
	current_conf=$(conf_hash)
	[ "${current_conf}" = "$1" ]
}

wg_conf_is_golden() {
	current_conf=$(wg_normal)
	golden_conf=$(cat "${g}"/gen/etc/hostname.wg0)
	[ "${current_conf}" = "${golden_conf}" ]
}

forwards() {
	forwarding=$(sysctl -n net.inet.ip.forwarding)
	[ "${forwarding}" = 1 ]
}

deploy_key_is_set() {
	current_line=$(cat /home/deploy/.ssh/authorized_keys)
	wanted_line=$(deploy_line)
	[ "${current_line}" = "${wanted_line}" ]
}

aliases_are_golden() {
	current_block=$(aliases_block)
	golden_block=$(cat "${g}"/gen/etc/mail/aliases.block)
	[ "${current_block}" = "${golden_block}" ]
}

crontab_is_golden() {
	current_block=$(block_of)
	golden_block=$(cat "${g}"/gen/crontab.block)
	[ "${current_block}" = "${golden_block}" ]
}

alert_logged_once() {
	alert_lines=$(grep -c ssh-alert /etc/syslog.conf)
	[ "${alert_lines}" -eq 1 ]
}

tunnel_shell_is_wait() {
	tunnel_shell=$(shell_of tunnel)
	[ "${tunnel_shell}" = /usr/local/sbin/tunnel-wait ]
}

wg_key_is() {
	current_key=$(secret_hash wg)
	[ "${current_key}" = "$1" ]
}

peers_are() {
	peer_count=$(ifconfig wg0 | grep -c wgpeer)
	[ "${peer_count}" -eq "$1" ]
}

conf_hash() {
	sha256 -q /etc/hostname.wg0
}

http_status() {
	(printf 'GET /x HTTP/1.1\r\nHost: mac.lavish.teoyujie.org\r\n%b\r\n' "$1"; sleep 2) |
		openssl s_client -quiet -connect 10.8.0.1:443 -servername mac.lavish.teoyujie.org 2> /dev/null | tr -d '\r' > "${state}/reply"
	head -n 1 "${state}/reply" | cut -d' ' -f2
}

private_blocked() {
	status=$(http_status "$1")
	[ "${status}" = 403 ]
}

private_block_page() {
	http_status 'Origin: https://evil.example\r\n' > /dev/null
	grep -q 'Mechanical Engineer' "${state}/reply"
}

acme_on_private_name() {
	ip4=$(ifconfig egress | awk '$1 == "inet" { print $2; exit }')
	printf 'GET /.well-known/acme-challenge/x HTTP/1.0\r\nHost: mac.lavish.teoyujie.org\r\n\r\n' | nc -w 3 "${ip4}" 80 | head -n 1 | grep -q ' 404 '
}

is_wheel() {
	groups_of_admin=$(id "${ADMIN_USER:-}")
	echo "${groups_of_admin}" | grep -q wheel
}

is_detached() {
	echo "$1" | grep -q 'wg0 restarts in 2 seconds'
}

wg_conf_settled() {
	modes_are 640 /etc/hostname.wg0 && [ ! -e /etc/hostname.wg0.new ]
}

shell_of() {
	awk -F: -v u="$1" '$1 == u { print $NF }' /etc/passwd
}

installed_matches() {
	installed_mode=$(mode_of "$1")
	keep "$1" | cmp -s - "${g}$1" && [ "${installed_mode}" = "$2" ]
}

installed_all() {
	while IFS='	' read -r dest mode; do
		eval_id="vm:installed-$(echo "${dest#/}" | tr / -)"
		expect "${eval_id}" installed_matches "${dest}" "${mode}"
	done < "${g}/modes.tsv"
}

second() {
	before=$(conf_hash)
	count=$(ifconfig wg0 | grep -c wgpeer)
	watch_start
	start=$(date +%s)
	sh install.sh > "${state}/second.log" 2>&1
	status=$?
	finished=$(date +%s)
	echo $(( finished - start )) > /root/second-install-seconds
	watch_stop
	expect vm:second-install-ok [ "${status}" -eq 0 ]
	expect vm:wg-second-install-quiet second_was_quiet "${before}" "${count}"
	finish
}

second_was_quiet() {
	never_gone "${state}/samples" && peers_stayed "$2" "${state}/samples" && conf_is "$1" && [ ! -e /etc/hostname.wg0.new ]
}

check() {
	expect vm:wg-key-kept same_as_before wg wg
	expect vm:srs-key-kept same_as_before srs srs
	expect vm:tls-key-kept same_as_before tls /etc/ssl/private/teoyujie.org.key
	expect vm:apps-key-kept same_as_before apps /etc/ssl/private/apps.key
	expect vm:wg-conf wg_conf_is_golden
	expect vm:wg-conf-mode modes_are 640 /etc/hostname.wg0
	expect vm:wg-up wg_is_up
	expect vm:forwarding forwards
	expect vm:secret-modes modes_are 600 /etc/mail/srs.conf /etc/ssl/private/teoyujie.org.key /etc/ssl/private/apps.key /etc/relayd.conf /etc/pf.conf
	expect vm:admin-keys cmp -s "/home/${ADMIN_USER}/.ssh/authorized_keys" "${g}"/gen/home/admin/authorized_keys
	expect vm:tunnel-keys cmp -s /home/tunnel/.ssh/authorized_keys "${g}"/gen/home/tunnel/authorized_keys
	expect vm:deploy-key deploy_key_is_set
	expect vm:mail-virtual cmp -s /etc/mail/virtual "${g}"/gen/etc/mail/virtual
	expect vm:mail-aliases aliases_are_golden
	expect vm:crontab crontab_is_golden
	expect vm:syslog-alert-once alert_logged_once
	expect vm:admin-wheel is_wheel
	expect vm:services-run rcctl check httpd relayd smtpd unbound sshd cron
	expect vm:private-origin-403 private_blocked 'Origin: https://evil.example\r\n'
	expect vm:private-cross-site-403 private_blocked 'Sec-Fetch-Site: cross-site\r\n'
	expect vm:private-403-page private_block_page
	expect vm:private-acme acme_on_private_name
	expect vm:tunnel-shell tunnel_shell_is_wait
	installed_all
	finish
}

pending_after_exit() {
	[ -e /etc/hostname.wg0.new ] && conf_is "$1"
}

wgchange() {
	before=$(secret_hash wg)
	conf=$(conf_hash)
	peers=$(ifconfig wg0 | grep -c wgpeer)
	cp local.conf "${state}/local.conf.kept"
	extra_key=$(openssl rand -base64 32)
	sed "s#^WG_PEERS='#WG_PEERS='extra:10.8.0.9:${extra_key} #" "${state}/local.conf.kept" > local.conf
	watch_start
	out=$(sh install.sh 2>&1)
	status=$?
	exit_at=$(wc -l < "${state}/samples" | tr -d ' ')
	pending=1
	pending_after_exit "${conf}" || pending=0
	sleep 8
	watch_stop
	head -n "${exit_at}" "${state}/samples" > "${state}/during"
	tail -n +"$((exit_at + 1))" "${state}/samples" > "${state}/after"
	expect vm:wg-change-install [ "${status}" -eq 0 ]
	expect vm:wg-change-detached is_detached "${out}"
	expect vm:wg-change-untouched-until-exit never_gone "${state}/during"
	expect vm:wg-change-peers-until-exit peers_stayed "${peers}" "${state}/during"
	expect vm:wg-change-pending-after-exit [ "${pending}" -eq 1 ]
	expect vm:wg-change-waits-after-exit waited_before_change "${peers}" "${state}/after"
	expect vm:wg-change-key-kept wg_key_is "${before}"
	expect vm:wg-change-applied peers_are $((peers + 1))
	expect vm:wg-change-mode wg_conf_settled
	cp "${state}/local.conf.kept" local.conf
	finish
}

"${1:-check}"
