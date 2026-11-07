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
	base_value=$(column "$1" 2)
	max_value=$(column "$1" 3)
	echo "bench $1 value=$2 baseline=${base_value} max=${max_value}"
	expect "bench:$1" at_most "$2" "${max_value}"
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
	plain=$(echo "$2" | sed 's/--no-mac-metadata //')
	(cd "$1/tree" && sh -c "$2" > "$1/payload.tgz" 2> /dev/null) ||
		(cd "$1/tree" && sh -c "${plain}" > "$1/payload.tgz")
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
	if [ -s "${work}/bytes" ]; then
		bytes=$(cat "${work}/bytes")
		within apply_bytes "${bytes}"
	fi
	rm -rf "${work}"
}

vm_bench() {
	seconds=$(cat /root/second-install-seconds)
	within second_install_seconds "${seconds}"
	pass=$(grep -c '^ok  ' /root/test.log)
	bad=$(grep -c '^FAIL' /root/test.log)
	rate=$(awk -v p="${pass}" -v b="${bad}" 'BEGIN { printf "%.3f", b / (p + b) }')
	within error_rate "${rate}"
}

case ${1:-local} in
local) local_bench ;;
vm) vm_bench ;;
*) echo "usage: bench.sh local|vm" ; exit 2 ;;
esac
finish
