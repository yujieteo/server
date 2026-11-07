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
exit "${INSTALL_STATUS:-0}"
EOF
chmod 755 "${work}/bin/ssh" "${work}/bin/doas"
PATH=${work}/bin:${PATH}
REMOTE=${work}/remote
export PATH REMOTE

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

expect deploy:default-check check_only
expect deploy:pack-failure archive_failure
expect deploy:transfer-failure transfer_failure
expect deploy:explicit-install explicit_install
expect deploy:install-failure install_failure
expect deploy:checkpoint-required checkpoint_required
finish
