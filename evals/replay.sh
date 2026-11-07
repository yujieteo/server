#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
. ./local.conf.example
export KNOWN_IPS FH_TOKEN
accept=0
[ "${1:-}" != --accept ] || accept=1
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT
definition=$(awk '/^put\(\) \{/,/^\}/' install.sh)
: > "${work}/modes"

put_one() {
	sh -c "set -eu; mode=legacy; ${definition}; put \"\$@\"" put "$@"
}

render_call() {
	src=$1
	dest=$2
	mode=${3:-}
	mkdir -p "${work}/raw$(dirname "${dest}")" "${work}/out$(dirname "${dest}")"
	put_one "${src}" "${work}/raw${dest}" ${mode:+"${mode}"}
	raw_mode=$(mode_of "${work}/raw${dest}")
	printf '%s\t%s\n' "${dest}" "${raw_mode}" >> "${work}/modes"
	keep "${work}/raw${dest}" > "${work}/out${dest}"
}

render() {
	grep -E '^put etc/[^ ]+ /[^ ]+( [0-9]+)?$' install.sh > "${work}/calls"
	while read -r _ src dest mode; do
		render_call "${src}" "${dest}" "${mode}"
	done < "${work}/calls"
}

golden_mode() {
	awk -F'\t' -v d="$1" '$1 == d { print $2 }' evals/golden/modes.tsv
}

same_as_golden() {
	want=$(golden_mode "$1")
	cmp -s "${work}/out$1" "evals/golden$1" && [ "$2" = "${want}" ]
}

compare() {
	sort "${work}/modes" > "${work}/modes.sorted"
	while IFS='	' read -r dest mode; do
		expect "replay:${dest#/}" same_as_golden "${dest}" "${mode}"
		diff "evals/golden${dest}" "${work}/out${dest}" | head -20
	done < "${work}/modes.sorted"
	expect replay:file-list cmp -s "${work}/modes.sorted" evals/golden/modes.tsv
}

accept_golden() {
	sort "${work}/modes" > "${work}/modes.sorted"
	rm -rf evals/golden/etc evals/golden/var
	cp -R "${work}/out/." evals/golden
	cp "${work}/modes.sorted" evals/golden/modes.tsv
	echo "replay: golden files written"
}

refuses_sed_characters() {
	KNOWN_IPS='a#b' put_one etc/pf.conf "${work}/refused" && return 1
	[ ! -e "${work}/refused" ]
}

render
if [ "${accept}" -eq 1 ]; then accept_golden; exit 0; fi
compare
expect replay:put-refuses-sed-characters refuses_sed_characters
finish
