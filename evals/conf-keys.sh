#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
. ./local.conf.example

keys_ok() {
	[ -n "$1" ] || return 1
	printf '%s\n' "$1" | sed '/^[[:space:]]*$/d' > "${keys_file}"
	[ -s "${keys_file}" ] || return 1
	! awk '$1 != "ssh-ed25519" || NF < 3 { bad = 1 } END { exit !bad }' "${keys_file}"
}

peers_ok() {
	[ -n "$1" ] || return 1
	for p in $1; do
		echo "${p}" | grep -Eq '^[A-Za-z0-9_-]+:10\.8\.0\.([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]):[A-Za-z0-9+/]{43}=$' || return 1
	done
}

words_ok() {
	for a in $1; do echo "${a}" | grep -Eq '^[a-z0-9._-]+$' || return 1; done
}

known_ips_ok() {
	case $1 in "" | *[\#\&\\]*) return 1 ;; *) return 0 ;; esac
}

keys_file=$(mktemp)
trap 'rm -f "${keys_file}"' EXIT
expect conf:keys-admin-user sh -c "echo '${ADMIN_USER}' | grep -Eq '^[a-z_][a-z0-9_-]*\$'"
expect conf:keys-admin-key keys_ok "${ADMIN_KEY}"
expect conf:keys-deploy-key keys_ok "${DEPLOY_KEY}"
expect conf:keys-tunnel-key keys_ok "${TUNNEL_KEY}"
expect conf:keys-forward-to sh -c "echo '${FORWARD_TO}' | grep -Eq '^[^@ ]+@[^@ ]+\\.[a-z]+\$'"
expect conf:keys-aliases words_ok "${ALIASES}"
expect conf:keys-wg-peers peers_ok "${WG_PEERS}"
expect conf:keys-known-ips known_ips_ok "${KNOWN_IPS}"
expect conf:ignored git check-ignore -q local.conf
finish
