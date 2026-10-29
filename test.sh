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
# get PATH: print the reply (head and body) of 1 GET.
get() {
	printf 'GET %s HTTP/1.0\r\nHost: teoyujie.org\r\n\r\n' "$1" |
	openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2>/dev/null | tr -d '\r'
}

t "configs: sshd" "sshd -t"
t "configs: httpd" "httpd -n"
t "configs: smtpd" "smtpd -n"
t "configs: unbound" "unbound-checkconf"
t "configs: pf" "pfctl -nf /etc/pf.conf"
t "services run" "rcctl check slowcgi neurons_room httpd smtpd unbound sshd cron"
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
# errpage PATH: print the title of the error page of PATH, if it is the site error page (www/errdocs).
errpage() { get "$1" | grep -q '^<link rel="stylesheet" href="/style.css">$' && get "$1" | grep '^<h1>'; }
t "web: a 404 is the site error page" "[ \"\$(errpage /old.html)\" = '<h1>404 Not Found</h1>' ]"
t "web: www to bare" "[ \"\$(web 443 www.teoyujie.org /a)\" = '301 https://teoyujie.org/a' ]"
t "web: HTTP to HTTPS" "[ \"\$(web 80 teoyujie.org /a)\" = '301 https://teoyujie.org/a' ]"
t "web: ACME on HTTP" "[ \"\$(web 80 teoyujie.org /.well-known/acme-challenge/x)\" = '404 ' ]"
t "web: MTA-STS policy" "[ \"\$(web 443 mta-sts.teoyujie.org /.well-known/mta-sts.txt)\" = '200 ' ]"
d=$(openssl rand -hex 16)
mkdir /var/www/files/f/$d && echo test > /var/www/files/f/$d/a.txt
t "web: file link" "[ \"\$(web 443 teoyujie.org /f/$d/a.txt)\" = '200 ' ]"
t "web: no file list" "[ \"\$(web 443 teoyujie.org /f/)\" != '200 ' ]"
t "web: a 403 is the site error page" "[ \"\$(errpage /f/)\" = '<h1>403 Forbidden</h1>' ]"
rm -r /var/www/files/f/$d

# The pond save service, with a test key and a test entry. Both go away after the tests.
# post FILE SIGNATURE [PATH]: POST FILE to PATH (default /pond/entry) and print the status code.
post() {
	{ printf 'POST %s HTTP/1.0\r\nHost: teoyujie.org\r\nContent-Length: %s\r\nSignature: %s\r\n\r\n' \
		"${3:-/pond/entry}" "$(wc -c < "$1" | tr -d ' ')" "$2"; cat "$1"; } |
	openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2>/dev/null | tr -d '\r' | awk 'NR == 1 { print $2 }'
}
p=$(mktemp -d)
openssl ecparam -name prime256v1 -genkey -noout -out $p/key.pem
openssl pkey -in $p/key.pem -pubout -outform DER | openssl base64 -A > /var/www/pond/keys/test-$d.pub
for r in 1 2 3; do
	printf '{"entry":{"date":"2026-10-28","title":"test.sh"},"id":"test-%s","key":"test-%s","op":"put","rev":%s,"v":1}' $d $d $r > $p/$r
	openssl dgst -sha256 -sign $p/key.pem < $p/$r | openssl base64 -A > $p/$r.sig
done
printf '%8193s' '' > $p/big
t "pond: new entry is saved" "[ \"\$(post $p/2 \$(cat $p/2.sig))\" = 201 ] && cmp $p/2 /var/www/pond/entries/test-$d.json"
t "pond: replay changes nothing" "[ \"\$(post $p/2 \$(cat $p/2.sig))\" = 200 ]"
t "pond: lower rev is refused" "[ \"\$(post $p/1 \$(cat $p/1.sig))\" = 409 ]"
t "pond: bad signature is refused" "[ \"\$(post $p/3 \$(cat $p/2.sig))\" = 403 ]"
t "pond: body over 8192 bytes is refused" "[ \"\$(post $p/big '')\" = 413 ]"
t "pond: refused requests change nothing" "cmp $p/2 /var/www/pond/entries/test-$d.json"
rm -r $p /var/www/pond/keys/test-$d.pub /var/www/pond/entries/test-$d.json

