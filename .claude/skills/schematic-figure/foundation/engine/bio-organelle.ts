// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, clipPath, ellipse, line, path, polygon, rect, smooth } from './draw.ts';
import { f3 } from './util.ts';
import type { Affine, Part, Reg } from './bio-util.ts';
import { aff, ellD, floorOf, fpt, frame, fw, lineD, mapD, reg } from './bio-util.ts';

export type MitoOpts = Reg & Loose<{ style: 'folds' | 'star'; body: string; cristae: string; stroke: string; width: number; folds: number }>;

function mitoFolds(g: Handle, w: number, h: number, K: number, sw: number, body: string, cr: string, nfOpt: number | undefined): void {
  const iw = w / 2 - 0.1 * h;
  const ih = 0.4 * h;
  const inD = ellD(0, 0, iw, ih);
  path(g, inD, { fill: shade(body, 0.3), stroke: shade(cr, -0.1), width: fw(K, sw * 1.2) });
  const cl = group(g, { clip: clipPath(g, inD) });
  const nf = nfOpt ?? Math.max(3, Math.round((w / h) * 2.4));
  const fl = 0.075 * h;
  for (let i = 0; i < nf; i++) {
    const x = -iw * 0.8 + (i * 1.6 * iw) / Math.max(1, nf - 1);
    const sg = i % 2 !== 0 ? 1 : -1;
    const y0 = sg * ih * 1.1;
    const y1 = -sg * ih * 0.3;
    const d =
      `M${f3(x - fl)},${f3(y0)} L${f3(x - fl)},${f3(y1 + sg * fl)} Q${f3(x - fl)},${f3(y1)} ${f3(x)},${f3(y1)} ` +
      `Q${f3(x + fl)},${f3(y1)} ${f3(x + fl)},${f3(y1 + sg * fl)} L${f3(x + fl)},${f3(y0)}`;
    path(cl, d, { fill: shade(cr, 0.15), stroke: shade(cr, -0.1), width: fw(K, sw * 1.2), part: 'crista' });
  }
}

export function mitochondrion(p: Parent, cx: number, cy: number, w: number, h: number, tilt: number = 0, o: MitoOpts = {}): Part {
  const K = floorOf(p);
  const g = group(p, { x: cx, y: cy, rotate: tilt, part: o.part ?? 'mitochondrion' });
  const body = o.body ?? '#f0b589';
  const cr = o.cristae ?? '#f07621';
  const st = o.stroke ?? '#111';
  const sw = fw(K, o.width ?? Math.max(0.02 * h, STYLE.line.thin));
  ellipse(g, 0, 0, w / 2, h / 2, { fill: body, stroke: st, width: sw });
  if ((o.style ?? 'folds') === 'star') {
    const pts: Point[] = [];
    for (let k = 0; k < 14; k++) {
      const a = ((k / 14) * 2) * Math.PI;
      pts.push([((Math.cos(a) * w) / 2) * (k % 2 !== 0 ? 0.3 : 0.62), ((Math.sin(a) * h) / 2) * (k % 2 !== 0 ? 0.28 : 0.74)]);
    }
    polygon(g, pts, { fill: cr, stroke: st, width: fw(K, sw * 0.65), join: 'miter' });
  } else mitoFolds(g, w, h, K, sw, body, cr, o.folds);
  const T = frame(cx, cy, tilt);
  const ports = reg(o, p, { center: [cx, cy], left: fpt(T, -w / 2, 0), right: fpt(T, w / 2, 0), top: fpt(T, 0, -h / 2), bottom: fpt(T, 0, h / 2) });
  return { node: g.node, ports };
}

export type DnaOpts = Loose<{ amp: number; period: number; shear: number; offset: number; c1: string; c2: string; paleEnds: boolean; angle: number; part: string }>;

interface DnaCtx {
  g: Handle;
  x0: number;
  x1: number;
  cy: number;
  A: number;
  P: number;
  sh: number;
  k: number;
  c1: string;
  c2: string;
  paleEnds: boolean;
}

function ribbon(c: DnaCtx, a: number, b: number, ph: number, col: string, isEnd: boolean): void {
  const top: Point[] = [];
  const bot: Point[] = [];
  for (let i = 0; i <= 30; i++) {
    const x = a + ((b - a) * i) / 30;
    const y = c.cy + c.A * Math.sin(c.k * x + ph);
    const shAt = !(isEnd && b === c.x1) ? c.sh : c.sh * (0.3 + 0.7 * Math.min(1, (c.x1 - x) / Math.max(1e-6, b - a)));
    top.push([x, y]);
    bot.push([x + shAt, y]);
  }
  path(c.g, lineD(top) + ' L' + lineD(bot.toReversed()).slice(1) + 'Z', { fill: col });
}

