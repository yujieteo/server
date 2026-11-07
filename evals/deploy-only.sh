#!/bin/sh
ROOT=$(cd "$(dirname "$0")/.." && pwd) || exit 1
cd "${ROOT}" || exit 1
. ./evals/lib.sh
work=$(mktemp -d)
trap 'rm -rf "${work}"' EXIT HUP INT TERM
sed '/^cd /,$d' sbin/deploy-only > "${work}/names.sh"

accepts() {
	SSH_ORIGINAL_COMMAND=$1 sh "${work}/names.sh" > /dev/null 2>&1
}

refuses() {
	! accepts "$1"
}

accepts_all() {
	for name in site apps/mac apps/neuron-2 apps/a1b2; do accepts "${name}" || return 1; done
}

refuses_all() {
	for name in '' sh apps apps/ apps// apps/a/b apps/A apps/a.b apps/../x apps/a_b site/x site/ 'apps/a b' '../site' /site; do
		refuses "${name}" || return 1
	done
}

expect deploy:only-accepts-site-and-apps accepts_all
expect deploy:only-refuses-all-else refuses_all
finish
