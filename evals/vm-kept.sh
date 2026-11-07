#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
work=$(mktemp -d)
chmod 755 "${work}"
trap 'rm -rf "${work}"' EXIT HUP INT TERM

https() {
	openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2>/dev/null | tr -d '\r'
}

is_eq() {
	want=$1
	shift
	got=$("$@")
	[ "${got}" = "${want}" ]
}

get() {
	printf 'GET %s HTTP/1.0\r\nHost: teoyujie.org\r\n\r\n' "$1" | https
}

status_of() {
	get "$1" | awk 'NR == 1 { print $2 }'
}

site_stub() {
	rm -rf "${work}/stub"
	mkdir -p "${work}/stub/x/site-new/public" "${work}/bin"
	cp -R /var/www/web/site/. "${work}/stub/x/site-new/public"
	echo test > "${work}/stub/x/site-new/public/site-update-test.html"
	echo "$1" > "${work}/stub/x/site-new/fixed-urls.txt"
	tar -czf "${work}/site.tgz" -C "${work}/stub/x" .
	cp evals/fixtures/fake-ftp "${work}/bin/ftp"
	chmod 755 "${work}/bin/ftp"
	chmod 644 "${work}/site.tgz"
}

run_site_update() {
	saved=$(cat /home/deploy/site-commit 2>/dev/null)
	commit=$(echo "$1" | sha1)
	out=$(su deploy -c "PATH=${work}/bin:\$PATH STUB_COMMIT=${commit} STUB_TGZ=${work}/site.tgz /usr/local/sbin/site-update" 2>&1)
	written=$(cat /home/deploy/site-commit 2>/dev/null)
	if [ -n "${saved}" ]; then echo "${saved}" > /home/deploy/site-commit; else rm -f /home/deploy/site-commit; fi
}

site_update_restores() {
	site_stub /no-such-page
	run_site_update bad
	[ ! -e /var/www/web/site/site-update-test.html ] && echo "${out}" | grep -q 'gave 404 for /no-such-page, so the previous site is back'
}

site_update_deploys() {
	site_stub /site-update-test.html
	run_site_update good
	is_eq 200 status_of /site-update-test.html && is_eq "${commit}" echo "${written}" && [ -z "${out}" ]
	result=$?
	rm -f /var/www/web/site/site-update-test.html
	return "${result}"
}

site_update_offline() {
	su deploy -c /usr/local/sbin/site-update > "${work}/offline" 2>&1
}

outbound_blocked() {
	! nc -z -w 3 1.1.1.1 443 && ! nc -z -w 3 2606:4700:4700::1111 443 && nc -z -w 3 127.0.0.1 443
}

cron_isolated() {
	crontab -l | grep -qx 'SHELL=/usr/bin/true'
}

expect vm:kept-site-update-restores site_update_restores
expect vm:kept-site-update-deploys site_update_deploys
expect vm:kept-site-update-offline site_update_offline
expect vm:kept-cron-isolated cron_isolated
expect vm:kept-outbound-blocked outbound_blocked
finish
