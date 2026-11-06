#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
. ./local.conf
state=/root/eval-state
g=evals/golden
mkdir -p "$state"

secret_hash() {
	case $1 in
	wg) awk '$1 == "wgkey" { print $2 }' /etc/hostname.wg0 | sha256 -q ;;
	srs) sha256 -q /etc/mail/srs.conf ;;
	*) sha256 -q "$1" ;;
	esac
}

snapshot() {
	secret_hash wg > "$state/wg"
	secret_hash srs > "$state/srs"
	secret_hash /etc/ssl/private/teoyujie.org.key > "$state/tls"
	secret_hash /etc/ssl/private/apps.key > "$state/apps"
	echo "snapshot kept: no value printed"
}

same_as_before() {
	[ "$(secret_hash "$2")" = "$(cat "$state/$1")" ]
}

wg_normal() {
	sed 's/^wgkey .*/wgkey KEY/' /etc/hostname.wg0
}

wg_is_up() {
	ifconfig wg0 | grep -q 'inet 10.8.0.1 netmask 0xffffff00' &&
		ifconfig wg0 | grep -q 'wgport 51820' &&
		[ "$(ifconfig wg0 | grep -c wgpeer)" -eq "$(echo "$WG_PEERS" | wc -w | tr -d ' ')" ]
}

modes_are() {
	want=$1
	shift
	for f in "$@"; do [ "$(mode_of "$f")" = "$want" ] || return 1; done
}

block_of() {
	crontab -l | sed -n '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/p' | awk -f evals/keep.awk
}

aliases_block() {
	sed -n '/^# BEGIN teoyujie.org/,/^# END teoyujie.org/p' /etc/mail/aliases
}

deploy_line() {
	echo "from=\"10.8.0.0/24,127.0.0.1\",restrict,command=\"/usr/local/sbin/deploy-only\" $DEPLOY_KEY"
}

is_wheel() {
	id "$ADMIN_USER" | grep -q wheel
}

is_detached() {
	echo "$1" | grep -q 'wg0 restarts in 2 seconds'
}

wg_conf_settled() {
	modes_are 640 /etc/hostname.wg0 && [ ! -e /etc/hostname.wg0.new ]
}

shell_of() {
	awk -F: -v u="$1" '$1 == u { print $NF }' /etc/passwd
}

installed_matches() {
	keep "$1" | cmp -s - "$g$1" && [ "$(mode_of "$1")" = "$2" ]
}

installed_all() {
	while IFS='	' read -r dest mode; do
		expect "vm:installed-$(echo "${dest#/}" | tr / -)" installed_matches "$dest" "$mode"
	done < "$g/modes.tsv"
}

check() {
	expect vm:wg-key-kept same_as_before wg wg
	expect vm:srs-key-kept same_as_before srs srs
	expect vm:tls-key-kept same_as_before tls /etc/ssl/private/teoyujie.org.key
	expect vm:apps-key-kept same_as_before apps /etc/ssl/private/apps.key
	expect vm:wg-conf [ "$(wg_normal)" = "$(cat $g/gen/etc/hostname.wg0)" ]
	expect vm:wg-conf-mode modes_are 640 /etc/hostname.wg0
	expect vm:wg-second-install-quiet [ ! -e /etc/hostname.wg0.new ]
	expect vm:wg-up wg_is_up
	expect vm:forwarding [ "$(sysctl -n net.inet.ip.forwarding)" = 1 ]
	expect vm:secret-modes modes_are 600 /etc/mail/srs.conf /etc/ssl/private/teoyujie.org.key /etc/ssl/private/apps.key /etc/relayd.conf /etc/pf.conf
	expect vm:admin-keys cmp -s "/home/$ADMIN_USER/.ssh/authorized_keys" $g/gen/home/admin/authorized_keys
	expect vm:tunnel-keys cmp -s /home/tunnel/.ssh/authorized_keys $g/gen/home/tunnel/authorized_keys
	expect vm:deploy-key [ "$(cat /home/deploy/.ssh/authorized_keys)" = "$(deploy_line)" ]
	expect vm:mail-virtual cmp -s /etc/mail/virtual $g/gen/etc/mail/virtual
	expect vm:mail-aliases [ "$(aliases_block)" = "$(cat $g/gen/etc/mail/aliases.block)" ]
	expect vm:crontab [ "$(block_of)" = "$(cat $g/gen/crontab.block)" ]
	expect vm:syslog-alert-once [ "$(grep -c ssh-alert /etc/syslog.conf)" -eq 1 ]
	expect vm:admin-wheel is_wheel
	expect vm:tunnel-shell [ "$(shell_of tunnel)" = /usr/local/sbin/tunnel-wait ]
	installed_all
	finish
}

wgchange() {
	before=$(secret_hash wg)
	peers=$(ifconfig wg0 | grep -c wgpeer)
	cp local.conf "$state/local.conf.kept"
	sed "s#^WG_PEERS='#WG_PEERS='extra:10.8.0.9:$(openssl rand -base64 32) #" "$state/local.conf.kept" > local.conf
	out=$(sh install.sh 2>&1); status=$?
	expect vm:wg-change-install [ "$status" -eq 0 ]
	expect vm:wg-change-detached is_detached "$out"
	sleep 8
	expect vm:wg-change-key-kept [ "$(secret_hash wg)" = "$before" ]
	expect vm:wg-change-applied [ "$(ifconfig wg0 | grep -c wgpeer)" -eq $((peers + 1)) ]
	expect vm:wg-change-mode wg_conf_settled
	cp "$state/local.conf.kept" local.conf
	finish
}

"${1:-check}"
