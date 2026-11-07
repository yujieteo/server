#!/usr/bin/env bash
. "$(dirname "$0")/../intent-lib.sh"

main() {
  need bun
  local tmp cdp
  tmp=$(mktemp -d)
  cdp="$(cd "$(dirname "$0")/../.." && pwd)/.claude/skills/schematic-figure/foundation/tools/lib/cdp.ts"
  mkdir -p "${tmp}/root/engine" "${tmp}/bundle" "${tmp}/proj" "${tmp}/root-evil"
  echo ok > "${tmp}/root/engine/a.txt"
  echo ok > "${tmp}/proj/p.txt"
  echo ok > "${tmp}/bundle/page.js"
  echo secret > "${tmp}/outside.txt"
  echo secret > "${tmp}/root-evil/s.txt"
  ln -s "${tmp}/outside.txt" "${tmp}/root/link.txt"
  ln -s "${tmp}/outside.txt" "${tmp}/bundle/link.txt"
  cat > "${tmp}/t.ts" << TS
import { serve } from '${cdp}';
const s = await serve('${tmp}/root', '${tmp}/proj', { dir: '${tmp}/bundle', pageJs: 'page.js', toolsJs: 'page.js' } as never);
const want: Record<string, number> = { '/engine/a.txt': 200, '/p.txt': 200, '/__bundle/page.js': 200, '/__bundle/..%2Foutside.txt': 404, '/__bundle/link.txt': 404, '/link.txt': 404, '/..%2Froot-evil/s.txt': 404, '/..%2Foutside.txt': 404 };
for (const [p, code] of Object.entries(want)) {
  const got = (await fetch('http://127.0.0.1:' + s.port + p)).status;
  if (got !== code) { console.log(p + ' gave ' + got + ', want ' + code); process.exit(1); }
}
process.exit(0);
TS
  bun "${tmp}/t.ts" || fail "a figure route served a path outside its root"
  rm -rf "${tmp}"
  echo OK
}

main
