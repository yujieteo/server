#!/bin/sh
# Two sets of checks, one for each place a fault can show:
#   sh test.sh [DEPLOY_KEY]   on the server, as root, from the source folder (./apply --test runs it).
#                             With DEPLOY_KEY it also deploys test pages, which replaces the site.
#   sh test.sh --outside      on any other machine: what the internet sees, and what a VPN peer sees.
cd "$(dirname "$0")" || exit 1
fails=0
t() {
	label=$1
	shift
	if "$@" > /dev/null 2>&1; then echo "ok   ${label}"; else echo "FAIL ${label}"; fails=$((fails + 1)); fi
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
# Both sets ask the web server the same questions: the server at its public address, an outside machine by name.
get() {
	printf 'GET %s HTTP/1.0\r\nHost: %s\r\n\r\n' "$2" "$1" |
		openssl s_client -quiet -connect "${web}:443" -servername "$1" 2> /dev/null | tr -d '\r'
}
status() {
	if [ "$1" = 80 ]; then printf 'GET %s HTTP/1.0\r\nHost: %s\r\n\r\n' "$3" "$2" | nc -w 10 "${web}" 80 | tr -d '\r'; else get "$2" "$3"; fi |
		awk 'NR == 1 { s = $2 } /^Location:/ { l = $2 } END { print s, l }'
}
# grep reads to the end: a client that stops early can leave openssl waiting.
has_header() {
	get teoyujie.org "$1" | grep -i "^$2"
}
web_checks() {
	for u in / /.well-known/security.txt /contact.gpg /.well-known/openpgpkey/hu/dj3498u4hyyarh35rkjfnghbjxug6b19; do
		t "web: ${u}" is_eq '200 ' status 443 teoyujie.org "${u}"
	done
	t "web: a missing page is 404" is_eq '404 ' status 443 teoyujie.org /no-such-page.html
	t "web: HSTS is on" has_header / 'Strict-Transport-Security: max-age=31536000'
	t "web: nosniff is on" has_header / X-Content-Type-Options:
	t "web: pages load only from this site" has_header / "Content-Security-Policy: default-src 'self'"
	t "web: feed pages run no script" has_header /reading.html "Content-Security-Policy: default-src 'none'"
	t "web: www to bare" is_eq '301 https://teoyujie.org/a' status 443 www.teoyujie.org /a
	t "web: HTTP to HTTPS" is_eq '301 https://teoyujie.org/a' status 80 teoyujie.org /a
	t "web: ACME on HTTP" is_eq '404 ' status 80 teoyujie.org /.well-known/acme-challenge/x
	t "web: MTA-STS policy" is_eq '200 ' status 443 mta-sts.teoyujie.org /.well-known/mta-sts.txt
	t "web: no file list" not is_eq '200 ' status 443 teoyujie.org /f/
}
finish() {
	if [ "${fails}" -eq 0 ]; then echo "all tests passed"; exit 0; fi
	echo "${fails} tests failed"
	exit 1
}

if [ "${1-}" = --outside ]; then
	web=teoyujie.org
	open() {
		nc -z -w 8 "$@"
	}
	banner() {
		nc -w 8 "$@" < /dev/null | grep -qE '^(220|550) '
	}
	certificate_lasts() {
		openssl s_client -connect "$1" -servername teoyujie.org < /dev/null 2> /dev/null | openssl x509 -noout -checkend 1209600
	}
	for family in 4 6; do
		# A machine with no IPv6 route cannot judge the IPv6 address. The line stays visible.
		if [ "${family}" = 6 ] && ! open -6 2620:fe::fe 443 2> /dev/null; then echo "SKIP IPv6: this machine has no IPv6 route"; continue; fi
		for port in 80 443; do t "IPv${family}: port ${port} is open" open "-${family}" teoyujie.org "${port}"; done
		t "IPv${family}: port 25 answers as a mail server" banner "-${family}" teoyujie.org 25
		for port in 22 53 465 587; do t "IPv${family}: port ${port} is closed" not open "-${family}" teoyujie.org "${port}"; done
	done
	t "TLS: the certificate lasts 14 days or more" certificate_lasts teoyujie.org:443
	t "TLS: version 1.1 is refused" not sh -c 'openssl s_client -tls1_1 -connect teoyujie.org:443 < /dev/null 2>&1 | grep -q "Cipher is [A-Z]"'
	web_checks
	if open 10.8.0.1 22 2> /dev/null; then
		t "VPN: the resolver blocks a listed name" sh -c 'dig @10.8.0.1 use-application-dns.net | grep -q NXDOMAIN'
		t "VPN: the resolver answers for other names" sh -c 'dig +short @10.8.0.1 openbsd.org | grep -q .'
	else
		echo "SKIP VPN: this machine does not reach 10.8.0.1"
	fi
	finish
fi

[ $# -le 1 ] || { echo "usage: sh test.sh [DEPLOY_KEY] | sh test.sh --outside" >&2; exit 2; }
. ./local.conf
web=$(ifconfig egress | awk '$1 == "inet" { print $2; exit }')
as() {
	user=$1
	shift
	su -s /bin/sh "${user}" -c "$*"
}

t "live equals rendered: install.sh --check finds no drift" sh -c 'sh install.sh --check | grep -qx "No drift."'
t "root's own crontab holds none of these jobs" not sh -c 'crontab -l | grep -q /usr/local/sbin'
t "sshd: no root login" sh -c "sshd -T | grep -qix 'permitrootlogin no'"
t "sshd: keys only" sh -c "sshd -T | grep -qix 'authenticationmethods publickey'"
t "sshd: deploy runs only deploy-only" sh -c "sshd -T -C user=deploy,host=x,addr=10.8.0.2 | grep -qix 'forcecommand /usr/local/sbin/deploy-only'"
t "admin keys: VPN only" not grep -qv '^from="10.8.0.0/24" ssh-' "/home/${ADMIN_USER:?}/.ssh/authorized_keys"

deploy_ssh() {
	ssh -i "$1" -o StrictHostKeyChecking=accept-new -o BatchMode=yes deploy@10.8.0.1 "$2"
}
deploy_pages() {
	tar -czf - -C "${p}" index.html | deploy_ssh "$1" site
}
deploy_replaces() {
	touch /var/www/web/site/old.html && deploy_pages "$1" && [ ! -e /var/www/web/site/old.html ]
}
deploy_refuses() {
	! deploy_ssh "$1" "$2" < /dev/null
}
if [ -n "${1:-}" ]; then
	p=$(mktemp -d)
	echo test > "${p}/index.html"
	t "deploy: site" deploy_pages "$1"
	t "deploy: old files go away" deploy_replaces "$1"
	t "deploy: no shell" deploy_refuses "$1" sh
	t "deploy: no other folder" deploy_refuses "$1" apps/../x
	rm -rf "${p}"
fi

web_checks
d=$(openssl rand -hex 16)
mkdir "/var/www/files/f/${d}" && echo test > "/var/www/files/f/${d}/a.txt"
t "web: file link" is_eq '200 ' status 443 teoyujie.org "/f/${d}/a.txt"
rm -r "/var/www/files/f/${d}"

# Each user writes its own folder and no other. A feed job, once confined, reaches nothing else at all.
confined="require '/usr/local/sbin/feed-common.pl'; confine('/var/www/feed');"
t "feed user: writes the feed folder" as _feed 'touch /var/www/feed/.test && rm /var/www/feed/.test'
t "feed user: cannot write the site" not as _feed 'touch /var/www/web/site/.test'
t "deploy user: cannot write the feed folder" not as deploy 'touch /var/www/feed/.test'
t "web server: cannot write the site or the feed folder" not as www 'touch /var/www/web/site/.test || touch /var/www/feed/.test'
t "feed job: cannot write outside its folder" not as _feed "perl -e \"${confined} open(F, '>', '/tmp/.test') or exit 1\""
t "feed job: cannot read outside its folder" not as _feed "perl -e \"${confined} open(F, '<', '/etc/passwd') or exit 1\""
t "feed job: runs no program but ftp" not as _feed "perl -e \"${confined} exec('/bin/sh', '-c', 'true'); exit 1\""
# Once a job parses, the kernel kills it for running any program: status 134.
killed() {
	as _feed "$1"
	[ "$?" -eq 134 ]
}
t "feed job: the kernel kills it if it runs a program once it parses" killed "perl -e \"${confined} fetched(); exec('/usr/bin/ftp', '-h')\""

mail_to() {
	printf 'From: test@example.org\nSubject: test.sh\n\ntest\n' | smtp -C -s "smtp://$1" -F test@example.org "$2" 2>&1 | grep -q "$3"
}
for a in contact postmaster ${ALIASES-}; do
	t "mail: ${a}@ is accepted" mail_to "${web}" "${a}@teoyujie.org" ' 250 '
done
for a in root "nobody-${d}"; do
	t "mail: ${a}@ is refused" mail_to "${web}" "${a}@teoyujie.org" 'RCPT: 550'
done
t "mail: VPN to contact@ is accepted" mail_to 10.8.0.1 contact@teoyujie.org ' 250 '
t "mail: VPN to another domain is refused" mail_to 10.8.0.1 test@example.net 'RCPT: 550'
sleep 2
t "mail: forwarded to the mailbox" grep -q "to=<${FORWARD_TO:?}> rcpt=<contact@teoyujie.org>" /var/log/maillog
t "mail: each listener for this server's own mail signs with DKIM" not sh -c "grep '^listen' /etc/mail/smtpd.conf | grep -v 'tag internet' | grep -qv dkimsign"
t "mail: leaves only over checked TLS" grep -q '^action "outbound" relay srs tls$' /etc/mail/smtpd.conf

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
	! pfctl -sr | grep '^pass in' | grep -vE '^pass in on egress .*to \(egress\) port = (25|80|443|51820)( |$)|^pass in on egress .*proto [a-z0-9-]*icmp'
}
blocked_packets() {
	pfctl -sl | awk '$1 == "outbound" { n += $3 } END { print n + 0 }'
}
# The connection fails, and the rule that health-check watches counts it.
blocked() {
	before=$(blocked_packets)
	! as "$1" "nc -z -w 3 $2 $3" && [ "$(blocked_packets)" -gt "${before}" ]
}
logged() {
	pkill -ALRM -u root -U root -x pflogd
	sleep 3
	tcpdump -ner /var/log/pflog outbound 2> /dev/null | grep -q .
}
start=$(blocked_packets)
t "pf: the internet reaches only the public services on the public addresses" pf_public_only
t "pf: the flood table exists" pfctl -t flood -T show
t "pf: the feed user reaches HTTPS" as _feed 'nc -z -w 8 cdn.openbsd.org 443'
t "pf: the feed user reaches no other port" blocked _feed cdn.openbsd.org 80
t "pf: the feed user reaches no VPN peer" blocked _feed 10.8.0.2 22
t "pf: the web server user reaches nothing" blocked www cdn.openbsd.org 443
t "pf: the mail user reaches only mail servers" blocked _smtpd cdn.openbsd.org 443
t "pf: blocked packets are in the log" logged
# These checks made the count that health-check reports. Clear it, unless it held a real one before.
[ "${start}" -ne 0 ] || pfctl -z

wg_has_all_peers() {
	have=$(ifconfig wg0 | grep -c wgpeer)
	want=$(echo "${WG_PEERS:?}" | wc -w | tr -d ' ')
	[ "${have}" -eq "${want}" ]
}
no_such_name() {
	[ -n "$1" ] && dig @10.8.0.1 "$1" | grep -q NXDOMAIN
}
t "VPN: wg0 has all peers" wg_has_all_peers
t "VPN: peers reach each other through the server" is_eq 1 sysctl -n net.inet.ip.forwarding
blocked_name=$(awk -F'"' '/ always_nxdomain$/ { print $2; exit }' /var/unbound/etc/blocklist.conf)
t "DNS: blocklist loaded" no_such_name "${blocked_name}"
t "DNS: Firefox is told to use this resolver" no_such_name use-application-dns.net
t "DNS: other names resolve" sh -c 'dig +short @10.8.0.1 openbsd.org | grep -q .'
t "health-check runs" /usr/local/sbin/health-check
finish
