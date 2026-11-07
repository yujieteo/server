// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Loose, Parent, Point, Rect } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { clipPath, ellipse, line, path, radialGradient, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import { C, PAPER, newRng, rngNext } from './ind-base.ts';
import type { Rng } from './ind-base.ts';

export type PackingOpts = Loose<{
  rmin: number; rmax: number; bias: number; overlap: number; tries: number; fill: string | readonly string[]; stroke: string;
  width: number; squash: readonly [number, number]; shaded: boolean; highlight: boolean; clip: string; seed: number;
}>;

type Disc = readonly [number, number, number, string];
export type Point3 = [number, number, number];

export interface PackingResult {
  node: SVGGElement;
  discs: Point3[];
}

function cellKey(i: number, j: number): string {
  return i + ',' + j;
}

function collides(grid: ReadonlyMap<string, Disc[]>, gi: number, gj: number, cx: number, cy: number, r: number, ov: number): boolean {
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      for (const q of grid.get(cellKey(gi + a, gj + b)) ?? []) {
        if (Math.hypot(q[0] - cx, q[1] - cy) < (q[2] + r) * ov) return true;
      }
    }
  }
  return false;
}

function placeDiscs(R: Rect, o: PackingOpts, fills: readonly string[]): Disc[] {
  const rnd = newRng(o.seed ?? 7);
  const rmin = o.rmin ?? 1;
  const rmax = o.rmax ?? rmin * 1.8;
  const bias = o.bias ?? 1.6;
  const ov = o.overlap ?? 1;
  const tries = o.tries ?? Math.round(((R.w * R.h) / (rmin * rmin)) * 1.5);
  const cell = rmax * 2;
  const grid = new Map<string, Disc[]>();
  const placed: Disc[] = [];
  for (let t = 0; t < tries; t++) {
    const r = rmin + (rmax - rmin) * Math.pow(rngNext(rnd), bias);
    const cx = R.x - r * 0.3 + rngNext(rnd) * (R.w + r * 0.6);
    const cy = R.y - r * 0.3 + rngNext(rnd) * (R.h + r * 0.6);
    const gi = Math.floor(cx / cell);
    const gj = Math.floor(cy / cell);
    if (collides(grid, gi, gj, cx, cy, r, ov)) continue;
    const q: Disc = [cx, cy, r, at(fills, Math.floor(rngNext(rnd) * fills.length))];
    placed.push(q);
    const k = cellKey(gi, gj);
    const list = grid.get(k);
    if (list === undefined) grid.set(k, [q]);
    else list.push(q);
  }
  return placed;
}

export function packing(p: Parent, R: Rect, o: PackingOpts = {}): PackingResult {
  const [sx, sy] = o.squash ?? [1, 1];
  const clipD = o.clip ?? `M${f3(R.x)},${f3(R.y)} h${f3(R.w)} v${f3(R.h)} h${f3(-R.w)}Z`;
  const g = el(p, 'g', { 'data-part': 'packing', 'clip-path': clipPath(p, clipD) });
  const fl = o.fill ?? C.light;
  const fills: readonly string[] = typeof fl === 'string' ? [fl] : fl;
  const placed = placeDiscs(R, o, fills);
  const cache = new Map<string, string>();
  const discs: Point3[] = [];
  for (const [cx, cy, r, c] of placed) {
    let fill = c;
    if (o.shaded === true) {
      fill = cache.get(c) ?? radialGradient(g, [[0, shade(c, 0.4)], [0.7, c], [1, shade(c, -0.15)]], { cx: 0.38, cy: 0.34, r: 0.7 });
      cache.set(c, fill);
    }
    ellipse(g, cx, cy, r * sx, r * sy, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.hair });
    if (o.highlight === true) ellipse(g, cx - r * 0.3 * sx, cy - r * 0.32 * sy, r * 0.28 * sx, r * 0.22 * sy, { fill: PAPER, opacity: 0.55 });
    discs.push([cx, cy, r]);
  }
  return { node: g, discs };
}

export type FibresOpts = Loose<{
  n: number; kind: 'tangled' | 'straight' | 'rods'; color: string | readonly string[]; width: number | readonly [number, number]; seed: number;
  steps: number; bend: number; poly: readonly Point[]; len: readonly [number, number]; light: string; vertical: number;
}>;

