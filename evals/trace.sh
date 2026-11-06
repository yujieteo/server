#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT
req=${1:-REQUIREMENTS.md}
tick=$(printf '\140')

file_of() {
	case $1 in
	vm) echo evals/vm.sh ;;
	replay) echo evals/replay.sh ;;
	conf) echo evals/conf-keys.sh ;;
	secrets) echo evals/secrets-detect.sh ;;
	wkd) echo evals/vm-wkd.sh ;;
	*) echo none ;;
	esac
}

identities() {
	grep -ohE 'expect (vm|replay|conf|secrets|wkd):[A-Za-z0-9_./-]+' evals/*.sh | sed 's/^expect //'
	grep -ohE "\"vm:[a-z]+-[$]\(" evals/vm.sh | tr -d '"[$]('
	sed 's#^/#replay:#; s/\t.*//' evals/golden/modes.tsv
	cut -f1 evals/baseline.tsv | sed 's/^/bench:/'
}

ref_exists() {
	kind=${1%%:*}
	name=${1#*:}
	case ${kind} in
	test.sh) grep -qxF "${name}" "${work}/groups" ;;
	manual) [ -n "${name}" ] ;;
	*) grep -qxF -e "$1" -e "$1-" "${work}/identities" ;;
	esac
}

identity_used() {
	bare=${1%-}
	grep -vE '^- \*\*GONE-' "${req}" | grep -F -e "${tick}${bare}${tick}" > /dev/null
}

ids_of() {
	grep -E '^- \*\*[A-Z]+-[0-9]+\*\*' "${req}" | sed 's/^- \*\*\([A-Z]*-[0-9]*\)\*\*.*/\1/'
}

refs_of() {
	grep -F -e "- **$1**" "${req}" | grep -o "${tick}[a-z.]*:[^${tick}]*${tick}" | tr -d "${tick}"
}

all_refs_exist() {
	refs_of "$1" > "${work}/refs"
	[ -s "${work}/refs" ] || return 1
	bad=0
	while IFS= read -r r; do
		if ! ref_exists "${r}"; then echo "  $1 names a missing eval: ${r}"; bad=1; fi
	done < "${work}/refs"
	[ "${bad}" -eq 0 ]
}

group_used() {
	grep -o "${tick}test.sh:[^${tick}]*${tick}" "${req}" | grep -qxF "${tick}test.sh:$1${tick}"
}

unique_ids() {
	[ "$(ids_of | sort | uniq -d | wc -l | tr -d ' ')" -eq 0 ]
}

identities | sort -u > "${work}/identities"
sed -n 's/^\(.*[^A-Za-z_]\)\{0,1\}t "\([^":]*\)[:"].*/\2/p' test.sh | sort -u > "${work}/groups"
ids_of | grep -v '^GONE-' > "${work}/kept"
expect trace:ids-are-unique unique_ids
while IFS= read -r id; do
	expect "trace:${id}" all_refs_exist "${id}"
done < "${work}/kept"
while IFS= read -r group; do
	expect "trace:test.sh-group-${group}" group_used "${group}"
done < "${work}/groups"
while IFS= read -r id; do
	expect "trace:eval-${id}-has-a-requirement" identity_used "${id}"
done < "${work}/identities"
echo "trace: $(wc -l < "${work}/kept" | tr -d ' ') requirements with evals"
finish
