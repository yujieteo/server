// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { IllustrateSetting, Loose, Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { blur, circle, path, radialGradient, rect, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import { ball } from './illustrate.ts';
import type { Lineage, LineageName, Part, Rand, Reg } from './bio-util.ts';
import { LINEAGE, bez, floorOf, frame, fpt, fw, illOf, palOf, pol, rad, reg, rnd, rng, vary, varyTint } from './bio-util.ts';
import { vesicleDots } from './bio-cell-shape.ts';

export type MacrophageOpts = Reg &
  Loose<{
    palette: LineageName | Lineage;
    fill: string;
    stroke: string;
    width: number;
    seed: number;
    vesicles: boolean | number;
    nucleus: false | Loose<{ r: number; dx: number; dy: number; color: string; stroke: string }>;
  }>;

export function macrophage(p: Parent, cx: number, cy: number, r: number, o: MacrophageOpts = {}): Part {
  const K = floorOf(p);
  const pal = palOf(o.palette ?? 'myeloid') ?? LINEAGE.myeloid;
  const R = rng(o.seed ?? 7);
  const n = 88;
  const g = el(p, 'g', { 'data-part': o.part ?? 'macrophage' });
  const fill = o.fill ?? pal.fill;
  const st = o.stroke ?? pal.stroke;
  const sw = fw(K, o.width ?? Math.max(0.04 * r, STYLE.line.thin));
  const ph: number[] = [];
  for (let i = 0; i < n; i++) ph.push(rnd(R));
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const rr = r * (1 + 0.07 * Math.abs(Math.sin((i / n) * Math.PI * 11)) + 0.04 * (at(ph, i % n) - 0.5) + 0.04 * Math.sin((i / n) * 6.283 * 2 + 1));
    pts.push(pol(cx, cy, rr, (i * 360) / n));
  }
  path(g, smooth(pts, true, 0.5), { fill, stroke: st, width: sw, part: 'membrane' });
  if (o.vesicles !== false) vesicleDots(g, cx, cy, r, o.vesicles ?? 16, shade(fill, 0.55), R);
  if (o.nucleus !== false) {
    const nu = o.nucleus ?? {};
    circle(g, cx + (nu.dx ?? -0.05) * r, cy + (nu.dy ?? 0.1) * r, (nu.r ?? 0.42) * r, {
      fill: nu.color ?? pal.nucleus, stroke: nu.stroke ?? pal.nstroke, width: fw(K, 0.035 * r), part: 'nucleus',
    });
  }
  const ports = reg(o, p, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy], top: [cx, cy - r], bottom: [cx, cy + r] });
  return { node: g, ports };
}

export type ArmSpec = readonly [number, number, number] | readonly [number, number, number, number];
export type DendriticOpts = Reg &
  Loose<{
    palette: LineageName | Lineage;
    fill: string;
    stroke: string;
    width: number;
    arms: readonly ArmSpec[];
    nucleus: false | Loose<{ color: string; stroke: string }>;
  }>;

const ARMS: readonly ArmSpec[] = [
  [-132, 2.25, -30], [-100, 1.85, 24], [-62, 2.25, -20], [-33, 2.3, 26], [-8, 1.75, -24, 1], [38, 2.45, 28], [95, 2.2, -8], [148, 2.35, -18], [186, 2.0, 14, 1],
];

function armShape(cx: number, cy: number, r: number, a: number, len: number, bend: number, w0: number, w1: number): Point[] {
  const base = pol(cx, cy, r * 0.7, a);
  const tip = pol(cx, cy, r * len, a + bend * 0.5);
  const ctl = pol(cx, cy, (r * (0.7 + len)) / 2, a + bend);
  const ctrl: Point[] = [base, ctl, tip];
  const N = 12;
  const L1: Point[] = [];
  const R1: Point[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y] = bez(ctrl, t);
    const [x2, y2] = bez(ctrl, Math.min(1, t + 0.02));
    const [x1, y1] = bez(ctrl, Math.max(0, t - 0.02));
    const l = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / l;
    const ny = (x2 - x1) / l;
    const w = r * (w0 + (w1 - w0) * t) * (1 + 0.12 * Math.sin(t * 9));
    L1.push([x + nx * w, y + ny * w]);
    R1.push([x - nx * w, y - ny * w]);
  }
  const [ex, ey] = bez(ctrl, 1);
  const [px, py] = bez(ctrl, 0.95);
  const l = Math.hypot(ex - px, ey - py);
  const out: Point[] = [...L1, [ex + ((ex - px) / l) * r * w1, ey + ((ey - py) / l) * r * w1]];
  for (let i = R1.length - 1; i >= 0; i--) out.push(at(R1, i));
  return out;
}

