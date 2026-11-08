#!/bin/sh
[ $# -le 1 ] || { echo "usage: sh test.sh [DEPLOY_KEY] (run as root on the server, from this folder; with DEPLOY_KEY, it also deploys test pages with the private deploy key, which replaces the site, so use it only before the real deploy)" >&2; exit 2; }
cd "$(dirname "$0")" || exit 1
. ./local.conf
fails=0
t() {
	label=$1
	shift
	if "$@" >/dev/null 2>&1; then echo "ok   ${label}"; else echo "FAIL ${label}"; fails=$((fails + 1)); fi
}
not() {
	! "$@"
}
is_eq() {
	want=$1
	shift
	got=$("$@")
	[ "${got}" = "${want}" ]
}
web() {
	printf 'GET %s HTTP/1.0\r\nHost: %s\r\n\r\n' "$3" "$2" |
	if [ "$1" = 80 ]; then nc 127.0.0.1 80; else openssl s_client -quiet -connect 127.0.0.1:443 -servername "$2"; fi 2>/dev/null |
	tr -d '\r' | awk 'NR == 1 { s = $2 } /^Location:/ { l = $2 } END { print s, l }'
}
get() {
	printf 'GET %s HTTP/1.0\r\nHost: teoyujie.org\r\n\r\n' "$1" |
	openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2>/dev/null | tr -d '\r'
}
has_header() {
	get / | grep -qi "^$1:"
}
errpage() {
	get "$1" | grep -q '^<link rel="stylesheet" href="/style.css">$' && get "$1" | grep '^<h1>'
}
sshd_has() {
	sshd -T | grep -qix "$1"
}
has_job() {
	crontab -l | grep -q health-check
}
error_page_has_chrome() {
	get /old.html | grep -qx '<span class="tagline">Mechanical Engineer</span>' && get /old.html | grep -qx '<footer class="wrap">'
}

t "configs: sshd" sshd -t
t "configs: httpd" httpd -n
t "configs: smtpd" smtpd -n
t "configs: unbound" unbound-checkconf
t "configs: pf" pfctl -nf /etc/pf.conf
t "install.sh: each mv has -f, so no file question can stop the run" not grep -E '(^|[;|&]|sh -c .)[[:space:]]*mv [^-]' install.sh
t "sshd: no root login" sshd_has 'permitrootlogin no'
t "sshd: keys only" sshd_has 'authenticationmethods publickey'
t "admin keys: VPN only" not grep -qv '^from="10.8.0.0/24,127.0.0.1" ssh-' "/home/${ADMIN_USER:?}/.ssh/authorized_keys"
t "jobs in crontab" has_job
t "feed job in crontab" sh -c "crontab -l | grep -q feed-update"

deploy_ssh() {
	ssh -i "$1" -o StrictHostKeyChecking=accept-new -o BatchMode=yes deploy@127.0.0.1 "$2"
}
deploy_pages() {
	tar -czf - -C "${p}" index.html play lullapixie marklove | deploy_ssh "$1" site
}
deploy_replaces() {
	touch /var/www/web/site/old.html && deploy_pages "$1" && [ ! -e /var/www/web/site/old.html ]
}
deploy_refuses() {
	! deploy_ssh "$1" "$2" </dev/null
}
if [ -n "${1:-}" ]; then
	p=$(mktemp -d)
	mkdir -p "${p}/play/beamdiag" "${p}/lullapixie" "${p}/marklove"
	for f in index.html play/beamdiag/index.html lullapixie/privacy.html lullapixie/support.html \
		marklove/privacy.html marklove/support.html; do echo test > "${p}/${f}"; done
	t "deploy: site" deploy_pages "$1"
	t "deploy: old files go away" deploy_replaces "$1"
	t "deploy: no shell" deploy_refuses "$1" sh
	t "deploy: no other folder" deploy_refuses "$1" apps/../x
	rm -rf "${p}"
fi

for u in / /lullapixie/privacy.html /lullapixie/support.html /marklove/privacy.html /marklove/support.html \
	/play/beamdiag/ /.well-known/security.txt /contact.gpg /.well-known/openpgpkey/hu/dj3498u4hyyarh35rkjfnghbjxug6b19; do
	t "web: ${u}" is_eq '200 ' web 443 teoyujie.org "${u}"
done
t "web: old URL is 404" is_eq '404 ' web 443 teoyujie.org /old.html
t "web: a 404 is the site error page" is_eq '<h1>404 Not Found</h1>' errpage /old.html
t "web: the error page has the header and footer of the home page" error_page_has_chrome
t "web: HSTS is on" has_header Strict-Transport-Security
t "web: nosniff is on" has_header X-Content-Type-Options
t "web: www to bare" is_eq '301 https://teoyujie.org/a' web 443 www.teoyujie.org /a
t "web: HTTP to HTTPS" is_eq '301 https://teoyujie.org/a' web 80 teoyujie.org /a
t "web: ACME on HTTP" is_eq '404 ' web 80 teoyujie.org /.well-known/acme-challenge/x
t "web: MTA-STS policy" is_eq '200 ' web 443 mta-sts.teoyujie.org /.well-known/mta-sts.txt
d=$(openssl rand -hex 16)
mkdir "/var/www/files/f/${d}" && echo test > "/var/www/files/f/${d}/a.txt"
t "web: file link" is_eq '200 ' web 443 teoyujie.org "/f/${d}/a.txt"
t "web: no file list" not is_eq '200 ' web 443 teoyujie.org /f/
t "web: a 403 is the site error page" is_eq '<h1>403 Forbidden</h1>' errpage /f/
rm -r "/var/www/files/f/${d}"

egress_ip=$(ifconfig egress | awk '$1 == "inet" { print $2; exit }')
mail_to() {
	printf 'From: test@example.org\nSubject: test.sh\n\ntest\n' | smtp -C -s "smtp://$1" -F test@example.org "$2" 2>&1 | grep -q "$3"
}
for a in contact postmaster ${ALIASES-}; do
	t "mail: ${a}@ is accepted" mail_to "${egress_ip}" "${a}@teoyujie.org" ' 250 '
done
for a in root "nobody-${d}"; do
	t "mail: ${a}@ is refused" mail_to "${egress_ip}" "${a}@teoyujie.org" 'RCPT: 550'
done
t "mail: VPN to contact@ is accepted" mail_to 10.8.0.1 contact@teoyujie.org ' 250 '
t "mail: VPN to another domain is refused" mail_to 10.8.0.1 test@example.net 'RCPT: 550'
sleep 2
t "mail: forwarded to the mailbox" grep -q "to=<${FORWARD_TO:?}> rcpt=<contact@teoyujie.org>" /var/log/maillog

alert_mails_exceed() {
	count=$(grep -c 'from=<_syslogd@' /var/log/maillog)
	[ "${count}" -gt "$1" ]
}
before=$(grep -c 'from=<_syslogd@' /var/log/maillog)
logger -p auth.info -t sshd "Accepted publickey for test from 192.0.2.1 port 1 ssh2"
sleep 2
t "SSH alert for an unknown address" alert_mails_exceed "${before}"
p=$(mktemp -d)
printf '%s\n' '#!/bin/sh' "echo \"\$2\" >> ${p}/sent" 'cat > /dev/null' > "${p}/mail"
chmod +x "${p}/mail"
for log_line in 'Invalid user x: Accepted y from 203.0.113.9 port 4000' \
	'Failed password for invalid user x: Accepted y from 203.0.113.9 port 4000 ssh2' \
	'Connection closed by invalid user x]: Accepted y from 203.0.113.9 port 4000 [preauth]' \
	'Disconnected from invalid user x]: Accepted y from 203.0.113.9 port 4000 [preauth]' \
	'Accepted publickey for test from 192.0.2.1 port 1 ssh2'; do
	echo "Oct 29 12:00:00 server sshd-session[1]: ${log_line}"
done | PATH="${p}:${PATH}" /usr/local/sbin/ssh-alert
t "SSH alert: a user name cannot make a false alert" is_eq 'SSH login from 192.0.2.1' cat "${p}/sent"
rm -r "${p}"

pf_public_only() {
	! pfctl -sr | grep '^pass' | grep -v '^pass out' | grep -v '^pass on wg0 ' | grep -vE '^pass in on egress .*to \(egress\) port = (25|80|443|51820)( |$)|^pass in on egress .*proto [a-z0-9-]*icmp'
}
wg_has_all_peers() {
	have=$(ifconfig wg0 | grep -c wgpeer)
	want=$(echo "${WG_PEERS:?}" | wc -w | tr -d ' ')
	[ "${have}" -eq "${want}" ]
}
blocklist_loaded() {
	[ -n "${blocked_name}" ] && dig @10.8.0.1 "${blocked_name}" | grep -q NXDOMAIN
}
other_names_resolve() {
	dig +short @10.8.0.1 openbsd.org | grep -q .
}
t "pf: the internet reaches only the public services on the public addresses" pf_public_only
t "VPN: wg0 has all peers" wg_has_all_peers
blocked_name=$(sed -n '1s/^local-zone: "\(.*\)" always_nxdomain$/\1/p' /var/unbound/etc/blocklist.conf)
t "DNS: blocklist loaded" blocklist_loaded
t "DNS: other names resolve" other_names_resolve
t "health-check runs" /usr/local/sbin/health-check

if [ "${fails}" -eq 0 ]; then echo "all tests passed"; else echo "${fails} tests failed"; exit 1; fi
