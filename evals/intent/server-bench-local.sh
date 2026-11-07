#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  sh evals/bench.sh local > /dev/null 2>&1 || fail "sh evals/bench.sh local failed"
  echo OK
}

main