function dendriticNucleus(g: Parent, K: number, cx: number, cy: number, r: number, pal: Lineage, o: DendriticOpts): void {
  const nu = o.nucleus === false || o.nucleus === undefined ? {} : o.nucleus;
  const nx = cx - 0.045 * r;
  const ny = cy - 0.045 * r;
  const k = -0.35;
  const pts: Point[] = [];
  for (let i = 0; i < 12; i++) {
    const t = rad(i * 30);
    const x = r * 0.58 * Math.cos(t);
    const y = r * 0.46 * Math.sin(t) * (1 + 0.1 * Math.cos(t));
    pts.push([nx + x * Math.cos(k) - y * Math.sin(k), ny + x * Math.sin(k) + y * Math.cos(k)]);
  }
  path(g, smooth(pts, true, 0.5), { fill: nu.color ?? pal.nucleus, stroke: nu.stroke ?? pal.nstroke, width: fw(K, 0.055 * r), part: 'nucleus' });
}

export function dendritic(p: Parent, cx: number, cy: number, r: number, o: DendriticOpts = {}): Part {
  const K = floorOf(p);
  const pal = palOf(o.palette ?? 'myeloid') ?? LINEAGE.myeloid;
  const g = el(p, 'g', { 'data-part': o.part ?? 'dendritic' });
  const fill = o.fill ?? pal.fill;
  const st = o.stroke ?? pal.stroke;
  const sw = fw(K, o.width ?? Math.max(0.07 * r, STYLE.line.thin * 2));
  const shapes: Point[][] = [];
  for (const arm of o.arms ?? ARMS) {
    const [a, len, bend, fork] = arm;
    shapes.push(armShape(cx, cy, r, a, len, bend, 0.2, 0.075));
    if (fork !== undefined && fork !== 0) shapes.push(armShape(cx, cy, r, a + bend * 0.4 + 14, len * 0.7, -bend * 0.8, 0.14, 0.07));
  }
  const bodyPts: Point[] = [];
  for (let i = 0; i < 18; i++) bodyPts.push(pol(cx, cy, r * (0.86 + 0.06 * Math.sin(i * 2.3)), i * 20));
  const body = smooth(bodyPts, true, 0.5);
  for (const sh of shapes) path(g, smooth(sh, true, 0.25), { fill, stroke: st, width: sw * 2 });
  path(g, body, { fill, stroke: st, width: sw * 2 });
  for (const sh of shapes) path(g, smooth(sh, true, 0.25), { fill });
  path(g, body, { fill, part: 'membrane' });
  if (o.nucleus !== false) dendriticNucleus(g, K, cx, cy, r, pal, o);
  const ports = reg(o, p, { center: [cx, cy], left: [cx - 2 * r, cy], right: [cx + 2 * r, cy], top: [cx, cy - 2 * r], bottom: [cx, cy + 2 * r] });
  return { node: g, ports };
}

export type BacteriumOpts = Reg & Loose<{ fill: string; stroke: string; width: number; highlight: boolean; flagella: number; seed: number }>;

