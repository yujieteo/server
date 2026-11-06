ROOT=${ROOT:-$(pwd)}

mode_of() {
	if [ "$(uname)" = Linux ]; then stat -c %a "$1"; else stat -f %Lp "$1"; fi
}

keep() {
	awk -f "${ROOT}/evals/keep.awk" "$1"
}

fails=0
verdict() {
	if [ "$1" = ok ]; then echo "PASS $2"; else echo "FAIL $2"; fails=$((fails + 1)); fi
}

expect() {
	expect_name=$1
	shift
	if "$@" > /dev/null 2>&1; then verdict ok "${expect_name}"; else verdict bad "${expect_name}"; fi
}

finish() {
	if [ "${fails}" -eq 0 ]; then echo OK; else echo "${fails} failed"; exit 1; fi
}
