#!/bin/sh
# One path: render the managed files into a stage tree, show how the live
# system differs from it, then copy what differs. --check stops after the diff.
set -eu
cd "$(dirname "$0")"
check=${1-}
case ${check} in '' | --check) ;; *) echo 'usage: sh install.sh [--check]' >&2; exit 2 ;; esac
[ "$(id -u)" -eq 0 ] || { echo 'install.sh needs root.' >&2; exit 1; }
. ./local.conf
: "${ADMIN_USER:?local.conf needs ADMIN_USER}" "${FORWARD_TO:?local.conf needs FORWARD_TO}"
d=teoyujie.org
dkim_key=$(sed -n 's/.* -k \([^" ]*\).*/\1/p' etc/smtpd.conf)
umask 077
w=$(mktemp -d)
trap 'rm -rf "${w}"' EXIT
t=${w}/root
: > "${w}/changed"

# put MODE SOURCE TARGET stages a file of the repo. gen MODE TARGET stages its input.
put() { install -D -m "$1" "$2" "${t}$3"; }
gen() { mkdir -p "${t}${2%/*}"; cat > "${t}$2"; chmod "$1" "${t}$2"; }

for f in sbin/*; do put 755 "${f}" "/usr/local/${f}"; done
find www -type f > "${w}/www"
while read -r f; do put 644 "${f}" "/var/www/htdocs/server/${f#www/}"; done < "${w}/www"
while read -r mode source target; do put "${mode}" "etc/${source}" "${target}"; done <<EOF
600 pf.conf /etc/pf.conf
644 doas.conf /etc/doas.conf
644 sysctl.conf /etc/sysctl.conf
644 sshd_config /etc/ssh/sshd_config
644 httpd.conf /etc/httpd.conf
644 acme-client.conf /etc/acme-client.conf
644 smtpd.conf /etc/mail/smtpd.conf
644 unbound.conf /var/unbound/etc/unbound.conf
644 crontab /etc/crontab
640 hostname.vio0 /etc/hostname.vio0
EOF
echo "${d}" | gen 644 /etc/myname
printf '%s\n' "${ADMIN_KEY-}" | sed '/^[[:space:]]*$/d; s#^[[:space:]]*#from="10.8.0.0/24" #' | gen 644 "/home/${ADMIN_USER}/.ssh/authorized_keys"
echo "from=\"10.8.0.0/24\",restrict,command=\"/usr/local/sbin/deploy-only\" ${DEPLOY_KEY-}" | gen 644 /home/deploy/.ssh/authorized_keys
for a in contact postmaster ${ALIASES-}; do echo "${a}@${d} ${FORWARD_TO}"; done | gen 644 /etc/mail/virtual
{
	sed '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/d' /etc/mail/aliases
	echo '# BEGIN teoyujie.org (install.sh writes this block)'
	echo 'root: contact'
	echo "contact: ${FORWARD_TO}"
	for a in ${ALIASES-}; do echo "${a}: contact"; done
	echo '# END teoyujie.org'
} | gen 644 /etc/mail/aliases
{ grep -v ssh-alert /etc/syslog.conf; printf 'auth.info\t|/usr/local/sbin/ssh-alert\n'; } | gen 644 /etc/syslog.conf
# The server keeps its WireGuard key. A new server makes one.
{
	key=$(awk '$1 == "wgkey" { print $2 }' /etc/hostname.wg0 2>/dev/null) || key=
	echo "wgkey ${key:-$(openssl rand -base64 32)}"
	echo 'wgport 51820'
	echo 'inet 10.8.0.1/24'
	for p in ${WG_PEERS-}; do
		IFS=: read -r name ip pub <<-EOF
		${p}
		EOF
		echo "wgpeer ${pub} wgaip ${ip}/32 wgdescr ${name}"
	done
	echo up
} | gen 640 /etc/hostname.wg0

# The diff. Each differing file goes on the list that the copy and the service actions read.
(cd "${t}" && find . -type f) | sed 's/^\.//' | sort > "${w}/files"
while read -r f; do
	next="$(stat -f %Lp "${t}${f}") root"
	if [ ! -e "${f}" ]; then
		echo "new: ${f}"
	elif ! cmp -s "${f}" "${t}${f}"; then
		case ${f} in
		/etc/hostname.wg0) echo "changed, content private: ${f}" ;;
		*) diff -u -L "${f} (live)" -L "${f} (next)" "${f}" "${t}${f}" || [ "$?" -eq 1 ] ;;
		esac
	elif [ "$(stat -f '%Lp %Su' "${f}")" != "${next}" ]; then
		echo "mode and owner: ${f} is $(stat -f '%Lp %Su' "${f}"), next ${next}"
	else
		continue
	fi
	echo "${f}" >> "${w}/changed"
done < "${w}/files"
# These two folders hold only what the repo puts there.
for dir in /usr/local/sbin /var/www/htdocs/server; do
	[ ! -d "${dir}" ] || find "${dir}" -type f
done > "${w}/live"
while read -r f; do
	[ -e "${t}${f}" ] || { echo "remove: ${f}"; echo "${f}" >> "${w}/changed"; }
done < "${w}/live"

# ensure WHAT TEST MAKE runs MAKE unless TEST holds. With --check it only names WHAT.
ensure() {
	if eval "$2" > /dev/null 2>&1; then return; fi
	echo "make: $1" | tee -a "${w}/changed"
	[ -n "${check}" ] || eval "$3"
}
folder() { ensure "folder $3 of $1, mode $2" "[ \"\$(stat -f '%Su %Lp' $3)\" = '$1 $2' ]" "install -d -o $1 -m $2 $3"; }

ensure "user ${ADMIN_USER}" "id ${ADMIN_USER}" "useradd -m -G wheel -s /bin/ksh ${ADMIN_USER}"
ensure "doas password of ${ADMIN_USER}" "grep -q '^${ADMIN_USER}:[^*]' /etc/master.passwd" "passwd ${ADMIN_USER}"
ensure 'user deploy' 'id deploy' 'useradd -m -s /bin/sh deploy'
ensure 'user _feed' 'id _feed' 'useradd -d /var/empty -s /sbin/nologin -c "Feed jobs" _feed'
ensure 'package opensmtpd-filter-dkimsign' "pkg_info -qe 'opensmtpd-filter-dkimsign-*'" 'pkg_add -I opensmtpd-filter-dkimsign'
folder "${ADMIN_USER}" 700 "/home/${ADMIN_USER}/.ssh"
folder root 755 /home/deploy/.ssh
folder deploy 755 /var/www/web
folder _feed 755 /var/www/feed
folder "${ADMIN_USER}" 755 /var/www/files/f
folder _dkimsign 700 /etc/mail/dkim
ensure 'site folder' '[ -d /var/www/web/site ]' 'install -d -o deploy -m 755 /var/www/web/site'
ensure 'TLS key and a one-day certificate, which acme-client replaces' "[ -e /etc/ssl/${d}.fullchain.pem ]" \
	"openssl ecparam -genkey -name prime256v1 -out /etc/ssl/private/${d}.key && openssl req -x509 -new -key /etc/ssl/private/${d}.key -days 1 -subj /CN=${d} -out /etc/ssl/${d}.fullchain.pem"
ensure 'SRS key' '[ -e /etc/mail/srs.conf ]' 'echo "srs key $(openssl rand -hex 32)" > /etc/mail/srs.conf'
ensure 'DKIM key' "[ -e ${dkim_key} ]" "openssl genrsa -out ${dkim_key} 2048 2> /dev/null && chown _dkimsign ${dkim_key}"
ensure 'empty DNS blocklist' '[ -e /var/unbound/etc/blocklist.conf ]' 'install -m 644 /dev/null /var/unbound/etc/blocklist.conf'
ensure 'httpd, smtpd and unbound start at boot' '[ "$(rcctl ls on | grep -cxE "httpd|smtpd|unbound")" -eq 3 ]' 'rcctl enable httpd smtpd unbound'
ensure 'sndiod off: a server plays no sound' '! rcctl ls on | grep -qx sndiod' 'rcctl disable sndiod && rcctl stop sndiod'

# A change of WireGuard over SSH would cut the session that makes it.
wg=0
if grep -qx /etc/hostname.wg0 "${w}/changed" && [ -e /etc/hostname.wg0 ]; then
	case $(tty || :) in /dev/ttyC*) wg=1 ;; *) wg=3; echo 'The WireGuard peers would change. Run install.sh on the console of the server.' ;; esac
fi
[ -s "${w}/changed" ] || echo 'No drift.'

# The staged configs must load before any of them is copied.
valid() {
	"$@" > "${w}/out" 2>&1 || { echo "config check failed: $*"; cat "${w}/out"; [ -n "${check}" ] || exit 1; }
}
valid sshd -t -f "${t}/etc/ssh/sshd_config"
valid httpd -n -f "${t}/etc/httpd.conf"
valid smtpd -n -f "${t}/etc/mail/smtpd.conf"
valid unbound-checkconf "${t}/var/unbound/etc/unbound.conf"
valid acme-client -n -f "${t}/etc/acme-client.conf"
valid pfctl -nf "${t}/etc/pf.conf"
[ "${wg}" -ne 3 ] || exit 3
[ -z "${check}" ] || exit 0

# The copy.
umask 022
while read -r f; do
	case ${f} in
	/*) if [ -e "${t}${f}" ]; then install -D -m "$(stat -f %Lp "${t}${f}")" "${t}${f}" "${f}"; else rm -f "${f}"; fi ;;
	*) ;;
	esac
done < "${w}/changed"
find /var/www/htdocs/server -depth -type d -empty -exec rmdir {} +

# Each service starts again only when a file of its own changed.
while read -r paths action; do
	if grep -qE "^(${paths})" "${w}/changed"; then eval "${action}"; fi
done <<EOF
/etc/myname hostname ${d}
/etc/sysctl.conf sysctl -q \$(grep -v '^#' /etc/sysctl.conf)
/etc/pf.conf pfctl -f /etc/pf.conf
/etc/hostname.vio0 sh /etc/netstart vio0
/etc/ssh/ rcctl restart sshd
/etc/syslog.conf|/usr/local/sbin/ssh-alert rcctl restart syslogd
/etc/httpd.conf rcctl restart httpd
/etc/mail/ rcctl restart smtpd
/var/unbound/ rcctl restart unbound
EOF
if [ "${wg}" -eq 1 ]; then ifconfig wg0 destroy; fi
if ! ifconfig wg0 > /dev/null 2>&1; then sh /etc/netstart wg0; fi
[ -s /var/unbound/etc/blocklist.conf ] || /usr/local/sbin/blocklist-update
echo "Done. WireGuard public key of the server: $(ifconfig wg0 | awk '$1 == "wgpubkey" { print $2 }')"
