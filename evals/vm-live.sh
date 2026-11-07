#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
work=$(mktemp -d) || exit 1
cp local.conf "${work}/local.conf"
trap 'cp "${work}/local.conf" local.conf; rm -rf "${work}"' EXIT

. ./evals/installed-state.sh

refuses_without_change() {
	state > "${work}/before"
	if sh install.sh --live; then return 1; fi
	state > "${work}/after"
	cmp -s "${work}/before" "${work}/after"
}

match() {
	sh install.sh --check
}

mismatch() {
	sed 's/mac:10.8.0.2/desktop:10.8.0.2/' "${work}/local.conf" > local.conf
	refuses_without_change
	status=$?
	cp "${work}/local.conf" local.conf
	return "${status}"
}

pending() {
	cp /etc/hostname.wg0 /etc/hostname.wg0.new
	refuses_without_change
	status=$?
	rm /etc/hostname.wg0.new
	return "${status}"
}

down() {
	ifconfig wg0 destroy || return 1
	refuses_without_change
	status=$?
	sh /etc/netstart wg0 || return 1
	return "${status}"
}

stopped() {
	ifconfig wg0 down || return 1
	refuses_without_change
	status=$?
	ifconfig wg0 up || return 1
	return "${status}"
}

sample() {
	if ifconfig wg0 > "${work}/interface" 2>/dev/null; then
		sha256 -q "${work}/interface"
	else
		echo gone
	fi
}

quiet_install() {
	sample > "${work}/want"
	(
		while [ ! -e "${work}/stop" ]; do sample; sleep 0.1; done
	) > "${work}/samples" &
	watcher=$!
	sh install.sh --live
	status=$?
	sleep 3
	touch "${work}/stop"
	wait "${watcher}"
	want=$(cat "${work}/want")
	count=$(wc -l < "${work}/samples")
	printf 'wg0 samples: %s; install exit: %s\n' "${count}" "${status}"
	[ "${status}" -eq 0 ] && [ "${count}" -gt 30 ] &&
		! grep -vxF "${want}" "${work}/samples" && [ ! -e /etc/hostname.wg0.new ]
}

expect vm:live-match match
expect vm:live-mismatch mismatch
expect vm:live-pending pending
expect vm:live-down down
expect vm:live-stopped stopped
expect vm:live-install-quiet quiet_install
finish
