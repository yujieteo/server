#!/bin/sh
# Exercise share --list against disposable files; never contact the server.
set -eu

root=$(CDPATH='' cd -- "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT HUP INT TERM
mkdir -p "$tmp/bin" "$tmp/files/f/timed" "$tmp/files/f/permanent" "$tmp/files/f/marker-dir/.keep"
cp "$root/share" "$tmp/share"
printf '%s\n' 'ADMIN_USER=test' > "$tmp/local.conf"
touch "$tmp/files/f/timed/report" "$tmp/files/f/permanent/report" \
    "$tmp/files/f/permanent/.keep" "$tmp/files/f/marker-dir/report"

cat > "$tmp/bin/ssh" <<'EOF'
#!/bin/sh
set -eu
[ "$#" -eq 2 ] && [ "$1" = test@10.8.0.1 ] || exit 1
case $2 in
    *'cd /var/www/files/f'*) ;;
    *) exit 1 ;;
esac
# Relocate only the fixture root; keep the list logic exactly as sent to ssh.
cd "$SHARE_LIST_FIXTURE"
sh -ec "$(printf '%s\n' "$2" | sed 's@cd /var/www/files/f@cd .@')"
EOF
cat > "$tmp/bin/stat" <<'EOF'
#!/bin/sh
set -eu
[ "$#" -eq 3 ] && [ "$1" = -f ] && [ "$2" = %m ] || exit 1
case $3 in
    marker-dir|permanent|timed) printf '%s\n' 1704067200 ;;
    *) exit 1 ;;
esac
EOF
cat > "$tmp/bin/date" <<'EOF'
#!/bin/sh
set -eu
[ "$#" -eq 3 ] && [ "$1" = -r ] && [ "$2" = 1706659200 ] && [ "$3" = +%Y-%m-%d ] || exit 1
printf '%s\n' 2024-01-31
EOF

chmod +x "$tmp/bin/ssh" "$tmp/bin/stat" "$tmp/bin/date"
expected='2024-01-31  https://teoyujie.org/f/marker-dir/report
2024-01-31  https://teoyujie.org/f/timed/report
no scheduled expiry  https://teoyujie.org/f/permanent/report'
actual=$(LC_ALL=C SHARE_LIST_FIXTURE="$tmp/files/f" PATH="$tmp/bin:$PATH" sh "$tmp/share" --list)
if [ "$actual" != "$expected" ]; then
    printf 'Expected:\n%s\nActual:\n%s\n' "$expected" "$actual" >&2
    exit 1
fi
printf '%s\n' 'share --list: dated and permanent fixtures passed'
