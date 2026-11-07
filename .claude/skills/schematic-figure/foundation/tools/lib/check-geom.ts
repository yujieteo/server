import { addFail, addInfo, addSoft, addWarn } from './report.ts';
import type { Ctx } from './check-ctx.ts';
import { minOf, uniq } from './numeric.ts';
import type { Manifest, Relation, StrokeItem } from './manifest.ts';
import type { Report } from './report.ts';

function key(r: Relation): string {
  return `${r.from}->${r.to}`;
}

function keyList(L: Relation[]): string {
  const out: string[] = [];
  for (const r of L) out.push(key(r));
  return out.join(', ');
}

export function checkStrokes(c: Ctx): void {
  const { M, fm, r } = c;
  const thin: StrokeItem[] = [], heavy: StrokeItem[] = [];
  for (const s of M.strokes) {
    if (s.w < fm.line - 1e-6) thin.push(s);
    if (s.w > fm.heavy && !/beam|fiber|block|glow/.test(s.part)) heavy.push(s);
  }
  if (thin.length) {
    const ws: number[] = [], parts: string[] = [];
    for (const s of thin) { ws.push(s.w); parts.push(s.part === '' ? s.tag : s.part); }
    addWarn(r, `${thin.length} strokes thinner than ${fm.line} pt at final size (min ${minOf(ws).toFixed(3)} pt) in: ${uniq(parts).slice(0, 6).join(', ')}`);
  }
  if (heavy.length) addSoft(r, c.rep, `${heavy.length} strokes heavier than ${fm.heavy} pt outside beams/fibres`);
}

export function checkImages(c: Ctx): void {
  for (const im of c.M.images) {
    if (!im.px[0]) { addWarn(c.r, `image without pixel size (pass pxw/pxh): ${im.href}`); continue; }
    const ppi = im.px[0] / (im.box.w / 72);
    if (ppi < c.fm.ppi) addFail(c.r, `image ${im.href.slice(0, 40)} is ${ppi.toFixed(0)} ppi at placed size (needs ${c.fm.ppi})`);
  }
}

export function relationProblems(M: Manifest, r: Report): void {
  const drawn = new Set<string>();
  for (const d of M.drawn) drawn.add(key(d));
  const missing: Relation[] = [], reversed: Relation[] = [];
  for (const x of M.relations) {
    if (drawn.has(key(x))) continue;
    if (drawn.has(`${x.to}->${x.from}`)) reversed.push(x);
    else missing.push(x);
  }
  if (missing.length) addFail(r, `declared relations not drawn: ${keyList(missing)}`);
  if (reversed.length) addFail(r, `relations drawn in the wrong direction: ${keyList(reversed)}`);
}

export function checkRelations(c: Ctx): void {
  const { M, r } = c;
  relationProblems(M, r);
  const declared = new Set<string>();
  for (const x of M.relations) declared.add(key(x));
  const extra: Relation[] = [];
  for (const d of M.drawn) if (!declared.has(key(d))) extra.push(d);
  if (M.relations.length && extra.length) addInfo(r, `drawn connectors not declared as relations: ${keyList(extra)}`);
  if (!M.relations.length) addInfo(r, 'no relations declared (F.relate): the connectivity check is off');
}

export function checkAnchors(c: Ctx): void {
  const off: string[] = [];
  for (const [k, a] of Object.entries(c.M.anchors)) if (a.x < 0 || a.y < 0 || a.x > c.M.W || a.y > c.M.H) off.push(k);
  if (off.length) addWarn(c.r, `anchors off the page: ${off.join(', ')}`);
}
