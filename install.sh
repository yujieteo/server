#!/bin/sh
set -eu
cd "$(dirname "$0")"
. ./local.conf
d=teoyujie.org

put() {
	case ${KNOWN_IPS-} in *[\#\&\\]*) echo "put: KNOWN_IPS must not have #, & or a backslash, because sed would write other text" >&2; exit 1 ;; *) ;; esac
	sed "s#@KNOWN_IPS@#${KNOWN_IPS}#g" "$1" > "$2.new"
	chmod "${3:-644}" "$2.new"
	mv -f "$2.new" "$2"
}

echo "${d}" > /etc/myname
hostname "${d}"

id "${ADMIN_USER-}" >/dev/null 2>&1 || useradd -m -G wheel -s /bin/ksh "${ADMIN_USER}"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/sh deploy
if grep -q "^${ADMIN_USER}:\*:" /etc/master.passwd; then
	if [ -t 0 ]; then passwd "${ADMIN_USER}"; else echo "Set the doas password: passwd ${ADMIN_USER}"; fi
fi
install -d -o "${ADMIN_USER}" -m 700 /home/"${ADMIN_USER}"/.ssh
printf '%s\n' "${ADMIN_KEY-}" | sed '/^[[:space:]]*$/d; s#^[[:space:]]*#from="10.8.0.0/24,127.0.0.1" #' > /home/"${ADMIN_USER}"/.ssh/authorized_keys
chown "${ADMIN_USER}" /home/"${ADMIN_USER}"/.ssh/authorized_keys
install -d -m 755 /home/deploy/.ssh
echo "from=\"10.8.0.0/24,127.0.0.1\",restrict,command=\"/usr/local/sbin/deploy-only\" ${DEPLOY_KEY-}" > /home/deploy/.ssh/authorized_keys

for f in sbin/*; do put "${f}" /usr/local/sbin/"${f#sbin/}" 755; done
id tunnel >/dev/null 2>&1 || useradd -d /home/tunnel -s /usr/local/sbin/tunnel-wait tunnel
install -d -m 755 /home/tunnel /home/tunnel/.ssh
printf '%s\n' "${TUNNEL_KEY:-}" | sed '/^[[:space:]]*$/d; s#^[[:space:]]*#from="10.8.0.0/24,127.0.0.1" #' > /home/tunnel/.ssh/authorized_keys
put etc/doas.conf /etc/doas.conf
put etc/sysctl.conf /etc/sysctl.conf
put etc/sshd_config /etc/ssh/sshd_config
put etc/httpd.conf /etc/httpd.conf
put etc/acme-client.conf /etc/acme-client.conf
put etc/smtpd.conf /etc/mail/smtpd.conf
put etc/unbound.conf /var/unbound/etc/unbound.conf
put etc/pf.conf /etc/pf.conf 600
put etc/relayd.conf /etc/relayd.conf 600
sysctl -q net.inet.ip.forwarding=1

install -d -o deploy -m 755 /var/www/web /var/www/web/site /var/www/web/apps
install -d -o "${ADMIN_USER}" -m 755 /var/www/files/f
rm -rf /var/www/htdocs/server
cp -R www /var/www/htdocs/server


if [ ! -e /etc/ssl/"${d}".fullchain.pem ]; then
	(umask 077 && openssl ecparam -genkey -name prime256v1 -out /etc/ssl/private/"${d}".key 2>/dev/null)
	openssl req -x509 -new -key /etc/ssl/private/"${d}".key -days 1 -subj /CN="${d}" -out /etc/ssl/"${d}".fullchain.pem
fi
if [ ! -e /etc/ssl/apps.crt ]; then
	(umask 077 && openssl ecparam -genkey -name prime256v1 -out /etc/ssl/private/apps.key 2>/dev/null)
	openssl req -x509 -new -key /etc/ssl/private/apps.key -days 1 -subj /CN=mac.lavish."${d}" -out /etc/ssl/apps.crt
fi

if [ ! -e /etc/mail/srs.conf ]; then
	srs_key=$(openssl rand -hex 32)
	(umask 077 && echo "srs key ${srs_key}" > /etc/mail/srs.conf)
fi
for a in contact postmaster ${ALIASES-}; do echo "${a}@${d} ${FORWARD_TO-}"; done > /etc/mail/virtual
{
	sed '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/d' /etc/mail/aliases
	echo "# BEGIN teoyujie.org (install.sh writes this block)"
	echo "root: contact"
	echo "contact: ${FORWARD_TO}"
	for a in ${ALIASES}; do echo "${a}: contact"; done
	echo "# END teoyujie.org"
} > /etc/mail/aliases.new
mv -f /etc/mail/aliases.new /etc/mail/aliases

key=
if [ -e /etc/hostname.wg0 ]; then key=$(awk '$1 == "wgkey" { print $2 }' /etc/hostname.wg0); fi
[ -n "${key}" ] || key=$(openssl rand -base64 32)
{
	echo "wgkey ${key}"
	echo "wgport 51820"
	echo "inet 10.8.0.1/24"
	for p in ${WG_PEERS-}; do
		IFS=: read -r name ip pub <<-EOF
		${p}
		EOF
		echo "wgpeer ${pub} wgaip ${ip}/32 wgdescr ${name}"
	done
	echo "up"
} > /etc/hostname.wg0.new
chmod 640 /etc/hostname.wg0.new
if cmp -s /etc/hostname.wg0.new /etc/hostname.wg0 && ifconfig wg0 >/dev/null 2>&1; then
	rm /etc/hostname.wg0.new
elif ! ifconfig wg0 >/dev/null 2>&1; then
	mv -f /etc/hostname.wg0.new /etc/hostname.wg0
	sh /etc/netstart wg0
fi

grep -q ssh-alert /etc/syslog.conf || printf 'auth.info\t|/usr/local/sbin/ssh-alert\n' >> /etc/syslog.conf
{
	crontab -l | sed '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/d'
	echo "# BEGIN teoyujie.org (install.sh writes this block)"
	cat etc/crontab
	echo "# END teoyujie.org"
} | crontab -
touch /var/unbound/etc/blocklist.conf

sshd -t
httpd -n
smtpd -n
unbound-anchor || echo "unbound-anchor did not update the root key, unbound keeps the key it has"
unbound-checkconf >/dev/null
acme-client -n >/dev/null
relayd -n >/dev/null
pfctl -nf /etc/pf.conf
pfctl -f /etc/pf.conf
for s in neurons_room slowcgi; do
	[ -x /etc/rc.d/"${s}" ] || continue
	rcctl disable "${s}" >/dev/null
	if rcctl check "${s}" >/dev/null 2>&1; then rcctl stop "${s}" >/dev/null; fi
done
if id fleet >/dev/null 2>&1; then
	usermod -p '*' -s /sbin/nologin fleet
	if [ -e /home/fleet/.ssh/authorized_keys ]; then mv -f /home/fleet/.ssh/authorized_keys /home/fleet/.ssh/authorized_keys.disabled; fi
	if [ -e /usr/local/sbin/fleet-upload ]; then chmod 000 /usr/local/sbin/fleet-upload; fi
fi
rcctl enable httpd relayd smtpd unbound >/dev/null
rcctl restart sshd syslogd httpd relayd smtpd unbound >/dev/null
/usr/local/sbin/private-cert || echo "private-cert failed: cron tries again each hour"
[ -s /var/unbound/etc/blocklist.conf ] || /usr/local/sbin/blocklist-update

public_key=$(ifconfig wg0 | awk '$1 == "wgpubkey" { print $2 }')
echo "Done. WireGuard public key of the server: ${public_key}"
if [ -e /etc/hostname.wg0.new ]; then
	echo "wg0 restarts in 2 seconds. The VPN stops for some seconds."
	trap '' HUP
	nohup sh -c 'sleep 2; mv -f /etc/hostname.wg0.new /etc/hostname.wg0; ifconfig wg0 destroy; sh /etc/netstart wg0' >/dev/null 2>&1 &
fi
