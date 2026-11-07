#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  sh evals/conf-keys.sh > /dev/null 2>&1 || fail "sh evals/conf-keys.sh failed"
  echo OK
}

main
