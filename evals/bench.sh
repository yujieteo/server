#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
base=evals/baseline.tsv

column() {
	awk -F'\t' -v n="$1" -v c="$2" '$1 == n { print $c }' "${base}"
}

at_most() {
	awk -v v="$1" -v m="$2" 'BEGIN { exit !(v <= m) }'
}

within() {
	echo "bench $1 value=$2 baseline=$(column "$1" 2) max=$(column "$1" 3)"
	expect "bench:$1" at_most "$2" "$(column "$1" 3)"
}

local_bench() {
	bytes=$(git ls-files -co --exclude-standard -z | xargs -0 cat | wc -c | tr -d ' ')
	within apply_bytes "${bytes}"
}

vm_bench() {
	within second_install_seconds "$(cat /root/second-install-seconds)"
	pass=$(grep -c '^ok  ' /root/test.log)
	bad=$(grep -c '^FAIL' /root/test.log)
	within error_rate "$(awk -v p="${pass}" -v b="${bad}" 'BEGIN { printf "%.3f", b / (p + b) }')"
}

case ${1:-local} in
local) local_bench ;;
vm) vm_bench ;;
*) echo "usage: bench.sh local|vm" ; exit 2 ;;
esac
finish
