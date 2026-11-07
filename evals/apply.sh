#!/bin/sh
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "${ROOT}" || exit 1
. ./evals/lib.sh
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT HUP INT TERM
mkdir "${work}/tree" "${work}/bin" "${work}/remote"
git ls-files -co --exclude-standard > "${work}/files"
tar -cf "${work}/tree.tar" -T "${work}/files"
tar -xf "${work}/tree.tar" -C "${work}/tree"
cp local.conf.example "${work}/tree/local.conf"
mkdir "${work}/remote/server"
printf 'prior tree\n' > "${work}/remote/server/kept"
cat > "${work}/bin/ssh" <<'EOF'
set -eu
if [ "$1" = -t ]; then shift; fi
printf '%s\n' "$*" >> "${REMOTE}/transport"
if [ "${BANNER:-0}" = 1 ]; then echo 'SSH login notice'; fi
cd "${REMOTE}"
if [ "${BREAK_TRANSFER:-0}" = 1 ]; then
	head -c 100 > broken.tgz
	sh -c "$2" < broken.tgz
else
	sh -c "$2"
fi
EOF
cat > "${work}/bin/doas" <<'EOF'
printf '%s\n' "$*" >> "${REMOTE}/calls"
. "${EVAL_LIB}"
stage=${2%/*}
for file in "${stage}/www/contact.gpg" "${stage}/local.conf" "${stage}"; do mode_of "${file}" || exit 1; done > "${REMOTE}/modes"
exit "${INSTALL_STATUS:-0}"
EOF
chmod 755 "${work}/bin/ssh" "${work}/bin/doas"
PATH=${work}/bin:${PATH}
REMOTE=${work}/remote
EVAL_LIB=${ROOT}/evals/lib.sh
export PATH REMOTE EVAL_LIB

run_apply() {
	(cd "${work}/tree" && sh ./apply "$@")
}

prior_kept() {
	kept=$(cat "${REMOTE}/server/kept")
	[ "${kept}" = 'prior tree' ]
}

check_only() {
	run_apply admin@guest && grep -q -- '--check' "${REMOTE}/calls" && prior_kept
}

archive_failure() {
	rm "${REMOTE}/calls" "${REMOTE}/transport"
	mv "${work}/tree/local.conf" "${work}/saved.conf"
	if run_apply admin@guest; then return 1; fi
	mv "${work}/saved.conf" "${work}/tree/local.conf"
	[ ! -e "${REMOTE}/calls" ] && [ ! -e "${REMOTE}/transport" ] && prior_kept
}

transfer_failure() {
	if BREAK_TRANSFER=1 run_apply admin@guest; then return 1; fi
	stages=$(find "${REMOTE}" -name 'server-stage.*' | wc -l)
	[ ! -e "${REMOTE}/calls" ] && prior_kept && [ "${stages}" -eq 0 ]
}

explicit_install() {
	run_apply --install disk-checkpoint admin@guest &&
		grep -q -- '--live' "${REMOTE}/calls" && prior_kept
}

install_failure() {
	rm "${REMOTE}/calls"
	if INSTALL_STATUS=1 run_apply --install disk-checkpoint admin@guest; then return 1; fi
	stages=$(find "${REMOTE}" -name 'server-stage.*' | wc -l)
	[ "${stages}" -eq 0 ] && prior_kept
}

checkpoint_required() {
	rm "${REMOTE}/transport"
	if run_apply --install '' admin@guest; then return 1; fi
	[ ! -e "${REMOTE}/transport" ]
}

stage_modes() {
	mode=$(mode_of "${work}/tree/www/contact.gpg")
	printf '%s\n600\n700\n' "${mode}" > "${work}/wanted-modes"
	cmp -s "${work}/wanted-modes" "${REMOTE}/modes"
}

stage_validation() {
	rm "${REMOTE}/calls"
	if BANNER=1 run_apply admin@guest; then return 1; fi
	[ ! -e "${REMOTE}/calls" ] && prior_kept
}

expect deploy:default-check check_only
expect deploy:stage-modes stage_modes
expect deploy:pack-failure archive_failure
expect deploy:transfer-failure transfer_failure
expect deploy:explicit-install explicit_install
expect deploy:install-failure install_failure
expect deploy:stage-validation stage_validation
expect deploy:checkpoint-required checkpoint_required
finish