function inPoly(poly: readonly Point[], x: number, y: number): boolean {
  let c = false;
  let j = poly.length - 1;
  for (let i = 0; i < poly.length; i++) {
    const [xi, yi] = at(poly, i);
    const [xj, yj] = at(poly, j);
    if (yi > y !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    j = i;
  }
  return c;
}

interface Rods {
  g: SVGGElement;
  rnd: Rng;
  l0: number;
  l1: number;
  w0: number;
  w1: number;
  cols: readonly string[];
  lit: string;
  vert: number;
}

function drawRod(r: Rods, c: Point): void {
  const { g, rnd } = r;
  const ang = rngNext(rnd) < r.vert ? Math.PI / 2 + (rngNext(rnd) - 0.5) * 0.9 : rngNext(rnd) * Math.PI;
  const l = r.l0 + (r.l1 - r.l0) * rngNext(rnd);
  const ww = r.w0 + (r.w1 - r.w0) * rngNext(rnd);
  const dx = (Math.cos(ang) * l) / 2;
  const dy = (Math.sin(ang) * l) / 2;
  const a: Point = [c[0] - dx, c[1] - dy];
  const b: Point = [c[0] + dx, c[1] + dy];
  line(g, a, b, { stroke: at(r.cols, Math.floor(rngNext(rnd) * r.cols.length)), width: ww, cap: 'round' });
  if (r.lit === 'none') return;
  const nx = -Math.sin(ang) * ww * 0.25;
  const ny = Math.cos(ang) * ww * 0.25;
  const sg = ny > 0 ? -1 : 1;
  line(g, [a[0] + nx * sg, a[1] + ny * sg], [b[0] + nx * sg, b[1] + ny * sg], { stroke: r.lit, width: Math.max(ww * 0.3, STYLE.line.hair), cap: 'round', opacity: 0.8 });
}

function rodMat(p: Parent, R: Rect, o: FibresOpts): SVGGElement {
  const rnd = newRng(o.seed ?? 5);
  const poly: readonly Point[] = o.poly ?? [[R.x, R.y], [R.x + R.w, R.y], [R.x + R.w, R.y + R.h], [R.x, R.y + R.h]];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const q of poly) {
    xs.push(q[0]);
    ys.push(q[1]);
  }
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const [l0, l1] = o.len ?? [0.03 * (y1 - y0), 0.09 * (y1 - y0)];
  const wd = o.width ?? [0.3 * l0, 0.5 * l0];
  const [w0, w1] = typeof wd === 'number' ? [wd, wd] : wd;
  const cl = o.color ?? ['#2b2d31', '#34373c', '#3d4046', '#464a50', '#26282b'];
  const n = o.n ?? 600;
  const g = el(p, 'g', { 'data-part': 'fibres' });
  const rods: Rods = { g, rnd, l0, l1, w0, w1, cols: typeof cl === 'string' ? [cl] : cl, lit: o.light ?? '#6d737b', vert: o.vertical ?? 0.6 };
  let k = 0;
  for (let guard = 0; k < n && guard < n * 20; guard++) {
    const c: Point = [x0 + (x1 - x0) * rngNext(rnd), y0 + (y1 - y0) * rngNext(rnd)];
    if (!inPoly(poly, c[0], c[1])) continue;
    k += 1;
    drawRod(rods, c);
  }
  return g;
}

function straightFibre(g: Parent, R: Rect, rnd: Rng, i: number, n: number, color: string, width: number): void {
  const yc = R.y + (R.h * (i + 0.3 + 0.4 * rngNext(rnd))) / n;
  const dy = R.h * (0.12 + 0.18 * rngNext(rnd)) * (rngNext(rnd) < 0.5 ? -1 : 1);
  line(g, [R.x - 1, yc - dy], [R.x + R.w + 1, yc + dy], { stroke: color, width, cap: 'round' });
}

function tangledFibre(g: Parent, R: Rect, rnd: Rng, o: FibresOpts, color: string, width: number): void {
  const steps = o.steps ?? 6;
  const st = (Math.max(R.w, R.h) / steps) * 0.9;
  const pts: Point[] = [];
  let x = R.x + rngNext(rnd) * R.w;
  let y = R.y + rngNext(rnd) * R.h;
  let a = rngNext(rnd) * 2 * Math.PI;
  for (let k = 0; k < steps; k++) {
    pts.push([x, y]);
    a += (rngNext(rnd) - 0.5) * (o.bend ?? 1.4);
    x += Math.cos(a) * st;
    y += Math.sin(a) * st;
  }
  path(g, smooth(pts, false, 0.5), { stroke: color, width, cap: 'round' });
}

export function fibres(p: Parent, R: Rect, o: FibresOpts = {}): SVGGElement {
  if (o.kind === 'rods') return rodMat(p, R, o);
  const rnd = newRng(o.seed ?? 3);
  const n = o.n ?? 10;
  const color = typeof o.color === 'string' ? o.color : C.mid;
  const width = typeof o.width === 'number' ? o.width : STYLE.line.normal * 1.3;
  const g = el(p, 'g', { 'data-part': 'fibres', 'clip-path': clipPath(p, `M${f3(R.x)},${f3(R.y)} h${f3(R.w)} v${f3(R.h)} h${f3(-R.w)}Z`) });
  for (let i = 0; i < n; i++) {
    if ((o.kind ?? 'tangled') === 'straight') straightFibre(g, R, rnd, i, n, color, width);
    else tangledFibre(g, R, rnd, o, color, width);
  }
  return g;
}
