#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
gl=${1:?usage: secrets-detect.sh PATH_TO_GITLEAKS}
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT

leaks() {
	"${gl}" dir --no-banner --config "${ROOT}/.gitleaks.toml" "$1" > /dev/null 2>&1
	[ $? -eq 1 ]
}

clean() {
	"${gl}" dir --no-banner --config "${ROOT}/.gitleaks.toml" "$1" > /dev/null 2>&1
}

mkdir "${work}/wg" "${work}/srs" "${work}/clean"
printf 'wgkey %s=\nwgport 51820\n' "$(head -c 43 /dev/zero | tr '\0' A)" > "${work}/wg/hostname.wg0"
printf 'srs key %s\n' "$(openssl rand -hex 32)" > "${work}/srs/srs.conf"
printf 'wgkey KEY\n' > "${work}/clean/hostname.wg0"
expect secrets:wireguard leaks "${work}/wg"
expect secrets:srs leaks "${work}/srs"
expect secrets:clean clean "${work}/clean"
finish
