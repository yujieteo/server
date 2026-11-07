#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  sh evals/deploy-only.sh > /dev/null || fail "deploy-only must keep the names the live script accepts"
  echo OK
}

main