export function bacterium(p: Parent, a: Point, b: Point, w: number, o: BacteriumOpts = {}): Part {
  const K = floorOf(p);
  const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const g = group(p, { x: a[0], y: a[1], rotate: ang, part: o.part ?? 'bacterium' });
  const fill = o.fill ?? '#cf5f5e';
  const st = o.stroke ?? shade(fill, -0.2);
  const R = rng(o.seed ?? 2);
  for (let i = 0; i < (o.flagella ?? 0); i++) {
    const a0 = 180 + (i - ((o.flagella ?? 1) - 1) / 2) * 28;
    const L2 = len * (0.7 + 0.3 * rnd(R));
    const [ox, oy] = pol(w * 0.35, 0, w * 0.2, a0);
    const pts: Point[] = [];
    for (let j = 0; j < 25; j++) {
      const t = j / 24;
      const [x, y] = pol(ox, oy, t * L2, a0);
      pts.push([x - Math.sin(rad(a0)) * 0.1 * w * Math.sin(t * 18), y + Math.cos(rad(a0)) * 0.1 * w * Math.sin(t * 18)]);
    }
    path(g, smooth(pts), { stroke: st, width: fw(K, 0.035 * w), part: 'flagellum' });
  }
  rect(g, 0, -w / 2, len, w, { r: w / 2, fill, stroke: st, width: fw(K, o.width ?? Math.max(0.03 * w, STYLE.line.thin)) });
  if (o.highlight !== false) {
    rect(g, w * 0.15, -w / 2 + w * 0.12, len - w * 0.3, w * 0.5, { r: w * 0.25, fill: shade(fill, 0.12), opacity: 0.8 });
    rect(g, w * 0.45, -w * 0.2, len * 0.42, w * 0.13, { r: w * 0.065, fill: shade(fill, 0.85), opacity: 0.5, filter: blur(g, 0.026 * w) });
  }
  const ports = reg(o, p, { a, b, center: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  return { node: g.node, ports };
}

export function halo(p: Parent, cx: number, cy: number, r: number, o: Loose<{ color: string; opacity: number; part: string }> = {}): { node: SVGCircleElement } {
  const col = o.color ?? '#6fd08a';
  const op = o.opacity ?? 1;
  const fill = radialGradient(p, [[0, col, 0.85 * op], [0.55, shade(col, 0.3), 0.5 * op], [1, shade(col, 0.7), 0]]);
  return { node: circle(p, cx, cy, r, { fill, part: o.part ?? 'halo' }) };
}

export type CytokineOpts = Loose<{
  style: 'cone' | 'cloud';
  spread: number;
  cols: number;
  n: number;
  r: number;
  color: string;
  seed: number;
  part: string;
  illustrate: IllustrateSetting;
}>;

interface Dot {
  x: number;
  y: number;
  r: number;
  op: number;
}

function burst(x: number, y: number, angle: number, len: number, o: CytokineOpts, R: Rand, cloudOp: number): Dot[] {
  const rr = o.r ?? 0.035 * len;
  const dots: Dot[] = [];
  if ((o.style ?? 'cone') === 'cloud') {
    for (let i = 0; i < (o.n ?? 24); i++) {
      const [px, py] = pol(x, y, len * Math.sqrt(rnd(R)), rnd(R) * 360);
      dots.push({ x: px, y: py, r: rr * (0.8 + 0.4 * rnd(R)), op: cloudOp });
    }
    return dots;
  }
  const T = frame(x, y, angle);
  const cols = o.cols ?? 8;
  const sp = Math.tan(rad((o.spread ?? 50) / 2));
  for (let c = 1; c <= cols; c++) {
    const d = (c / cols) * len;
    const hf = d * sp;
    const m = c + 1;
    for (let j = 0; j < m; j++) {
      const [px, py] = fpt(T, d + (rnd(R) - 0.5) * 0.02 * len, -hf + (2 * hf * j) / (m - 1) + (rnd(R) - 0.5) * 0.02 * len);
      dots.push({ x: px, y: py, r: rr * (1 - 0.035 * c), op: 0.95 - 0.03 * c });
    }
  }
  return dots;
}

export function cytokines(p: Parent, x: number, y: number, angle: number, len: number, o: CytokineOpts = {}): { node: SVGGElement } {
  const il = illOf(o);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cytokines' });
  const col = o.color ?? '#2f6b45';
  if (il === undefined) {
    const dots = burst(x, y, angle, len, o, rng(o.seed ?? 21), 0.9);
    for (const d of dots) circle(g, d.x, d.y, d.r, { fill: col, opacity: d.op });
    return { node: g };
  }
  const seed = o.seed ?? 21;
  const dots = burst(x, y, angle, len, o, rng(seed), 1);
  for (let i = 0; i < dots.length; i++) {
    const d = at(dots, i);
    const v = vary(seed, i, { size: 0.14, hue: 5, lum: 0.05 });
    const b = ball(g, d.x, d.y, d.r * v.k, varyTint(v, col), { light: il.light, contrast: 1, core: 0.2, rim: 0.45, highlight: 0.7, part: 'cytokine' });
    if (d.op < 1) b.node.setAttribute('opacity', String(f3(d.op)));
  }
  return { node: g };
}
