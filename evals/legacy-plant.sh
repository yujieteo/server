#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
state=/root/eval-state
mkdir -p "${state}"
printf '%s\n' '#!/bin/sh' 'cat > /dev/null' > /usr/local/sbin/fleet-upload
chmod 755 /usr/local/sbin/fleet-upload
id fleet >/dev/null 2>&1 || useradd -d /home/fleet -s /usr/local/sbin/fleet-upload fleet
usermod -s /usr/local/sbin/fleet-upload fleet
install -d -m 755 /home/fleet /home/fleet/.ssh /var/www/fleet /var/www/pond/entries
cp /root/deploy.pub /home/fleet/.ssh/authorized_keys
cp /etc/ssh/ssh_host_ed25519_key.pub /home/fleet/.ssh/authorized_keys.disabled
cp /etc/ssh/ssh_host_ecdsa_key.pub /home/fleet/.ssh/authorized_keys.disabled.1
cp www/errdocs/err.html /var/www/fleet/mac.html
host=$(hostname)
printf '{"host":"%s"}\n' "${host}" > /var/www/pond/entries/one.json
cp /var/www/fleet/mac.html "${state}/fleet-page"
cp /var/www/pond/entries/one.json "${state}/pond-entry"
find /home/fleet/.ssh -name 'authorized_keys.disabled*' -type f | sort > "${state}/fleet-archive-paths"
while IFS= read -r archive; do sha256 "${archive}"; done < "${state}/fleet-archive-paths" > "${state}/fleet-archive-hashes"
cp /home/fleet/.ssh/authorized_keys "${state}/fleet-key"
