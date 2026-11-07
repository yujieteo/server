#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
work=$(mktemp -d)
chmod 755 "${work}"
trap 'rm -rf "${work}"' EXIT HUP INT TERM
d=$(openssl rand -hex 16)

https() {
	openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2>/dev/null | tr -d '\r'
}

size_of() {
	wc -c < "$1" | tr -d ' '
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

serves() {
	get "$1" > "${work}/reply"
	head -n 1 "${work}/reply" | grep -q ' 200 ' && grep -qi "^Content-Type: $2" "${work}/reply"
}

post() {
	length=$(size_of "$1")
	signature=$(cat "$2" 2>/dev/null)
	{ printf 'POST /pond/entry HTTP/1.0\r\nHost: teoyujie.org\r\nContent-Length: %s\r\nSignature: %s\r\n\r\n' "${length}" "${signature}"; cat "$1"; } |
		https | awk 'NR == 1 { print $2 }'
}

signed_entry() {
	printf '{"entry":{"date":"2026-10-28","title":"kept"},"id":"test-%s","key":"test-%s","op":"put","rev":%s,"v":1}' "${d}" "${d}" "$1" > "${work}/$1"
	openssl dgst -sha256 -sign "${work}/key.pem" < "${work}/$1" | openssl base64 -A > "${work}/$1.sig"
}

pond_keys() {
	openssl ecparam -name prime256v1 -genkey -noout -out "${work}/key.pem"
	openssl pkey -in "${work}/key.pem" -pubout -outform DER | openssl base64 -A > "/var/www/pond/keys/test-${d}.pub"
	for rev in 1 2 3; do signed_entry "${rev}"; done
	printf '%8193s' '' > "${work}/big"
}

post_is() {
	is_eq "$1" post "${work}/$2" "${work}/$3"
}

pond_save() {
	post_is 201 2 2.sig && cmp -s "${work}/2" "/var/www/pond/entries/test-${d}.json"
}

pond_refusals() {
	post_is 200 2 2.sig &&
		post_is 409 1 1.sig &&
		post_is 403 3 2.sig &&
		post_is 413 big none &&
		cmp -s "${work}/2" "/var/www/pond/entries/test-${d}.json"
}

pond_reads() {
	serves /pond/entries.json application/json && serves /log/ text/html && serves /log/feed.xml application/rss+xml
}

room_status() {
	length=$(size_of "$1")
	{ printf 'POST /play/neurons/room HTTP/1.0\r\nHost: teoyujie.org\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n' "${length}"; cat "$1"; } |
		https | awk 'NR == 1 { print $2 }'
}

room_is() {
	is_eq "$1" room_status "${work}/room-$2"
}

room_body() {
	printf '{"op":"%s","room":"%s","member":"member-a","name":"test","since":-1}' "$1" "${room}" > "${work}/room-$1"
}

room_works() {
	room=$(openssl rand -hex 11)
	room_body create
	room_body poll
	printf '{"op":"poll","room":"%s","member":"member-a","name":"%8193s"}' "${room}" '' > "${work}/room-big"
	room_is 200 create && room_is 409 create && room_is 200 poll && room_is 413 big && is_eq 405 status_of /play/neurons/room
}

site_stub() {
	mkdir -p "${work}/stub/x/site-bad/public" "${work}/bin"
	cp -R /var/www/web/site/. "${work}/stub/x/site-bad/public"
	echo test > "${work}/stub/x/site-bad/public/site-update-test.html"
	echo /no-such-page > "${work}/stub/x/site-bad/fixed-urls.txt"
	tar -czf "${work}/site.tgz" -C "${work}/stub/x" .
	cp evals/fixtures/fake-ftp "${work}/bin/ftp"
	chmod 755 "${work}/bin/ftp"
	chmod 644 "${work}/site.tgz"
}

site_update_restores() {
	site_stub
	saved=$(cat /home/deploy/site-commit 2>/dev/null)
	commit=$(echo bad | sha1)
	out=$(su deploy -c "PATH=${work}/bin:\$PATH STUB_COMMIT=${commit} STUB_TGZ=${work}/site.tgz /usr/local/sbin/site-update" 2>&1)
	if [ -n "${saved}" ]; then echo "${saved}" > /home/deploy/site-commit; else rm -f /home/deploy/site-commit; fi
	[ ! -e /var/www/web/site/site-update-test.html ] && echo "${out}" | grep -q 'gave 404 for /no-such-page, so the previous site is back'
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

binaries_kept() {
	id _neuronsroom && [ -x /usr/local/sbin/neurons_room ] && [ -x /var/www/cgi-bin/pond_save ] && [ -x /var/www/cgi-bin/pond_read ]
}

pond_keys
expect vm:kept-services-run rcctl check slowcgi neurons_room
expect vm:kept-binaries binaries_kept
expect vm:kept-pond-save pond_save
expect vm:kept-pond-refusals pond_refusals
expect vm:kept-pond-reads pond_reads
expect vm:kept-room room_works
expect vm:kept-site-update-restores site_update_restores
expect vm:kept-site-update-offline site_update_offline
expect vm:kept-cron-isolated cron_isolated
expect vm:kept-outbound-blocked outbound_blocked
rm -f "/var/www/pond/keys/test-${d}.pub" "/var/www/pond/entries/test-${d}.json"
finish
