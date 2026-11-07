#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  need node
  bin/hotrun node /nonexistent.ts > /dev/null 2>&1 && fail "a missing program passed hotrun"
  bin/hotescape /nonexistent > /dev/null 2>&1 && fail "a missing directory passed hotescape"
  echo OK
}

main