function dnaStrand(c: DnaCtx, ph: number, col: string, rising: boolean): void {
  const s0 = (Math.PI / 2 - ph) / c.k;
  for (let s = s0 - Math.ceil((s0 - c.x0) / (c.P / 2) + 1) * (c.P / 2); s < c.x1; s += c.P / 2) {
    const a = Math.max(c.x0, s);
    const b = Math.min(c.x1, s + c.P / 2);
    if (b - a < c.P / 60) continue;
    const mid = (a + b) / 2;
    const isEnd = c.paleEnds && b - a < c.P / 2 - c.P / 120;
    const isRising = isEnd ? false : Math.cos(c.k * mid + ph) < 0;
    if (isRising !== rising || (isEnd && col !== c.c2)) continue;
    ribbon(c, a, b, ph, col, isEnd);
  }
}

export function dna(p: Parent, x0: number, x1: number, cy: number, o: DnaOpts = {}): { node: SVGGElement } {
  const rotated = o.angle !== undefined && o.angle !== 0;
  const g = el(p, 'g', { 'data-part': o.part ?? 'dna', transform: rotated ? `rotate(${f3(o.angle ?? 0)} ${f3(x0)} ${f3(cy)})` : undefined });
  const A = o.amp ?? 0.035 * Math.abs(x1 - x0);
  const P = o.period ?? 4.7 * A;
  const c: DnaCtx = {
    g: { node: g }, x0, x1, cy, A, P, sh: o.shear ?? 0.67 * A, k: (2 * Math.PI) / P, c1: o.c1 ?? '#123f8c', c2: o.c2 ?? '#a2a7d6', paleEnds: o.paleEnds === true,
  };
  const off = 2 * Math.PI * (o.offset ?? 0.36);
  dnaStrand(c, 0, c.c2, false);
  dnaStrand(c, off, c.c2, false);
  dnaStrand(c, 0, c.c1, true);
  dnaStrand(c, off, c.c1, true);
  return { node: g };
}

export type NucleosomeOpts = Reg & Loose<{ rot: number; wraps: number; histone: string; face: string; dna: string }>;

export function nucleosome(p: Parent, cx: number, cy: number, R: number, o: NucleosomeOpts = {}): Part {
  const K = floorOf(p);
  const rot = o.rot ?? 22;
  const g = group(p, { x: cx, y: cy, rotate: rot, part: o.part ?? 'nucleosome' });
  const e = R * 0.42;
  const Lb = R * 1.05;
  const x0 = -Lb / 2;
  const x1 = Lb / 2;
  const hc = o.histone ?? '#38a3c3';
  const sw = fw(K, 0.04 * R);
  const nw = o.wraps ?? 3;
  path(g, `M${f3(x0)},${f3(-R)} L${f3(x1)},${f3(-R)} A${f3(e)},${f3(R)} 0 0 1 ${f3(x1)},${f3(R)} L${f3(x0)},${f3(R)} Z`, { fill: hc, stroke: shade(hc, -0.12), width: sw });
  for (let i = 0; i < nw; i++) {
    const xb = x0 + Lb * (0.3 + 0.56 * (nw > 1 ? i / (nw - 1) : 0.5));
    path(g, `M${f3(xb)},${f3(-R)} A${f3(e)},${f3(R)} 0 0 1 ${f3(xb)},${f3(R)}`, { stroke: o.dna ?? '#1d3a68', width: fw(K, 0.13 * R), cap: 'butt' });
  }
  ellipse(g, x0, 0, e, R, { fill: o.face ?? shade(hc, 0.2), stroke: shade(hc, -0.05), width: sw });
  const T = frame(cx, cy, rot);
  const ports = reg(o, p, { center: [cx, cy], left: fpt(T, x0 - e, 0), right: fpt(T, x1 + e, 0), top: fpt(T, 0, -R), bottom: fpt(T, 0, R) });
  return { node: g.node, ports };
}

export type LollipopOpts = Loose<{ color: string; stick: string; width: number; part: string }>;

export function lollipop(p: Parent, base: Point, head: Point, r: number, o: LollipopOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'mark' });
  const col = o.color ?? '#e3161f';
  line(g, base, head, { stroke: o.stick ?? '#2a2a2a', width: fw(K, o.width ?? Math.max(0.17 * r, STYLE.line.thin)) });
  circle(g, head[0], head[1], r, { fill: col, stroke: shade(col, -0.45), width: fw(K, 0.16 * r) });
  return { node: g };
}

