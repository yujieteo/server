function clean(line) {
	gsub(/ (fh|fleet)\.teoyujie\.org/, "", line)
	gsub(/ 10\.8\.0\.1:8790/, "", line)
	if (line ~ /^for n in /) gsub(/ (fh|fleet)/, "", line)
	return line
}
function removed(line) {
	if (line ~ /(^|[^A-Za-z0-9])(fh|fleet)([^A-Za-z0-9]|$)/) return 1
	return line ~ /8790|FH_TOKEN|site-update|neurons_room|pond|\/play\/neurons/
}
function block_start(line) {
	return line ~ /^[ \t]*(server "fleet\.|location "\/(pond|log)|location "\/play\/neurons)/
}
skip {
	opens = gsub(/\{/, "{", $0)
	closes = gsub(/\}/, "}", $0)
	depth += opens - closes
	if (depth <= 0) skip = 0
	next
}
{
	line = clean($0)
	if (block_start(line)) {
		depth = gsub(/\{/, "{", line) - gsub(/\}/, "}", line)
		if (depth > 0) skip = 1
		next
	}
	if (removed(line)) next
	if (line ~ /^[ \t]*$/) { blank = 1; next }
	if (blank && printed) print ""
	blank = 0
	printed = 1
	print line
}
