#!/usr/bin/env bash
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${root}" || exit 1

fail() {
  echo "$1"
  exit 1
}

need() {
  command -v "$1" > /dev/null || fail "$1 is missing: run nix develop"
}

has() {
  grep -q -- "$2" <<< "$1" || fail "expected [$2] in: $1"
}
