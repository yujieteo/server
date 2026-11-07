#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  sh evals/trace.sh > /dev/null 2>&1 || fail "sh evals/trace.sh failed"
  echo OK
}

main
