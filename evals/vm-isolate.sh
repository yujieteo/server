#!/bin/sh
set -eu
os=$(uname)
uid=$(id -u)
[ "${os}" = OpenBSD ]
[ "${uid}" -eq 0 ]
[ -x /usr/bin/true ]
if rcctl check cron >/dev/null 2>&1; then rcctl stop cron >/dev/null; fi
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT
if [ ! -f /var/cron/tabs/root ]; then crontab /dev/null; fi
for tab in /var/cron/tabs/*; do
	[ -f "${tab}" ] || continue
	user=${tab##*/}
	crontab -u "${user}" -l > "${work}/before"
	sed '/^[[:space:]]*SHELL[[:space:]]*=/d' "${work}/before" > "${work}/body"
	{ echo 'SHELL=/usr/bin/true'; cat "${work}/body"; } > "${work}/next"
	crontab -u "${user}" "${work}/next"
done
rcctl start cron >/dev/null
