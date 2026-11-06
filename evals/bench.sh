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

payload_bytes() {
	dir=$(mktemp -d)
	git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C "${dir}"
	cp local.conf.example "${dir}/local.conf"
	pack=$(sed -n 's/^\(tar [^|]*\) | ssh.*/\1/p' apply)
	bytes=$(cd "${dir}" && { sh -c "${pack}" 2> /dev/null || sh -c "$(echo "${pack}" | sed 's/--no-mac-metadata //')"; } | wc -c | tr -d ' ')
	rm -rf "${dir}"
	echo "${bytes}"
}

local_bench() {
	within apply_bytes "$(payload_bytes)"
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
