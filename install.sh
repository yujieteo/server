#!/bin/sh
# Turn a fresh OpenBSD 8.0 server into teoyujie.org. Run it as root from this folder, with local.conf
# next to it. It is safe to run again: each run writes the same files and restarts the services.
set -eu
cd "$(dirname "$0")"
. ./local.conf
d=teoyujie.org

# put SRC DEST [MODE]: install a repo file, with the private values put in.
put() {
	sed "s#@KNOWN_IPS@#$KNOWN_IPS#g" "$1" > "$2.new"
	chmod "${3:-644}" "$2.new"
	mv "$2.new" "$2"
}

echo $d > /etc/myname
hostname $d

# Users. The admin logs in with a key, only through the VPN, and uses doas with a password.
# The deploy user can only run deploy-only, which replaces 1 web folder with a tar archive.
id "$ADMIN_USER" >/dev/null 2>&1 || useradd -m -G wheel -s /bin/ksh "$ADMIN_USER"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/sh deploy
if grep -q "^$ADMIN_USER:\*:" /etc/master.passwd; then
	if [ -t 0 ]; then passwd "$ADMIN_USER"; else echo "Set the doas password: passwd $ADMIN_USER"; fi
fi
install -d -o "$ADMIN_USER" -m 700 /home/"$ADMIN_USER"/.ssh
echo "from=\"10.8.0.0/24,127.0.0.1\" $ADMIN_KEY" > /home/"$ADMIN_USER"/.ssh/authorized_keys
chown "$ADMIN_USER" /home/"$ADMIN_USER"/.ssh/authorized_keys
install -d -m 755 /home/deploy/.ssh
echo "from=\"10.8.0.0/24,127.0.0.1\",restrict,command=\"/usr/local/sbin/deploy-only\" $DEPLOY_KEY" > /home/deploy/.ssh/authorized_keys

for f in bin/*; do put "$f" /usr/local/sbin/"${f#bin/}" 755; done
put etc/doas.conf /etc/doas.conf
put etc/sysctl.conf /etc/sysctl.conf
put etc/sshd_config /etc/ssh/sshd_config
put etc/httpd.conf /etc/httpd.conf
put etc/acme-client.conf /etc/acme-client.conf
put etc/smtpd.conf /etc/mail/smtpd.conf
put etc/unbound.conf /var/unbound/etc/unbound.conf
put etc/pf.conf /etc/pf.conf 600
sysctl -q net.inet.ip.forwarding=1

# Web folders. The deploy user owns /var/www/web: site, and apps/NAME for each app.
install -d -o deploy -m 755 /var/www/web /var/www/web/site /var/www/web/apps
install -d -o "$ADMIN_USER" -m 755 /var/www/files/f
rm -rf /var/www/htdocs/server
cp -R www /var/www/htdocs/server

# Until acme-client gets the Let's Encrypt certificate, httpd and smtpd use a 1-day self-signed one.
if [ ! -e /etc/ssl/$d.fullchain.pem ]; then
	(umask 077 && openssl ecparam -genkey -name prime256v1 -out /etc/ssl/private/$d.key 2>/dev/null)
	openssl req -x509 -new -key /etc/ssl/private/$d.key -days 1 -subj /CN=$d -out /etc/ssl/$d.fullchain.pem
fi

# Mail. From the internet, only contact, postmaster and the website aliases go to the mailbox.
# The aliases block sends the mail of this server (root) to contact, and contact to the mailbox.
[ -e /etc/mail/srs.conf ] || (umask 077 && echo "srs key $(openssl rand -hex 32)" > /etc/mail/srs.conf)
for a in contact postmaster $ALIASES; do echo "$a@$d $FORWARD_TO"; done > /etc/mail/virtual
{
	sed '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/d' /etc/mail/aliases
	echo "# BEGIN teoyujie.org (install.sh writes this block)"
	echo "root: contact"
	echo "contact: $FORWARD_TO"
	for a in $ALIASES; do echo "$a: contact"; done
	echo "# END teoyujie.org"
} > /etc/mail/aliases.new
mv /etc/mail/aliases.new /etc/mail/aliases

# WireGuard. The private key stays in hostname.wg0 and never leaves the server.
key=$(awk '$1 == "wgkey" { print $2 }' /etc/hostname.wg0 2>/dev/null || true)
[ -n "$key" ] || key=$(openssl rand -base64 32)
{
	echo "wgkey $key"
	echo "wgport 51820"
	echo "inet 10.8.0.1/24"
	for p in $WG_PEERS; do
		IFS=: read -r name ip pub <<-EOF
		$p
		EOF
		echo "wgpeer $pub wgaip $ip/32 wgdescr $name"
	done
	echo "up"
} > /etc/hostname.wg0.new
chmod 640 /etc/hostname.wg0.new
# Restart wg0 only for a change, because a restart stops the VPN for some seconds.
# The SSH session of the admin can go through wg0, so a restart of a running wg0 is the last step.
wg_restart=
if cmp -s /etc/hostname.wg0.new /etc/hostname.wg0 && ifconfig wg0 >/dev/null 2>&1; then
	rm /etc/hostname.wg0.new
else
	mv /etc/hostname.wg0.new /etc/hostname.wg0
	if ifconfig wg0 >/dev/null 2>&1; then wg_restart=1; else sh /etc/netstart wg0; fi
fi

# SSH login alert and jobs.
grep -q ssh-alert /etc/syslog.conf || printf 'auth.info\t|/usr/local/sbin/ssh-alert\n' >> /etc/syslog.conf
{
	crontab -l | sed '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/d'
	echo "# BEGIN teoyujie.org (install.sh writes this block)"
	cat etc/crontab
	echo "# END teoyujie.org"
} | crontab -
touch /var/unbound/etc/blocklist.conf

# Check every config, then start everything.
sshd -t
httpd -n
smtpd -n
unbound-anchor || true
unbound-checkconf >/dev/null
acme-client -n >/dev/null
pfctl -nf /etc/pf.conf
pfctl -f /etc/pf.conf
rcctl enable httpd smtpd unbound >/dev/null
rcctl restart sshd syslogd httpd smtpd unbound >/dev/null
[ -s /var/unbound/etc/blocklist.conf ] || /usr/local/sbin/blocklist-update

echo "Done. WireGuard public key of the server: $(ifconfig wg0 | awk '$1 == "wgpubkey" { print $2 }')"
# The key does not change on a restart. The restart runs detached, so it survives the SSH hangup.
if [ -n "$wg_restart" ]; then
	echo "wg0 restarts in 2 seconds. The VPN stops for some seconds."
	nohup sh -c 'sleep 2; ifconfig wg0 destroy; sh /etc/netstart wg0' >/dev/null 2>&1 &
fi
