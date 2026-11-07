#!/bin/sh
[ $# -le 1 ] || { echo "usage: sh test.sh [DEPLOY_KEY] (run as root on the server, from this folder; with DEPLOY_KEY, it also deploys test pages with the private deploy key, which replaces the site and the app pages, so use it only before the real deploy)" >&2; exit 2; }
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
t "configs: relayd" relayd -n
t "configs: pf" pfctl -nf /etc/pf.conf
t "install.sh: each mv has -f, so no file question can stop the run" not grep -E '(^|[;|&]|sh -c .)[[:space:]]*mv [^-]' install.sh
t "sshd: no root login" sshd_has 'permitrootlogin no'
t "sshd: keys only" sshd_has 'authenticationmethods publickey'
t "admin keys: VPN only" not grep -qv '^from="10.8.0.0/24,127.0.0.1" ssh-' "/home/${ADMIN_USER:?}/.ssh/authorized_keys"
t "jobs in crontab" has_job

deploy_ssh() {
	ssh -i "$1" -o StrictHostKeyChecking=accept-new -o BatchMode=yes deploy@127.0.0.1 "$2"
}
deploy_pages() {
	tar -czf - -C "${p}" index.html play lullapixie marklove | deploy_ssh "$1" site
}
deploy_app() {
	tar -czf - -C "${p}" index.html | deploy_ssh "$1" apps/test
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
	t "deploy: app" deploy_app "$1"
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

p=$(mktemp -d)
ssh-keygen -q -t ed25519 -N '' -f "${p}/key"
a=/home/tunnel/.ssh/authorized_keys
cp "${a}" "${p}/keys"
tunnel_pub=$(cat "${p}/key.pub")
echo "from=\"10.8.0.0/24,127.0.0.1\" ${tunnel_pub}" >> "${a}"
tunnel_up() {
	ssh -i "${p}/key" -o UserKnownHostsFile="${p}/known" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ExitOnForwardFailure=yes tunnel@127.0.0.1 "$@" </dev/null >/dev/null 2>&1 & q=$!
}
tunnel() {
	tunnel_up "$@"
	sleep 3
	kill -9 "${q}" 2>/dev/null
	wait "${q}"
}
tunnel_waits() {
	tunnel touch "/tmp/tunnel-${d}"
	status=$?
	[ "${status}" = 137 ] && [ ! -e "/tmp/tunnel-${d}" ]
}
tunnel_refused() {
	tunnel -N -R "$1"
	status=$?
	[ "${status}" = 255 ]
}
no_server_connection() {
	! ssh -i "${p}/key" -o UserKnownHostsFile="${p}/known" -o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ExitOnForwardFailure=yes tunnel@127.0.0.1 -W 127.0.0.1:22 </dev/null 2>/dev/null | grep -q SSH-
}
t "tunnel: a login runs no command and only waits" tunnel_waits
t "tunnel: no tunnel on a public address" tunnel_refused 0.0.0.0:4387:127.0.0.1:80
t "tunnel: no tunnel on 127.0.0.1" tunnel_refused 127.0.0.1:4387:127.0.0.1:80
t "tunnel: no tunnel on another port" tunnel_refused 10.8.0.1:4389:127.0.0.1:80
t "tunnel: no connection from the server" no_server_connection

front() {
	if [ $# -ge 4 ]; then o=$4; else o="Origin: https://$1\r\n"; fi
	printf 'GET %s HTTP/1.1\r\nHost: %s\r\n%b%b\r\n' "${3:-/x}" "$1" "${o}" "$2" |
	openssl s_client -quiet -connect 10.8.0.1:443 -servername "$1" >/dev/null 2>&1 & f=$!
	sleep 2
	kill "${f}" 2>/dev/null
	wait "${f}"
}
listen() {
	netstat -an -p tcp | awk '$NF == "LISTEN" && $4 ~ /\.(4387|4388)$/ { print $4 }' | sort | tr '\n' ' '
}
real_tunnel_open() {
	netstat -an -p tcp | awk '$NF == "LISTEN" { print $4 }' | grep -qE '^10\.8\.0\.1\.(4387|4388)$'
}
headers_match() {
	with_header=$(grep -ci "^$2:" "$1")
	requests=$(grep -c '^GET ' "$1")
	[ "${with_header}" = "${requests}" ] && ! grep -i "^$2:" "$1" | grep -vqix "$2: $3"
}
desk_gets_host() {
	headers_match "${p}/k" Host 127.0.0.1:4387 && grep -q '^GET /x' "${p}/k"
}
reaches_no_app() {
	! cat "${p}/m" "${p}/k" | grep -qE '^GET /(evil|cross)' && ! grep -q evil "${p}/m" "${p}/k"
}
blocked_reply() {
	(printf 'GET /x HTTP/1.1\r\nHost: mac.lavish.teoyujie.org\r\n%b\r\n' "$1"; sleep 2) |
	openssl s_client -quiet -connect 10.8.0.1:443 -servername mac.lavish.teoyujie.org 2>/dev/null
}
blocked_status() {
	blocked_reply "$1" | head -n 1 | cut -d' ' -f2
}
blocked_page() {
	blocked_reply 'Origin: https://evil.example\r\n' > "${p}/blk"
	head -n 1 "${p}/blk" | grep -q ' 403 ' && grep -q 'Mechanical Engineer' "${p}/blk"
}
get_count() {
	cat "${p}/m" "${p}/k" | grep -c '^GET '
}
listens_only_on_vpn() {
	echo "${l}" | grep -q 10.8.0.1 || return 1
	others=$(echo "${l}" | tr ' ' '\n' | grep -vxE '10\.8\.0\.1\.(4387|4388)')
	[ -z "${others}" ]
}
if real_tunnel_open; then
	echo "skip the test tunnels and the tests of relayd to the apps: a real tunnel is open"
	l=$(listen)
else
	nc -dlk 127.0.0.1 9471 > "${p}/mac" & n1=$!
	nc -dlk 127.0.0.1 9473 > "${p}/desk" & n3=$!
	tunnel_up -N -R 10.8.0.1:4387:127.0.0.1:9471 -R 10.8.0.1:4388:127.0.0.1:9473
	sleep 3
	l=$(listen)
	front teoyujie.org ''
	front mac.lavish.teoyujie.org ''
	front desk.lavish.teoyujie.org '' /x ''
	front mac.lavish.teoyujie.org 'Origin: https://evil.example\r\n' /evil ''
	front mac.lavish.teoyujie.org 'Origin: https://desk.lavish.teoyujie.org\r\n' /evil ''
	front desk.lavish.teoyujie.org 'Origin: https://mac.lavish.teoyujie.org\r\n' /evil ''
	front mac.lavish.teoyujie.org '' /plain ''
	front desk.lavish.teoyujie.org '' /same
	kill -9 "${q}"
	wait "${q}" 2>/dev/null
	kill "${n1}" "${n3}"
	tr -d '\r' < "${p}/mac" > "${p}/m"
	tr -d '\r' < "${p}/desk" > "${p}/k"
	t "relayd: mac.lavish.teoyujie.org goes to Lavish on the Mac with Host 127.0.0.1:4387" headers_match "${p}/m" Host 127.0.0.1:4387
	t "relayd: Lavish on the Mac gets Origin http://127.0.0.1:4387" headers_match "${p}/m" Origin http://127.0.0.1:4387
	t "relayd: desk.lavish.teoyujie.org goes to Lavish on the desktop with Host 127.0.0.1:4387" desk_gets_host
	t "relayd: Lavish on the desktop gets Origin http://127.0.0.1:4387" grep -qix 'Origin: http://127.0.0.1:4387' "${p}/k"
	t "relayd: another Origin or a cross-site request reaches no app" reaches_no_app
	t "relayd: another Origin gets 403" is_eq 403 blocked_status 'Origin: https://evil.example\r\n'
	t "relayd: Sec-Fetch-Site cross-site gets 403" is_eq 403 blocked_status 'Sec-Fetch-Site: cross-site\r\n'
	t "relayd: the 403 has the style of the site error page" blocked_page
	t "relayd: Lavish on the Mac gets a request with no Origin" grep -q '^GET /plain' "${p}/m"
	t "relayd: desk.lavish.teoyujie.org passes its own Origin" grep -q '^GET /same' "${p}/k"
	t "relayd: another name goes to no app" is_eq 4 get_count
fi
t "tunnel: the ports listen only on 10.8.0.1" listens_only_on_vpn
cp "${p}/keys" "${a}"
rm -r "${p}"

pf_public_only() {
	! pfctl -sr | grep '^pass' | grep -v '^pass out' | grep -v '^pass on wg0 ' | grep -vE '^pass in on egress .*to \(egress\) port = (22|25|80|443|51820)( |$)|^pass in on egress .*proto [a-z0-9-]*icmp'
}
pub() {
	printf 'GET %s HTTP/1.0\r\nHost: %s\r\n\r\n' "$3" "$2" |
	if [ "$1" = 80 ]; then nc -w 3 "${egress_ip}" 80; else openssl s_client -quiet -connect "${egress_ip}:443" -servername "$2"; fi 2>/dev/null | head -n 1
}
vpn_resolves() {
	a_record=$(dig +short @10.8.0.1 "$1.teoyujie.org" A)
	aaaa_record=$(dig +short @10.8.0.1 "$1.teoyujie.org" AAAA)
	[ "${a_record}" = 10.8.0.1 ] && [ -z "${aaaa_record}" ]
}
vpn_http_redirects() {
	printf 'GET /a HTTP/1.0\r\nHost: %s.teoyujie.org\r\n\r\n' "$1" | nc -w 3 10.8.0.1 80 | tr -d '\r' | grep -qx "Location: https://$1.teoyujie.org/a"
}
acme_on_private_name() {
	pub 80 mac.lavish.teoyujie.org /.well-known/acme-challenge/x | grep -q ' 404 '
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
for n in mac.lavish desk.lavish; do
	t "private names: ${n}.teoyujie.org is 10.8.0.1 on the VPN" vpn_resolves "${n}"
	t "private names: https://${n}.teoyujie.org gives nothing on the public address" is_eq '' pub 443 "${n}.teoyujie.org" /
	t "private names: http://${n}.teoyujie.org gives nothing on the public address" is_eq '' pub 80 "${n}.teoyujie.org" /
	t "private names: http://${n}.teoyujie.org on the VPN goes to HTTPS" vpn_http_redirects "${n}"
done
t "private names: the public address answers the ACME challenge" acme_on_private_name
t "VPN: wg0 has all peers" wg_has_all_peers
blocked_name=$(sed -n '1s/^local-zone: "\(.*\)" always_nxdomain$/\1/p' /var/unbound/etc/blocklist.conf)
t "DNS: blocklist loaded" blocklist_loaded
t "DNS: other names resolve" other_names_resolve
t "health-check runs" /usr/local/sbin/health-check

if [ "${fails}" -eq 0 ]; then echo "all tests passed"; else echo "${fails} tests failed"; exit 1; fi
