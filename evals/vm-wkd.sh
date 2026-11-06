#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
hash=dj3498u4hyyarh35rkjfnghbjxug6b19
w=/.well-known/openpgpkey

head_of() {
	printf 'GET %s HTTP/1.0\r\nHost: teoyujie.org\r\n\r\n' "$1" |
		openssl s_client -quiet -connect 127.0.0.1:443 -servername teoyujie.org 2> /dev/null | tr -d '\r' |
		awk 'NR == 1 { s = $2 } /^Content-Length:/ { l = $2 } /^$/ { exit } END { print s, l }'
}

served() {
	[ "$(head_of "$1" | cut -d' ' -f1)" = 200 ]
}

same_as() {
	got=$(head_of "$2")
	[ "${got%% *}" = 200 ] && [ "${got}" = "$(head_of "$1")" ]
}

expect wkd:direct-hu served "${w}/hu/${hash}?l=contact"
expect wkd:direct-policy served "${w}/policy"
expect wkd:advanced-hu same_as "${w}/hu/${hash}?l=contact" "${w}/teoyujie.org/hu/${hash}?l=contact"
expect wkd:advanced-policy same_as "${w}/policy" "${w}/teoyujie.org/policy"
finish