# The pond read service, with test entries as pond_save keeps them. They go away after the tests.
# The tests look only at the test entries, so they also pass on a server with real entries.
# If the site has no log template, a test template goes in and away again.
# entry NAME MTIME ENTRY: write the entry test-$d-NAME, with its time of change.
entry() {
	printf '{"entry":%s,"id":"test-%s-%s","key":"phone","op":"put","rev":1,"v":1}' "$3" $d $1 > /var/www/pond/entries/test-$d-$1.json
	touch -t $2 /var/www/pond/entries/test-$d-$1.json
}
p=$(mktemp -d)
tp=/var/www/web/site/log/template.html
tl=; [ -e $tp ] || { tl=$tp; [ -d ${tp%/*} ] || tl="$tp ${tp%/*}"; }
# A fresh server (the CI VM) has no entries and no log template.
if ! ls /var/www/pond/entries | grep -q '\.json$'; then
	get /pond/entries.json > $p/json
	get /log/ > $p/log
	get /log/feed.xml > $p/feed
	t "pond: an empty store gives no entries" "[ \"\$(tail -n 1 $p/json)\" = '{\"entries\":[]}' ]"
	t "pond: an empty store gives a page" "head -n 1 $p/log | grep -q ' 200 '"
	t "pond: an empty store gives a feed" "grep -q '</channel>' $p/feed"
fi
[ -z "$tl" ] || t "pond: a missing template gives a plain page" "get /log/ | grep -qF '<h1>Log</h1>'"
[ -z "$tl" ] || { mkdir -p ${tp%/*}; printf '<html>\n<main>\n  <!-- pond:entries -->\n</main>\n<footer>end</footer>\n</html>\n' > $tp; }
entry old 202610270900 "{\"date\":\"2026-10-27\",\"title\":\"test-$d-old\"}"
entry morning 202610280800 "{\"date\":\"2026-10-28\",\"title\":\"test-$d-morning\"}"
entry evening 202610282000 "{\"date\":\"2026-10-28\",\"title\":\"test-$d-evening\"}"
entry esc 202610281000 "{\"date\":\"2026-10-28\",\"link\":\"https://example.org/?a=1&b=\\\"2\\\"\",\"made\":\"it's <i>\",\"title\":\"<script>test-$d</script> & co\"}"
entry js 202610280900 "{\"date\":\"2026-10-28\",\"link\":\"javascript:alert(1)\",\"title\":\"test-$d-js\"}"
entry neg 202610280600 "{\"date\":\"-999-10-28\",\"title\":\"test-$d-neg\\u0001ctl\"}"
entry private 202610281100 "{\"date\":\"2026-10-28\",\"fun\":\"test-$d-fun\",\"notice\":\"test-$d-notice\",\"title\":\"test-$d-private\"}"
printf '{"id":"test-%s-gone","key":"phone","op":"remove","rev":2,"v":1}' $d > /var/www/pond/entries/test-$d-gone.json
get /pond/entries.json > $p/json
get /log/ > $p/log
get /log/feed.xml > $p/feed
# httpd decodes the path before it chooses the location, but gives pond_read the path as it came.
get /log/%66eed.xml > $p/other
: > $p/empty
printf '%s\n' "<h2><a href=\"https://example.org/?a=1&amp;b=&quot;2&quot;\">&lt;script&gt;test-$d&lt;/script&gt; &amp; co</a></h2>" > $p/html-link
printf '%s\n' '<p>it&#39;s &lt;i&gt;</p>' > $p/html-made
printf '%s\n' '<link>https://example.org/?a=1&amp;b=&quot;2&quot;</link>' > $p/xml-link
# item NAME: print the feed item of the test entry NAME.
item() { sed -n "/<title>test-$d-$1</,/<\/item>/p" $p/feed; }
# order FILE: print the test entries of FILE in their sequence.
order() { grep -oE "test-$d-(old|morning|evening)" $1 | uniq | tr '\n' ' '; }
o="test-$d-evening test-$d-morning test-$d-old "
t "pond: entries.json is JSON" "head -n 1 $p/json | grep -q ' 200 ' && grep -qi '^Content-Type: application/json' $p/json"
t "pond: /log/ is HTML" "head -n 1 $p/log | grep -q ' 200 ' && grep -qi '^Content-Type: text/html' $p/log"
t "pond: the feed is RSS" "head -n 1 $p/feed | grep -q ' 200 ' && grep -qi '^Content-Type: application/rss+xml' $p/feed"
t "pond: entries.json is newest first" "[ \"\$(order $p/json)\" = '$o' ]"
t "pond: /log/ is newest first" "[ \"\$(order $p/log)\" = '$o' ]"
t "pond: the feed is newest first" "[ \"\$(order $p/feed)\" = '$o' ]"
t "pond: an item has an RFC 822 date" "item morning | grep -qF '<pubDate>Wed, 28 Oct 2026 00:00:00 +0000</pubDate>'"
t "pond: a removed entry is not served" "! grep -q test-$d-gone $p/json $p/log $p/feed"
t "pond: no private field is served" "! grep -qE 'test-$d-(fun|notice)' $p/json $p/log $p/feed"
t "pond: a title is escaped for HTML" "grep -qF '&lt;script&gt;test-$d&lt;/script&gt; &amp; co' $p/log && ! grep -qF '<script>test-' $p/log"
t "pond: a link is escaped for HTML" "grep -qFf $p/html-link $p/log"
t "pond: made is escaped for HTML" "grep -qFf $p/html-made $p/log"
t "pond: a title is escaped for XML" "grep -qF '<title>&lt;script&gt;test-$d&lt;/script&gt; &amp; co</title>' $p/feed"
t "pond: a link is escaped for XML" "grep -qFf $p/xml-link $p/feed"
t "pond: a link that is not a web link is not a link" "grep -q test-$d-js $p/log && ! grep -q 'javascript:' $p/log"
t "pond: a feed with a bad date is served" "item negctl | grep -q ."
t "pond: a bad date gives no pubDate" "! item negctl | grep -q pubDate"
t "pond: a control character is not in the feed" "! tr -d '\t\n\r' < $p/feed | LC_ALL=C grep -q '[[:cntrl:]]'"
t "pond: /log/ uses the template" "! grep -q pond:entries $p/log && [ -z \"\$(grep -v pond:entries $tp | grep -vxFf $p/log)\" ]"
[ -z "$tl" ] || t "pond: the entries are in place of the marker" "[ \"\$(grep -A1 -x '<main>' $p/log | sed -n 2p)\" = '<article>' ]"
t "pond: an unknown path is not found" "head -n 1 $p/other | grep -q ' 404 ' && grep -qx 'not found' $p/other"
t "pond: a POST to the read service is refused" "[ \"\$(post $p/empty '' /log/)\" = 405 ]"
rm -r $p /var/www/pond/entries/test-$d-*.json $tl

# The room relay of the neuron explorer, through httpd. The test room ends after 3 days; the
# test members leave it. README.md of the neurons repo has the protocol.
# room FILE: POST FILE to /play/neurons/room and print the status code, then the body of the reply.
room() {
	{ printf 'POST /play/neurons/room HTTP/1.0\r\nHost: teoyujie.org\r\nContent-Type: application/json\r\nContent-Length: %s\r\n\r\n' \
		"$(wc -c < "$1" | tr -d ' ')"; cat "$1"; } |
	openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2>/dev/null | tr -d '\r' |
	awk 'NR == 1 { print $2 } b { print } /^$/ { b = 1 }'
}
# body NAME OP MEMBER [FIELDS]: write the request NAME for the test room.
p=$(mktemp -d)
r=$(openssl rand -hex 11)
body() { printf '{"op":"%s","room":"%s","member":"%s","name":"test","since":-1%s}' "$2" "$r" "$3" "${4:-}" > $p/$1; }
body create create member-a
body poll-a poll member-a
body poll-b poll member-b
body view view member-a ',"view":"{\"layer\":16,\"index\":1275}"'
body list view member-a ',"view":"[16]"'
body note note member-a ',"neuron":"16.1275","text":"test note","base":0'
body old note member-b ',"neuron":"16.1275","text":"old base","base":0'
# An OpenRouter key has the shape sk-or-v1- and 64 hex digits. This file holds no full key.
k=sk-or-v1-$(jot -b 0 -s '' 64)
body key note member-a ',"neuron":"16.1275","text":"'$k'","base":0'
body key-view view member-a ',"view":"{\"layer\":\"\\u0073'${k#s}'\"}"'
body words note member-a ',"neuron":"3.7","text":"risk-or-reward","base":0'
body gone poll member-a '' && sed -i "s/$r/0000000000000000000000/" $p/gone
for m in c d e f; do body poll-$m poll member-$m; body leave-$m leave member-$m; done
body leave-a leave member-a
body leave-b leave member-b
printf '{"op":"poll","room":"%s","member":"member-a","name":"%8193s"}' $r '' > $p/big
t "rooms: a new room" "room $p/create | head -1 | grep -qx 200"
t "rooms: a room is made once" "room $p/create | head -1 | grep -qx 409"
t "rooms: a member comes in" "room $p/poll-b | grep -qF '{\"name\":\"test\"},{\"name\":\"test\",\"you\":true}'"
t "rooms: a reply names no member id" "! room $p/poll-b | grep -q member-"
t "rooms: a view goes to the others" "room $p/view | head -1 | grep -qx 200 && room $p/poll-b | grep -q '\"view\":\"{.\"layer.\":16'"
t "rooms: a view that is not an object is refused" "room $p/list | head -1 | grep -qx 400"
t "rooms: a note is saved" "room $p/note | head -1 | grep -qx 200"
t "rooms: a note from an old version is a conflict" "room $p/old | head -1 | grep -qx 409 && room $p/poll-b | grep -qF '\"text\":\"test note\"'"
t "rooms: an OpenRouter key is refused" "room $p/key | head -1 | grep -qx 400 && ! room $p/poll-b | grep -q sk-or-v1-"
t "rooms: an escaped OpenRouter key in a view is refused" "room $p/key-view | head -1 | grep -qx 400"
t "rooms: a note with risk-or-reward is saved" "room $p/words | head -1 | grep -qx 200"
t "rooms: a body over 8192 bytes is refused" "room $p/big | head -1 | grep -qx 413"
t "rooms: GET is refused" "[ \"\$(web 443 teoyujie.org /play/neurons/room)\" = '405 ' ]"
t "rooms: an unknown room is not found" "room $p/gone | head -1 | grep -qx 404"
for m in c d e; do room $p/poll-$m >/dev/null; done
t "rooms: a sixth member is refused" "room $p/poll-f | head -1 | grep -qx 403"
t "rooms: a member that leaves makes a place" "room $p/leave-e | head -1 | grep -qx 200 && room $p/poll-f | head -1 | grep -qx 200"
room $p/poll-e >/dev/null
sleep 16
t "rooms: a member that is away for 15 s is not in the room" "room $p/poll-f | grep -qF '\"members\":[{\"name\":\"test\",\"you\":true}]'"
for m in a b c d e f; do room $p/leave-$m >/dev/null; done

# The limits of the relay, on 2 more relays: requests from 1 address, rooms from 1 address,
# writes in 1 room, and the end of a room. Without httpd, a test speaks FastCGI with nc.
# fcgi PORT FILE [ADDRESS]: POST FILE to the relay on PORT from ADDRESS (default 127.0.0.1), and
# print the status code.
fcgi() {
	n=$(wc -c < "$2" | tr -d ' ')
	ip=${3:-127.0.0.1}
	{ printf '\001\001\000\001\000\010\000\000\000\001\000\000\000\000\000\000'
		printf "\\001\\004\\000\\001\\000\\$(printf %03o $((33 + ${#ip})))\\000\\000\\016\\004REQUEST_METHODPOST\\013\\$(printf %03o ${#ip})REMOTE_ADDR%s" "$ip"
		printf '\001\004\000\001\000\000\000\000\001\005\000\001'
		printf "\\$(printf %03o $((n / 256)))\\$(printf %03o $((n % 256)))\\000\\000"
		cat "$2"
		printf '\001\005\000\001\000\000\000\000'
	} | nc -N 127.0.0.1 $1 | tr -c '[:print:]' '\n' | sed -n 's/^Status: \([0-9]*\).*/\1/p'
}
/usr/local/sbin/neurons_room --port 8791 & q1=$!
/usr/local/sbin/neurons_room --port 8792 --ttl 2 & q2=$!
sleep 1
t "rooms: a room ends after its time" "[ \$(fcgi 8792 $p/create) = 200 ] && sleep 3 && [ \$(fcgi 8792 $p/poll-a) = 404 ]"
s=
for i in 1 2 3 4 5 6 7; do body new$i create member-a; sed -i "s/$r/$(openssl rand -hex 11)/" $p/new$i; s="$s $(fcgi 8791 $p/new$i)"; done
t "rooms: 6 new rooms in an hour from 1 address" "[ '$s' = ' 200 200 200 200 200 200 429' ]"
s=
for i in 1 2 3 4 5 6 7; do sed "s/$r/$(openssl rand -hex 11)/" $p/create > $p/v6; s="$s $(fcgi 8791 $p/v6 2001:db8:1:2::$i)"; done
t "rooms: 6 new rooms in an hour from 1 IPv6 /64" "[ '$s' = ' 200 200 200 200 200 200 429' ]"
cp $p/new1 $p/room1 && sed -i 's/"create"/"view"/; s/}$/,"view":"{}"}/' $p/room1
s=; for i in $(jot 121); do s=$(fcgi 8791 $p/room1); [ $s = 200 ] || break; done
t "rooms: 120 views and notes in a minute in a room" "[ $i = 121 ] && [ $s = 429 ]"
sed 's/"view","/"poll","/; s/,"view":"{}"//' $p/room1 > $p/poll1
s=; for i in $(jot 480); do s=$(fcgi 8791 $p/poll1); [ $s = 200 ] || break; done
t "rooms: 600 requests in a minute from 1 address" "[ $i = 473 ] && [ $s = 429 ]"
# A request that is not all in after 2 s does not hold the relay longer.
{ printf '\001\001\000\001\000\010\000\000'; sleep 5; } | nc -N 127.0.0.1 8792 >/dev/null & q3=$!
sleep 1
a=$(date +%s); fcgi 8792 $p/poll-a >/dev/null; b=$(date +%s)
t "rooms: a slow request holds the relay for 2 s at most" "[ $((b - a)) -le 2 ]"
kill $q1 $q2 $q3 2>/dev/null
rm -r $p

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
# Mail from the VPN, sent to 10.8.0.1. The source address is 10.8.0.1, in the VPN range.
v="smtp -C -s smtp://10.8.0.1 -F test@example.org"
t "mail: VPN to contact@ is accepted" "printf '$msg' | $v contact@teoyujie.org 2>&1 | grep -q ' 250 '"
t "mail: VPN to another domain is refused" "printf '$msg' | $v test@example.net 2>&1 | grep -q 'RCPT: 550'"
sleep 2
t "mail: forwarded to the mailbox" "grep -q 'to=<$FORWARD_TO> rcpt=<contact@teoyujie.org>' /var/log/maillog"

before=$(grep -c 'from=<_syslogd@' /var/log/maillog)
logger -p auth.info -t sshd "Accepted publickey for test from 192.0.2.1 port 1 ssh2"
sleep 2
t "SSH alert for an unknown address" "[ \$(grep -c 'from=<_syslogd@' /var/log/maillog) -gt $before ]"
# ssh-alert with a test mail command. A client that is not logged in chooses the user name in
# these sshd messages, so the name can hold the text of a login.
p=$(mktemp -d)
printf '#!/bin/sh\necho "$2" >> %s/sent\ncat > /dev/null\n' $p > $p/mail && chmod +x $p/mail
for l in 'Invalid user x: Accepted y from 203.0.113.9 port 4000' \
	'Failed password for invalid user x: Accepted y from 203.0.113.9 port 4000 ssh2' \
	'Connection closed by invalid user x]: Accepted y from 203.0.113.9 port 4000 [preauth]' \
	'Disconnected from invalid user x]: Accepted y from 203.0.113.9 port 4000 [preauth]' \
	'Accepted publickey for test from 192.0.2.1 port 1 ssh2'; do
	echo "Oct 29 12:00:00 server sshd-session[1]: $l"
done | PATH=$p:$PATH /usr/local/sbin/ssh-alert
t "SSH alert: a user name cannot make a false alert" "[ \"\$(cat $p/sent)\" = 'SSH login from 192.0.2.1' ]"
rm -r $p

t "VPN: wg0 has all peers" "[ \$(ifconfig wg0 | grep -c wgpeer) -eq $(echo $WG_PEERS | wc -w) ]"
b=$(sed -n '1s/^local-zone: "\(.*\)" always_nxdomain$/\1/p' /var/unbound/etc/blocklist.conf)
t "DNS: blocklist loaded" "[ -n '$b' ] && dig @10.8.0.1 '$b' | grep -q NXDOMAIN"
t "DNS: other names resolve" "dig +short @10.8.0.1 openbsd.org | grep -q ."
t "health-check runs" "/usr/local/sbin/health-check"

[ $fails -eq 0 ] && echo "all tests passed" || { echo "$fails tests failed"; exit 1; }
