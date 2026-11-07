#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"
export LC_ALL=C

keys() {
  jq -r ".$1 | keys[]" project.needs.json
}

listed_skills() {
  local d
  for d in .claude/skills/*/; do
    d=${d%/}
    echo "${d##*/}"
  done
}

listed_evals() {
  git ls-files -co --exclude-standard evals
}

listed_tools() {
  awk '/packages = with pkgs/ { on = 1; next } /\];/ { on = 0 } on { for (i = 1; i <= NF; i++) print $i }' flake.nix
}

same() {
  [[ "$2" = "$3" ]] || fail "$1 differ from project.needs.json: repo has [${2//$'\n'/ }] needs file has [${3//$'\n'/ }]"
}

reasons() {
  local missing
  missing=$(jq -r '.[] | to_entries[] | select((.value | type) != "string" or (.value | length) == 0) | .key' project.needs.json)
  [[ -z "${missing}" ]] || fail "no reason for: ${missing}"
}

main() {
  local have want
  need jq
  reasons
  have=$(listed_skills)
  want=$(keys skills)
  same skills "${have}" "${want}"
  have=$(listed_evals)
  want=$(keys evals)
  same evals "${have}" "${want}"
  have=$(listed_tools)
  want=$(keys tools)
  same tools "${have}" "${want}"
  echo OK
}

main
