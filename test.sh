#!/bin/sh
# Test a server that install.sh made. Run it as root on the server, from this folder:
#   sh test.sh               test the server as it is
#   sh test.sh DEPLOY_KEY    also deploy test pages with the private deploy key. This replaces the
#                            site and the app pages, so use it only before the real deploy.
# It prints 1 line for each test and exits 1 if a test fails.
cd "$(dirname "$0")" || exit 1
. ./local.conf
fails=0
t() {
	if eval "$2" >/dev/null 2>&1; then echo "ok   $1"; else echo "FAIL $1"; fails=$((fails + 1)); fi
}
# web PORT HOST PATH: print the status code and the Location of 1 request.
web() {
	printf 'GET %s HTTP/1.0\r\nHost: %s\r\n\r\n' "$3" "$2" |
	if [ "$1" = 80 ]; then nc 127.0.0.1 80; else openssl s_client -quiet -connect 127.0.0.1:443 -servername "$2"; fi 2>/dev/null |
	tr -d '\r' | awk 'NR == 1 { s = $2 } /^Location:/ { l = $2 } END { print s, l }'
}

t "configs: sshd" "sshd -t"
t "configs: httpd" "httpd -n"
t "configs: smtpd" "smtpd -n"
t "configs: unbound" "unbound-checkconf"
t "configs: pf" "pfctl -nf /etc/pf.conf"
t "services run" "rcctl check httpd smtpd unbound sshd cron"
t "sshd: no root login" "sshd -T | grep -qix 'permitrootlogin no'"
t "sshd: keys only" "sshd -T | grep -qix 'authenticationmethods publickey'"
t "admin keys: VPN only" "! grep -qv '^from=\"10.8.0.0/24,127.0.0.1\" ssh-' /home/$ADMIN_USER/.ssh/authorized_keys"
t "jobs in crontab" "crontab -l | grep -q health-check"

if [ -n "${1:-}" ]; then
	k="ssh -i $1 -o StrictHostKeyChecking=accept-new -o BatchMode=yes deploy@127.0.0.1"
	p=$(mktemp -d)
	mkdir -p "$p/play/beamdiag" "$p/lullapixie" "$p/marklove"
	for f in index.html play/beamdiag/index.html lullapixie/privacy.html lullapixie/support.html \
		marklove/privacy.html marklove/support.html; do echo test > "$p/$f"; done
	t "deploy: site" "tar -czf - -C $p index.html play lullapixie marklove | $k site"
	t "deploy: app" "tar -czf - -C $p index.html | $k apps/test"
	t "deploy: old files go away" "touch /var/www/web/site/old.html && tar -czf - -C $p index.html play lullapixie marklove | $k site && [ ! -e /var/www/web/site/old.html ]"
	t "deploy: no shell" "! $k sh </dev/null"
	t "deploy: no other folder" "! $k apps/../x </dev/null"
	rm -rf "$p"
fi

for u in / /lullapixie/privacy.html /lullapixie/support.html /marklove/privacy.html /marklove/support.html \
	/play/beamdiag/ /.well-known/security.txt /contact.gpg /.well-known/openpgpkey/hu/dj3498u4hyyarh35rkjfnghbjxug6b19; do
	t "web: $u" "[ \"\$(web 443 teoyujie.org $u)\" = '200 ' ]"
done
t "web: old URL is 404" "[ \"\$(web 443 teoyujie.org /old.html)\" = '404 ' ]"
t "web: www to bare" "[ \"\$(web 443 www.teoyujie.org /a)\" = '301 https://teoyujie.org/a' ]"
t "web: HTTP to HTTPS" "[ \"\$(web 80 teoyujie.org /a)\" = '301 https://teoyujie.org/a' ]"
t "web: ACME on HTTP" "[ \"\$(web 80 teoyujie.org /.well-known/acme-challenge/x)\" = '404 ' ]"
t "web: MTA-STS policy" "[ \"\$(web 443 mta-sts.teoyujie.org /.well-known/mta-sts.txt)\" = '200 ' ]"
d=$(openssl rand -hex 16)
mkdir /var/www/files/f/$d && echo test > /var/www/files/f/$d/a.txt
t "web: file link" "[ \"\$(web 443 teoyujie.org /f/$d/a.txt)\" = '200 ' ]"
t "web: no file list" "[ \"\$(web 443 teoyujie.org /f/)\" != '200 ' ]"
rm -r /var/www/files/f/$d

# Mail, sent to the egress address as from the internet. With the values of local.conf.example, no
# test mail leaves the server: example.org and example.com have no mail server. With the real
# local.conf, the mailbox gets 1 mail for each alias.
# The open relay test must come from outside the server: see README.md.
m="smtp -C -s smtp://$(ifconfig egress | awk '$1 == "inet" { print $2; exit }') -F test@example.org"
msg='From: test@example.org\nSubject: test.sh\n\ntest\n'
for a in contact postmaster $ALIASES; do
	t "mail: $a@ is accepted" "printf '$msg' | $m $a@teoyujie.org 2>&1 | grep -q ' 250 '"
done
for a in root nobody-$d; do
	t "mail: $a@ is refused" "printf '$msg' | $m $a@teoyujie.org 2>&1 | grep -q 'RCPT: 550'"
done
sleep 2
t "mail: forwarded to the mailbox" "grep -q 'to=<$FORWARD_TO> rcpt=<contact@teoyujie.org>' /var/log/maillog"

before=$(grep -c 'from=<_syslogd@' /var/log/maillog)
logger -p auth.info -t sshd "Accepted publickey for test from 192.0.2.1 port 1 ssh2"
sleep 2
t "SSH alert for an unknown address" "[ \$(grep -c 'from=<_syslogd@' /var/log/maillog) -gt $before ]"

t "VPN: wg0 has all peers" "[ \$(ifconfig wg0 | grep -c wgpeer) -eq $(echo $WG_PEERS | wc -w) ]"
b=$(sed -n '1s/^local-zone: "\(.*\)" always_nxdomain$/\1/p' /var/unbound/etc/blocklist.conf)
t "DNS: blocklist loaded" "[ -n '$b' ] && dig @10.8.0.1 '$b' | grep -q NXDOMAIN"
t "DNS: other names resolve" "dig +short @10.8.0.1 openbsd.org | grep -q ."
t "health-check runs" "/usr/local/sbin/health-check"

[ $fails -eq 0 ] && echo "all tests passed" || { echo "$fails tests failed"; exit 1; }
