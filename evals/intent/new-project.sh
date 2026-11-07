#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

check_one() {
  local lang=$1 short=$2 dir
  dir=$(mktemp -d)/p
  bin/new "${dir}" "${lang}" > /dev/null || fail "bin/new failed for ${lang}"
  local conf
  conf=$(< "${dir}/rules.conf")
  has "${conf}" "^lang=${short}"
  [[ -f "${dir}/EXPIRY" ]] || fail "${lang}: no EXPIRY"
  [[ ! -e "${dir}/SPEC.md" ]] || fail "${lang}: SPEC.md was copied"
  [[ -f "${dir}/.claude/skills/start/SKILL.md" ]] || fail "${lang}: no start skill"
  (cd "${dir}" && bin/rules && bin/mdgrade) || fail "${lang}: the new project fails its own rules"
}

main() {
  check_one go go
  check_one typescript ts
  check_one python py
  check_one rust rs
  echo OK
}

main
