#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

make_module() {
  local dir=$1 body=$2
  mkdir -p "${dir}"
  printf 'module hot\n\ngo 1.22\n' > "${dir}/go.mod"
  printf 'package hot\n\n%s\n' "${body}" > "${dir}/a.hot.go"
}

main() {
  local tmp out
  need go
  tmp=$(mktemp -d)
  make_module "${tmp}/bad" 'var Sink *int

func Leak(n int) {
	v := n
	Sink = &v
}'
  make_module "${tmp}/good" 'func Sum(a, b int) int {
	return a + b
}'
  out=$(bin/hotescape "${tmp}/good") || fail "clean file failed: ${out}"
  out=$(bin/hotescape "${tmp}/bad") && fail "escaping value passed: ${out}"
  has "${out}" "moved to heap"
  echo OK
}

main
