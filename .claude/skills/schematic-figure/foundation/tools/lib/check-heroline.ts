import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROUTE = /vector\s*3d|lightScene3|blender|illustrated\s*finish/i;

export interface Hero {
  has: boolean;
  none: boolean;
  routed: boolean;
  spec: boolean;
}

interface Src {
  text: string;
  hero: RegExp;
  none: RegExp;
}

function sources(figAbs: string, spec: string): Src[] {
  const out: Src[] = [];
  if (existsSync(spec)) out.push({ text: readFileSync(spec, 'utf8'), hero: /^\W*hero\W*:(.*)$/im, none: /^\W*hero\W*:\W*none\b/im });
  if (existsSync(figAbs)) out.push({ text: readFileSync(figAbs, 'utf8'), hero: /^\s*\/\/\s*hero\s*:(.*)$/im, none: /^\s*\/\/\s*hero\s*:\s*none\b/im });
  return out;
}

export function heroLine(figAbs: string): Hero {
  const spec = join(dirname(figAbs), '..', 'docs', 'spec.md');
  const srcs = sources(figAbs, spec);
  let has = false, none = false, routed = false;
  for (const s of srcs) {
    const m = s.hero.exec(s.text);
    if (m !== null && ROUTE.test(m[1] ?? '')) routed = true;
    if (s.hero.test(s.text)) has = true;
    if (s.none.test(s.text)) none = true;
  }
  return { has, none, routed, spec: existsSync(spec) };
}