export type LungsOpts = Reg & Loose<{ fill: string; fold: string; fissure: string; airway: string; stroke: string; trachea: boolean }>;

const LOBE: readonly Point[] = [
  [306, 137], [316, 144], [322, 162], [324, 200], [325, 245], [324, 278], [319, 286], [296, 292], [268, 302], [247, 309], [240, 302], [240, 268], [248, 228], [264, 188], [283, 158],
];
const NOTCHED: readonly Point[] = [
  [306, 137], [316, 144], [322, 162], [324, 200], [324, 234], [320, 246], [318, 260], [320, 274], [322, 283], [296, 292], [268, 302], [247, 309], [240, 302], [240, 268], [248, 228],
  [264, 188], [283, 158],
];

function lungPts(m: Affine, mirror: boolean, pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const [x, y] of pts) out.push(aff(m, mirror ? 671 - x : x, y));
  return out;
}

function trachea(g: Handle, m: Affine, u: number, K: number, air: string, ast: string): void {
  const aw = { fill: air, stroke: ast, width: fw(K, 0.9 * u) };
  path(g, mapD('M328,190 Q327,204 318,214 L325,216 Q331,206 335.5,203 Q340,206 346,216 L353,214 Q344,204 343,190 Z', m), aw);
  const [rx, ry] = aff(m, 327, 104);
  rect(g, rx, ry, 17 * u, 90 * u, { r: 3 * u, ...aw });
  for (let y = 108; y < 194; y += 5.2) path(g, mapD(`M327.5,${y} Q335.5,${y + 2.6} 343.5,${y}`, m), { stroke: shade(air, -0.3), width: fw(K, 1.3 * u), cap: 'butt' });
  path(g, mapD('M324,84 L327,80 L331,85 L335.5,82 L340,85 L344,80 L347,84 L346,94 Q343,102 339,106 L332,106 Q328,102 325,94 Z', m), { ...aw, fill: shade(air, 0.12) });
  path(g, mapD('M329,93 Q335.5,98 342,93', m), { stroke: ast, width: fw(K, 0.9 * u) });
}

export function lungs(p: Parent, cx: number, top: number, h: number, o: LungsOpts = {}): Part {
  const K = floorOf(p);
  const u = h / 229;
  const g = el(p, 'g', { 'data-part': o.part ?? 'lungs' });
  const m: Affine = { x0: cx, y0: top, sx: u, sy: u, ax: 335.5, ay: 80 };
  const fill = o.fill ?? '#dc9aa1';
  const fold = o.fold ?? '#c9707a';
  const fis = o.fissure ?? '#c47a85';
  const air = o.airway ?? '#6d8fc2';
  const lw = fw(K, 1.2 * u);
  path(g, smooth(lungPts(m, false, LOBE), true, 0.4), { fill, stroke: shade(fill, -0.06), width: lw, part: 'lung' });
  path(g, smooth(lungPts(m, true, NOTCHED), true, 0.4), { fill, stroke: shade(fill, -0.06), width: lw, part: 'lung' });
  const flap: Point[] = [[309, 150], [316, 156], [319, 172], [317, 180], [312, 170]];
  for (const mirror of [false, true]) path(g, smooth(lungPts(m, mirror, flap), true, 0.5), { fill: fold, opacity: 0.75 });
  path(g, smooth(lungPts(m, false, [[348, 236], [358, 243], [366, 257], [363, 271], [352, 281], [355, 268], [355, 251]]), true, 0.4), { fill: fold });
  const fiss = { stroke: fis, width: fw(K, 1.1 * u) };
  path(g, smooth(lungPts(m, false, [[246, 225], [272, 234], [300, 236], [323, 230]])), fiss);
  path(g, smooth(lungPts(m, false, [[241, 262], [258, 276], [276, 288]])), fiss);
  path(g, smooth(lungPts(m, true, [[312, 205], [290, 225], [258, 258]])), fiss);
  if (o.trachea !== false) trachea({ node: g }, m, u, K, air, o.stroke ?? shade(air, -0.2));
  const ports = reg(o, p, {
    top: [cx, top], trachea: aff(m, 335.5, 150), left: aff(m, 282, 240), right: aff(m, 671 - 282, 240), bottom: [cx, top + h], leftEdge: aff(m, 240, 260), rightEdge: aff(m, 671 - 240, 260),
  });
  return { node: g, ports };
}
