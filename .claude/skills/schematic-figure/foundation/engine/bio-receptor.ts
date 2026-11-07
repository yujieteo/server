// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, path, rect } from './draw.ts';
import { f3 } from './util.ts';
import { BIO, floorOf, fw, pol } from './bio-util.ts';
import { antibody } from './bio-protein.ts';

export type ReceptorKind = 'car' | 'antibody' | 'tcr' | 'stalk';
export type ReceptorOpts = Loose<{
  kind: ReceptorKind;
  style: 'flat';
  color: string;
  stroke: string;
  flip: boolean;
  spread: number;
  stalk: number;
  opacity: number;
}>;

interface RCtx {
  g: Handle;
  s: number;
  col: string;
  st: string;
  K: number;
  sw: number;
  o: ReceptorOpts;
}

function tcr(c: RCtx): void {
  const { g, s, K, sw, o } = c;
  const tc = o.color ?? '#2b6d9f';
  const dk = o.stroke ?? shade(tc, -0.3);
  const stl = 0.38 * s;
  const bw = 0.14 * s;
  const sep = 0.09 * s;
  for (const q of [-1, 1]) {
    line(g, [0, q * sep * 0.6], [stl, q * sep], { stroke: dk, width: fw(K, 0.075 * s), cap: 'round' });
    line(g, [0, q * sep * 0.6], [stl, q * sep], { stroke: '#fff', width: fw(K, 0.033 * s), cap: 'round' });
    rect(g, stl, q * sep - bw / 2, s - stl, bw, { r: bw * 0.25, fill: q > 0 ? tc : shade(tc, 0.12), stroke: dk, width: sw });
    for (let i = 1; i < 4; i++) {
      const bx = stl + ((s - stl) * i) / 4;
      line(g, [bx, q * sep - bw / 2], [bx, q * sep + bw / 2], { stroke: shade(tc, 0.35), width: fw(K, 0.02 * s) });
    }
  }
}

function car(c: RCtx): void {
  const { g, s, col, st, K, sw, o } = c;
  const k = o.flip === true ? -1 : 1;
  const x0 = 0.32 * s;
  const x1 = s;
  const w = 0.17 * s;
  const sep = 0.11 * s;
  line(g, [0, 0], [x0, 0], { stroke: st, width: fw(K, 0.07 * s), cap: 'butt' });
  const pad = 0.05 * s;
  const top = x1 + pad;
  const ya = -k * (sep + w / 2 + pad);
  const yb = k * (sep + w / 2 + pad);
  const rr = Math.abs(ya - yb) / 2;
  const hp =
    `M${f3(x0 - 0.02 * s)},0 Q${f3(x0 + 0.02 * s)},${f3(ya)} ${f3(x0 + 0.12 * s)},${f3(ya)} L${f3(top - rr)},${f3(ya)} ` +
    `A${f3(rr)},${f3(rr)} 0 0,${k > 0 ? 1 : 0} ${f3(top - rr)},${f3(yb)} L${f3(x0 + 0.18 * s)},${f3(yb)} ` +
    `Q${f3(x0 + 0.06 * s)},${f3(yb)} ${f3(x0 - 0.02 * s)},0`;
  path(g, hp, { stroke: st, width: sw, part: 'linker' });
  rect(g, x0, -k * sep - w / 2, x1 - x0, w, { r: w / 2, fill: col, stroke: st, width: sw });
  rect(g, x0 + 0.08 * s, k * sep - w / 2, x1 - x0 - 0.12 * s, w, { r: w / 2, fill: shade(col, 0.22), stroke: st, width: sw });
}

function igg(c: RCtx): void {
  const { g, s, col, st, sw, o } = c;
  const stem = 0.45 * s;
  const arm = 0.55 * s;
  const w = 0.13 * s;
  rect(g, 0, -w / 2, stem + w * 0.3, w, { r: w / 2, fill: col, stroke: st, width: sw });
  for (const sg of [-1, 1]) {
    const a = group(g, { x: stem, y: 0, rotate: sg * (o.spread ?? 32) });
    rect(a, 0, -w / 2, arm, w, { r: w / 2, fill: col, stroke: st, width: sw });
    rect(a, arm * 0.55, -w / 2, arm * 0.45, w, { r: w / 2, fill: shade(col, 0.3), stroke: st, width: sw });
  }
}

function stalkHead(c: RCtx): void {
  const { g, s, col, st, K, sw } = c;
  line(g, [0, 0], [0.75 * s, 0], { stroke: st, width: fw(K, 0.06 * s) });
  circle(g, 0.82 * s, 0, 0.14 * s, { fill: col, stroke: st, width: sw });
}

export function receptor(p: Parent, x: number, y: number, angle: number, size: number, o: ReceptorOpts = {}): { node: Element; tip: Point } {
  const K = floorOf(p);
  const s = size;
  const col = o.color ?? BIO.receptor;
  const st = o.stroke ?? shade(col, -0.35);
  const kind = o.kind ?? 'car';
  if (kind === 'antibody' && o.style === 'flat') {
    const a = antibody(p, x, y, angle, s, { style: 'flat', color: o.color, opacity: o.opacity, stalk: o.stalk ?? 0.3 * s, spread: o.spread });
    return { node: a.node, tip: pol(x, y, s, angle) };
  }
  const g = group(p, { x, y, rotate: angle, part: 'receptor', opacity: o.opacity });
  const sw = fw(K, Math.max(0.035 * s, STYLE.line.thin));
  const c: RCtx = { g, s, col, st, K, sw, o };
  if (kind === 'tcr') tcr(c);
  else if (kind === 'car') car(c);
  else if (kind === 'antibody') igg(c);
  else stalkHead(c);
  return { node: g.node, tip: pol(x, y, s, angle) };
}
