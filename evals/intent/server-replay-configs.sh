#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  sh evals/replay.sh > /dev/null 2>&1 || fail "sh evals/replay.sh failed"
  echo OK
}

main
