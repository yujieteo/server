#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  local out
  need node
  out=$(node evals/emil/style.ts 2>&1) || fail "emil style eval failed: ${out}"
  has "${out}" "PASS web venue halves the site px scale"
  echo OK
}

main
