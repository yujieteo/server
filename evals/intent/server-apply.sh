#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  sh evals/apply.sh || fail "desktop staging must fail closed and default to preflight"
  echo OK
}

main
