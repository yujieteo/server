#!/bin/sh
# Tests for .claude/hooks/deny-live.py.
set -eu

hook='.claude/hooks/deny-live.py'

refuse() {
	cmd=$1
	code=0
	err=$(python3 -I -c 'import json, sys; print(json.dumps({"tool_input": {"command": sys.argv[1]}}))' "$cmd" |
		python3 -I "$hook" 2>&1) || code=$?
	if [ "$code" -ne 2 ]; then
		echo "FAIL deny-live did not refuse (exit $code): $cmd" >&2
		exit 1
	fi
	case $err in
	'deny-live: refused, '*) ;;
	*) echo "FAIL deny-live gave no reason for: $cmd ($err)" >&2; exit 1 ;;
	esac
}

allow() {
	cmd=$1
	if ! err=$(python3 -I -c 'import json, sys; print(json.dumps({"tool_input": {"command": sys.argv[1]}}))' "$cmd" |
		python3 -I "$hook" 2>&1); then
		echo "FAIL deny-live refused safe command: $cmd ($err)" >&2
		exit 1
	fi
}

refuse './apply --check admin@10.8.0.1'
refuse './apply --install chk1 admin@10.8.0.1'
refuse 'sh apply --bootstrap root@192.0.2.1'
refuse 'sh test.sh --outside'
refuse 'bash -lc "./apply --check admin@10.8.0.1"'
refuse 'env -u FOO sh install.sh'
refuse './share --list'
refuse 'ssh admin@10.8.0.1'
refuse 'scp a admin@10.8.0.1:b'
refuse 'rsync -a ./x admin@10.8.0.1:y'
refuse 'sh install.sh -n'
refuse 'sh < install.sh'
refuse 'sh ci/apply'
refuse 'echo "<<EOF"
./apply --install chk1 admin@10.8.0.1'

allow 'bash .github/ci/check'
allow 'oksh -n apply'
allow 'oksh -n install.sh'
allow 'oksh -n test.sh'
allow 'shellcheck -s sh apply install.sh test.sh share'
allow 'sh tests/share-list.sh'
allow 'prove tests/'
allow 'cat apply'
allow 'git diff install.sh'
allow 'ssh-keygen -q -t ed25519 -N "" -f /tmp/k'
allow 'sshd -t -f etc/sshd_config -h /tmp/k'

code=0
printf 'not json' | python3 -I "$hook" 2>/dev/null || code=$?
if [ "$code" -ne 2 ]; then
	echo "FAIL deny-live did not fail closed on bad json (exit $code)" >&2
	exit 1
fi
echo 'deny-live tests passed.'
