// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { path, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import { blob, finish, hashSeed, nextRand, wobble } from './illustrate.ts';
import { userGradient } from './geo-vec.ts';
import type { Ill, Tissue, TissueName, Vary } from './bio-util.ts';
import { bez, fw, lineD, nz, rad, rnd, rng, vary, varyTint } from './bio-util.ts';

export type CellKind = 'dome' | 'squamous' | 'cuboidal' | 'columnar';
export type TissueCellOpts = Loose<{
  width: number;
  stroke: string;
  fill: string;
  light: string;
  gradient: boolean;
  nucleus: boolean;
  nucleusFill: string;
  nucleusStroke: string;
  contrast: number;
  seed: number;
}>;
export interface TissueCell {
  center: Point;
  base: Point;
  top: Point;
}
export type Palette = TissueName | Tissue;

export interface Run {
  L: number;
  closed: boolean;
  smooth: boolean;
  S: Point[];
  cum: number[];
  a: Point;
  t: Point;
}

function smoothRun(g: Parent, pts: readonly Point[], closed: boolean): Run {
  const tmp = path(g, smooth(pts, closed, 0.5), {});
  const L = tmp.getTotalLength();
  const n = Math.max(16, Math.ceil(L / 0.5));
  const S: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const q = tmp.getPointAtLength((L * i) / n);
    S.push([q.x, q.y]);
  }
  tmp.remove();
  const cum: number[] = [0];
  for (let i = 1; i <= n; i++) cum.push(at(cum, i - 1) + Math.hypot(at(S, i)[0] - at(S, i - 1)[0], at(S, i)[1] - at(S, i - 1)[1]));
  return { L: at(cum, n), closed, smooth: true, S, cum, a: [0, 0], t: [0, 0] };
}

export function runsOf(g: Parent, pts: readonly Point[], closed: boolean, smoothed: boolean): Run[] {
  if (smoothed) return [smoothRun(g, pts, closed)];
  const P: Point[] = closed ? [...pts, at(pts, 0)] : [...pts];
  const out: Run[] = [];
  for (let i = 1; i < P.length; i++) {
    const a = at(P, i - 1);
    const b = at(P, i);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({ L, closed, smooth: false, S: [], cum: [], a, t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] });
  }
  return out;
}

