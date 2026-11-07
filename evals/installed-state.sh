#!/bin/sh
state_paths() {
	find "$@" -type f -exec sha256 -q {} \; || return 1
	find "$@" -type d -exec stat -f '%N %p %u %g' {} \; || return 1
	find "$@" ! -type d -exec stat -f '%N %p %u %g %m' {} \;
}

state() {
	state_paths /etc /home /usr/local/sbin /var/cron/tabs || return 1
	hostname || return 1
	sysctl -n net.inet.ip.forwarding || return 1
	rcctl ls started || return 1
	ifconfig wg0 2>/dev/null | sha256 -q
}

service_pids() {
	for service in sshd syslogd httpd relayd smtpd unbound cron slowcgi neurons_room; do
		printf '%s\n' "${service}"
		if pgrep -x "${service}"; then printf 'present\n'; else printf 'absent\n'; fi
	done
}
