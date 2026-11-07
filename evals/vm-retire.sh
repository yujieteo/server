#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
state=/root/eval-state

plant() {
	printf '%s\n' '#!/bin/sh' 'sleep 100000' > /usr/local/sbin/neurons_room
	chmod 755 /usr/local/sbin/neurons_room
	printf '%s\n' '#!/bin/ksh' 'daemon="/usr/local/sbin/neurons_room"' 'pexp="/bin/sh /usr/local/sbin/neurons_room"' '. /etc/rc.d/rc.subr' 'rc_bg=YES' "rc_cmd \$1" > /etc/rc.d/neurons_room
	chmod 555 /etc/rc.d/neurons_room
	printf '%s\n' '#!/bin/sh' 'cat > /dev/null' > /usr/local/sbin/fleet-upload
	chmod 755 /usr/local/sbin/fleet-upload
	useradd -d /home/fleet -s /usr/local/sbin/fleet-upload fleet
	install -d -m 755 /home/fleet /home/fleet/.ssh /var/www/fleet /var/www/pond/entries
	echo "ssh-ed25519 AAAAold fleet-test-key" > /home/fleet/.ssh/authorized_keys
	echo "ssh-ed25519 AAAAarchive fleet-archive-key" > /home/fleet/.ssh/authorized_keys.disabled
	echo page > /var/www/fleet/mac.html
	echo entry > /var/www/pond/entries/one.json
	rcctl enable slowcgi neurons_room
	rcctl start slowcgi neurons_room
}

pieces_were_planted() {
	rcctl check slowcgi neurons_room && id fleet && [ -s /home/fleet/.ssh/authorized_keys ]
}

is_stopped_and_off() {
	! rcctl check "$1" && ! rcctl ls on | grep -qx "$1"
}

fleet_is_locked() {
	got=$(awk -F: '$1 == "fleet" { print $2, $10 }' /etc/master.passwd)
	[ "${got}" = "* /sbin/nologin" ]
}

keys_are_off() {
	[ ! -e /home/fleet/.ssh/authorized_keys ] && grep -q fleet-archive-key /home/fleet/.ssh/authorized_keys.disabled && cat /home/fleet/.ssh/authorized_keys.disabled* | grep -q fleet-test-key
}

upload_is_off() {
	mode=$(mode_of /usr/local/sbin/fleet-upload)
	[ "${mode}" = 0 ] && [ -e /usr/local/sbin/fleet-upload ]
}

files_remain() {
	[ -s /var/www/fleet/mac.html ] && [ -s /var/www/pond/entries/one.json ] && [ -e /etc/rc.d/neurons_room ] && [ -e /usr/local/sbin/neurons_room ]
}

wg_key_same() {
	now=$(awk '$1 == "wgkey" { print $2 }' /etc/hostname.wg0 | sha256 -q)
	before=$(cat "${state}/wg")
	[ "${now}" = "${before}" ]
}

others_run() {
	rcctl check httpd relayd smtpd unbound sshd cron && ifconfig wg0 | grep -q 'inet 10.8.0.1 netmask 0xffffff00'
}

retired_first() {
	expect vm:retire-room-stopped-first is_stopped_and_off neurons_room
	expect vm:retire-slowcgi-stopped-first is_stopped_and_off slowcgi
	expect vm:retire-fleet-locked-first fleet_is_locked
	expect vm:retire-fleet-keys-off-first keys_are_off
	expect vm:retire-fleet-upload-off-first upload_is_off
	expect vm:retire-files-remain-first files_remain
	expect vm:retire-wireguard-untouched-first wg_key_same
	expect vm:retire-others-run-first others_run
}

retired_again() {
	expect vm:retire-room-stopped-again is_stopped_and_off neurons_room
	expect vm:retire-slowcgi-stopped-again is_stopped_and_off slowcgi
	expect vm:retire-fleet-locked-again fleet_is_locked
	expect vm:retire-fleet-keys-off-again keys_are_off
	expect vm:retire-fleet-upload-off-again upload_is_off
	expect vm:retire-files-remain-again files_remain
	expect vm:retire-wireguard-untouched-again wg_key_same
	expect vm:retire-others-run-again others_run
}

plant
expect vm:retire-planted pieces_were_planted
sh install.sh > "${state}/retire-1.log" 2>&1
expect vm:retire-install-ok [ $? -eq 0 ]
retired_first
sh install.sh > "${state}/retire-2.log" 2>&1
expect vm:retire-install-again-ok [ $? -eq 0 ]
retired_again
finish
