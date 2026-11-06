#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
hash=dj3498u4hyyarh35rkjfnghbjxug6b19
w=/.well-known/openpgpkey
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT

fetch() {
	printf 'GET %s HTTP/1.0\r\nHost: %s\r\n\r\n' "$2" "$1" |
		openssl s_client -quiet -connect 127.0.0.1:443 -servername "$1" 2> /dev/null > "${work}/raw"
	tr -d '\r' < "${work}/raw" | awk 'NR == 1 { s = $2 } /^Content-Length:/ { l = $2 } /^$/ { exit } END { print s, l }' > "${work}/head"
	set -- "$(cut -d' ' -f1 "${work}/head")" "$(cut -d' ' -f2 "${work}/head")"
	[ "$1" = 200 ] && [ -n "$2" ] || return 1
	tail -c "$2" "${work}/raw" > "${work}/body"
}

serves() {
	fetch "$1" "$2" && cmp -s "${work}/body" "$3"
}

key=www${w}/hu/${hash}
policy=www${w}/policy
expect wkd:direct-hu serves teoyujie.org "${w}/hu/${hash}?l=contact" "${key}"
expect wkd:direct-policy serves teoyujie.org "${w}/policy" "${policy}"
expect wkd:advanced-hu serves openpgpkey.teoyujie.org "${w}/teoyujie.org/hu/${hash}?l=contact" "${key}"
expect wkd:advanced-policy serves openpgpkey.teoyujie.org "${w}/teoyujie.org/policy" "${policy}"
finish
