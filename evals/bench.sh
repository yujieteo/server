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

pack_command() {
	sed -n 's/^\(tar [^|]*\) | ssh.*/\1/p' apply
}

stage() {
	git ls-files -co --exclude-standard -z > "$1/list" &&
		tar --null -T "$1/list" -cf "$1/stage.tar" &&
		mkdir "$1/tree" &&
		tar -xf "$1/stage.tar" -C "$1/tree" &&
		cp local.conf.example "$1/tree/local.conf"
}

pack() {
	(cd "$1/tree" && sh -c "$2" > "$1/payload.tgz" 2> /dev/null) ||
		(cd "$1/tree" && sh -c "$(echo "$2" | sed 's/--no-mac-metadata //')" > "$1/payload.tgz")
}

payload_ok() {
	dir=$(mktemp -d) || return 1
	cmd=$(pack_command)
	[ -n "${cmd}" ] && stage "${dir}" && pack "${dir}" "${cmd}" && [ -s "${dir}/payload.tgz" ] && tar -tzf "${dir}/payload.tgz" > /dev/null
	status=$?
	[ "${status}" -ne 0 ] || wc -c < "${dir}/payload.tgz" | tr -d ' ' > "${work}/bytes"
	rm -rf "${dir}"
	return "${status}"
}

local_bench() {
	work=$(mktemp -d)
	expect bench:apply_payload_built payload_ok
	[ -s "${work}/bytes" ] && within apply_bytes "$(cat "${work}/bytes")"
	rm -rf "${work}"
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