export function runAt(r: Run, s0: number): Point {
  if (!r.smooth) return [r.a[0] + r.t[0] * s0, r.a[1] + r.t[1] * s0];
  const { S, cum } = r;
  const n = S.length - 1;
  const Lt = r.L;
  const s = r.closed ? ((s0 % Lt) + Lt) % Lt : s0;
  const c1 = at(cum, 1) === 0 ? 1 : at(cum, 1);
  if (!r.closed && s < 0) return [at(S, 0)[0] + ((at(S, 1)[0] - at(S, 0)[0]) * s) / c1, at(S, 0)[1] + ((at(S, 1)[1] - at(S, 0)[1]) * s) / c1];
  let i = 1;
  while (i < n && at(cum, i) < s) i++;
  const dc = at(cum, i) - at(cum, i - 1);
  const t = (s - at(cum, i - 1)) / nz(dc);
  const a = at(S, i - 1);
  const b = at(S, i);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function runTan(r: Run, s: number): Point {
  if (!r.smooth) return r.t;
  const e = r.L / (r.S.length - 1);
  const a = runAt(r, s - e);
  const b = runAt(r, s + e);
  const l = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
}

function segPts(out: Point[], p0: Point, p1: Point, n: number): void {
  for (let i = 0; i < n; i++) out.push([p0[0] + ((p1[0] - p0[0]) * i) / n, p0[1] + ((p1[1] - p0[1]) * i) / n]);
}

function arcPts(out: Point[], cx: number, cy: number, r: number, t0: number): void {
  for (let i = 0; i < 6; i++) {
    const t = rad(t0 + (90 * i) / 6);
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
}

export function cellOutline(kind: CellKind, w: number, h: number): Point[] {
  const out: Point[] = [];
  if (kind === 'dome') {
    const b1: Point[] = [[-w / 2, 0], [-0.49 * w, 0.8 * h], [-0.22 * w, h], [0, h]];
    const b2: Point[] = [[0, h], [0.22 * w, h], [0.49 * w, 0.8 * h], [w / 2, 0]];
    for (const B of [b1, b2]) for (let i = 0; i < 12; i++) out.push(bez(B, i / 12));
    segPts(out, [w / 2, 0], [-w / 2, 0], 10);
    return out;
  }
  const r = kind === 'squamous' ? Math.min(h / 2, w / 2) : Math.min(w, h) * 0.18;
  const a0 = -w / 2;
  const a1 = w / 2;
  segPts(out, [a0 + r, 0], [a1 - r, 0], 10);
  arcPts(out, a1 - r, r, r, -90);
  segPts(out, [a1, r], [a1, h - r], 3);
  arcPts(out, a1 - r, h - r, r, 0);
  segPts(out, [a1 - r, h], [a0 + r, h], 10);
  arcPts(out, a0 + r, h - r, r, 90);
  segPts(out, [a0, h - r], [a0, r], 3);
  arcPts(out, a0 + r, r, r, 180);
  return out;
}

interface Slot {
  r: Run;
  sc: number;
  side: number;
}

function slotPt(s: Slot, a: number, b: number): Point {
  const q = runAt(s.r, s.sc + a);
  const t = runTan(s.r, s.sc + a);
  return [q[0] + t[1] * s.side * b, q[1] - t[0] * s.side * b];
}

function nucShape(kind: CellKind, w: number, h: number): readonly [number, number, number, number] {
  if (kind === 'dome') return [0, 0.42 * h, 0.2 * w, 0.2 * h];
  if (kind === 'squamous') return [0, h / 2, 0.2 * w, 0.26 * h];
  if (kind === 'columnar') return [0, 0.3 * h, 0.3 * w, 0.14 * h];
  return [0, h / 2, 0.24 * w, 0.24 * h];
}

export function tissueCell(g: Handle, K: number, kind: CellKind, r: Run, sc: number, side: number, w: number, h: number, o: TissueCellOpts, pal: Tissue): TissueCell {
  const T: Slot = { r, sc, side };
  const sw = fw(K, o.width ?? Math.max(0.04 * Math.min(w, h), STYLE.line.hair));
  const st = o.stroke ?? pal.stroke;
  const fill = o.fill ?? pal.fill;
  const pts: Point[] = [];
  for (const [a, b] of cellOutline(kind, w, h)) pts.push(slotPt(T, a, b));
  const grad = o.gradient ?? kind === 'dome';
  const paint = grad ? userGradient(g, slotPt(T, 0, h), slotPt(T, 0, 0), [[0, o.light ?? pal.light], [0.55, fill], [1, fill]]) : fill;
  path(g, lineD(pts, true), { fill: paint, stroke: st, width: sw, join: 'round', part: 'tissue-cell' });
  if (o.nucleus !== false) {
    const [na, nb, rx, ry] = nucShape(kind, w, h);
    const q = slotPt(T, na, nb);
    const t = runTan(r, sc);
    const ang = (Math.atan2(t[1], t[0]) * 180) / Math.PI;
    el(g, 'ellipse', {
      cx: f3(q[0]), cy: f3(q[1]), rx: f3(rx), ry: f3(ry), transform: `rotate(${f3(ang)} ${f3(q[0])} ${f3(q[1])})`, fill: o.nucleusFill ?? pal.nucleus,
      stroke: kind === 'dome' ? (o.nucleusStroke ?? pal.nstroke) : 'none', 'stroke-width': sw, 'data-part': 'nucleus',
    });
  }
  return { center: slotPt(T, 0, h / 2), base: slotPt(T, 0, 0), top: slotPt(T, 0, h) };
}

export function tissueCellIllustrated(g: Handle, K: number, kind: CellKind, r: Run, sc: number, side: number, w: number, h: number, o: TissueCellOpts, pal: Tissue, il: Ill, v: Vary): TissueCell {
  const hh = h * v.k;
  const skew = (nextRand(v.r) - 0.5) * 0.1 * w;
  const T: Slot = { r, sc, side };
  const sw = fw(K, o.width ?? Math.max(0.04 * Math.min(w, hh), STYLE.line.hair));
  const st = o.stroke ?? pal.stroke;
  const loc0: Point[] = [];
  const weights: number[] = [];
  for (const [a, b] of cellOutline(kind, w, hh)) {
    loc0.push([a + (skew * b) / hh, b]);
    weights.push(Math.min(1, (b / hh) * 3));
  }
  const loc = wobble(loc0, { amp: 0.035 * Math.min(w, hh), seed: v.seed, weights });
  const pts: Point[] = [];
  for (const [a, b] of loc) pts.push(slotPt(T, a, b));
  const c = finish(g, lineD(pts, true), varyTint(v, o.fill ?? pal.fill), {
    light: il.light, contrast: o.contrast ?? il.contrast ?? 0.7, rim: 0.55, core: 0.25, highlight: kind === 'squamous' ? 0.35 : 0.5, highlightSize: [0.34, 0.2],
    width: sw, outline: st, mottle: kind === 'squamous' ? 0 : 2, seed: v.seed, part: 'tissue-cell',
  });
  if (o.nucleus !== false) {
    const [na, nb, rx0, ry0] = nucShape(kind, w, hh);
    const rx = rx0 * (0.88 + 0.24 * nextRand(v.r));
    const ry = ry0 * (0.88 + 0.24 * nextRand(v.r));
    const ax = na + (nextRand(v.r) - 0.5) * 0.14 * w + (skew * nb) / hh;
    const ay = nb + (nextRand(v.r) - 0.5) * 0.1 * hh;
    const q = slotPt(T, ax, ay);
    const t = runTan(r, sc);
    const ang = (Math.atan2(t[1], t[0]) * 180) / Math.PI + (nextRand(v.r) - 0.5) * 24;
    const nd = smooth(blob(q[0], q[1], Math.sqrt(rx * ry), { aspect: rx / ry, rot: ang, amp: 0.06, seed: v.seed + 3 }), true, 0.5);
    finish(c.inner, nd, o.nucleusFill ?? pal.nucleus, {
      light: il.light, contrast: 0.75, rim: 0.35, core: 0.2, highlight: 0.3, width: fw(K, sw * 0.8), outline: o.nucleusStroke ?? (kind === 'dome' ? pal.nstroke : undefined), part: 'nucleus',
    });
  }
  return { center: slotPt(T, 0, hh / 2), base: slotPt(T, 0, 0), top: slotPt(T, 0, hh) };
}

export function tissueRunIllustrated(
  g: Handle, K: number, kind: CellKind, r: Run, t0: number, L: number, n: number, side: number, h: number, gap: number, o: TissueCellOpts, pal: Tissue, il: Ill, cells: TissueCell[],
): void {
  const a0 = runAt(r, 0);
  const seed = o.seed ?? hashSeed(r.L, n, h, a0[0], a0[1]);
  const R = rng(seed);
  const sl = L / n;
  const e: number[] = [0];
  for (let i = 1; i < n; i++) e.push(i * sl + (rnd(R) - 0.5) * 0.24 * sl);
  e.push(L);
  for (let i = 0; i < n; i++) {
    const v = vary(seed, cells.length, { size: 0.1, hue: 4, lum: 0.035, sat: 0.03 });
    cells.push(tissueCellIllustrated(g, K, kind, r, t0 + (at(e, i) + at(e, i + 1)) / 2, side, (at(e, i + 1) - at(e, i)) * (1 - gap), h, o, pal, il, v));
  }
}
