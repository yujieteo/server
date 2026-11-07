// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, Loose, Paint, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { line, path } from './draw.ts';
import { at } from './util.ts';
import type { AxisSpec, V3 } from './geo-vec.ts';
import { add3, axis3, dPts, orOne, reg, sub3, unit3 } from './geo-vec.ts';
import type { Face, Proj } from './geo-proj.ts';
import { faceWorld, proj3 } from './geo-proj.ts';

const C = STYLE.color;

export function line3(p: Parent, P: Proj, a: V3, b: V3, s: Paint = {}): { node: SVGLineElement } {
  return { node: line(p, proj3(P, a), proj3(P, b), { part: 'line3', ...s }) };
}

type RingList = readonly V3[] | readonly (readonly V3[])[];

function isSingleRing(r: RingList): r is readonly V3[] {
  const f = r[0];
  return f !== undefined && typeof f[0] === 'number';
}

export function poly3(p: Parent, P: Proj, rings: RingList, s: Paint = {}): { node: SVGPathElement; rings: Point[][] } {
  const R: readonly (readonly V3[])[] = isSingleRing(rings) ? [rings] : rings;
  const pg: Point[][] = [];
  for (const r of R) {
    const pts: Point[] = [];
    for (const q of r) pts.push(proj3(P, q));
    pg.push(pts);
  }
  let d = '';
  for (let i = 0; i < pg.length; i++) d += (i > 0 ? ' ' : '') + dPts(at(pg, i));
  const node = path(p, d, { part: 'poly3', ...s });
  if (R.length > 1) node.setAttribute('fill-rule', 'evenodd');
  return { node, rings: pg };
}

export type PlaneFrameSpec = Face | Loose<{ origin: V3; u: AxisSpec; v: AxisSpec }>;

export interface PlaneFrame {
  origin: V3;
  u: V3;
  v: V3;
}

function planeFrame(pl: PlaneFrameSpec): PlaneFrame {
  if ('base' in pl) {
    const o = faceWorld(pl, 0, 0);
    return { origin: o, u: unit3(sub3(faceWorld(pl, 1, 0), o)), v: unit3(sub3(faceWorld(pl, 0, 1), o)) };
  }
  return { origin: pl.origin ?? [0, 0, 0], u: axis3(pl.u ?? 'x'), v: axis3(pl.v ?? 'y') };
}

export interface PSample {
  p: Point;
  n: Point;
}

export interface PlanePath {
  P: Proj;
  plane: PlaneFrame;
  samples: PSample[];
  length: number;
  cum: number[];
}

export type PlanePathOpts = Loose<{ radius: number | readonly number[]; plane: PlaneFrameSpec; arcStep: number }>;

interface PathCtx {
  verts: readonly Point[];
  D: Point[];
  Ls: number[];
  radius: number | readonly number[] | undefined;
  step: number;
}

function leftNormal(t: Point): Point {
  return [-t[1], t[0]];
}

function radiusAt(radius: PathCtx['radius'], i: number): number {
  if (radius === undefined) return 0;
  return typeof radius === 'number' ? radius : (radius[i - 1] ?? 0);
}

function pathCtx(verts: readonly Point[], o: PlanePathOpts): PathCtx {
  const D: Point[] = [];
  const Ls: number[] = [];
  for (let i = 0; i < verts.length - 1; i++) {
    const a = at(verts, i);
    const b = at(verts, i + 1);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = orOne(Math.hypot(dx, dy));
    D.push([dx / l, dy / l]);
    Ls.push(l);
  }
  return { verts, D, Ls, radius: o.radius, step: ((o.arcStep ?? 4) * Math.PI) / 180 };
}

function clampedRadius(c: PathCtx, i: number, phi: number): number {
  const r = Math.max(0, radiusAt(c.radius, i));
  if (r <= 0) return r;
  const last = c.verts.length - 2;
  const room = Math.min(at(c.Ls, i - 1) * (i === 1 ? 1 : 0.5), at(c.Ls, i) * (i === last ? 1 : 0.5));
  return Math.min(r, room / Math.tan(phi / 2));
}

function cornerSamples(c: PathCtx, i: number): PSample[] {
  const d1 = at(c.D, i - 1);
  const d2 = at(c.D, i);
  const cr = d1[0] * d2[1] - d1[1] * d2[0];
  const dt = d1[0] * d2[0] + d1[1] * d2[1];
  const phi = Math.atan2(Math.abs(cr), dt);
  if (phi < 1e-6) return [];
  const r = clampedRadius(c, i, phi);
  const V = at(c.verts, i);
  const n1 = leftNormal(d1);
  if (r < 1e-9) {
    const n2 = leftNormal(d2);
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    return [{ p: V, n: [(n1[0] + n2[0]) / k, (n1[1] + n2[1]) / k] }];
  }
  const td = r * Math.tan(phi / 2);
  const sg = Math.sign(cr);
  const T1: Point = [V[0] - d1[0] * td, V[1] - d1[1] * td];
  const Cc: Point = [T1[0] + n1[0] * sg * r, T1[1] + n1[1] * sg * r];
  const a0 = Math.atan2(T1[1] - Cc[1], T1[0] - Cc[0]);
  const m = Math.max(2, Math.ceil(phi / c.step));
  const out: PSample[] = [];
  for (let k = 0; k <= m; k++) {
    const a = a0 + (sg * phi * k) / m;
    out.push({ p: [Cc[0] + r * Math.cos(a), Cc[1] + r * Math.sin(a)], n: [-sg * Math.cos(a), -sg * Math.sin(a)] });
  }
  return out;
}

export function planePath(P: Proj, verts: readonly Point[], o: PlanePathOpts = {}): PlanePath {
  const n = verts.length;
  const c = pathCtx(verts, o);
  const S: PSample[] = [{ p: at(verts, 0), n: leftNormal(at(c.D, 0)) }];
  for (let i = 1; i < n - 1; i++) S.push(...cornerSamples(c, i));
  S.push({ p: at(verts, n - 1), n: leftNormal(at(c.D, n - 2)) });
  const cum = [0];
  for (let i = 1; i < S.length; i++) {
    const a = at(S, i).p;
    const b = at(S, i - 1).p;
    cum.push(at(cum, i - 1) + Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  const plane = planeFrame(o.plane ?? {});
  return { P, plane, samples: S, length: at(cum, cum.length - 1), cum };
}

function offsetWorld(pp: PlanePath, s: PSample, d: number): V3 {
  const a = s.p[0] + s.n[0] * d;
  const b = s.p[1] + s.n[1] * d;
  return add3(add3(pp.plane.origin, pp.plane.u, a), pp.plane.v, b);
}

export function ppWorld(pp: PlanePath, d: number = 0): V3[] {
  const out: V3[] = [];
  for (const s of pp.samples) out.push(offsetWorld(pp, s, d));
  return out;
}

export function ppPage(pp: PlanePath, d: number = 0): Point[] {
  const out: Point[] = [];
  for (const q of ppWorld(pp, d)) out.push(proj3(pp.P, q));
  return out;
}

export function ppD(pp: PlanePath, d: number = 0, close: boolean = false): string {
  return dPts(ppPage(pp, d), close);
}

export interface PathPoint {
  world: V3;
  page: Point;
  dir: Point;
}

export function ppAt(pp: PlanePath, f: number, d: number = 0): PathPoint {
  const s = Math.max(0, Math.min(1, f)) * pp.length;
  let i = 1;
  while (i < pp.samples.length - 1 && at(pp.cum, i) < s) i++;
  const t = (s - at(pp.cum, i - 1)) / orOne(at(pp.cum, i) - at(pp.cum, i - 1));
  const A = offsetWorld(pp, at(pp.samples, i - 1), d);
  const B = offsetWorld(pp, at(pp.samples, i), d);
  const wq = add3(A, sub3(B, A), t);
  const pa = proj3(pp.P, A);
  const pb = proj3(pp.P, B);
  const dl = orOne(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]));
  return { world: wq, page: proj3(pp.P, wq), dir: [(pb[0] - pa[0]) / dl, (pb[1] - pa[1]) / dl] };
}

export type RibbonOpts = Loose<{
  n: number; radius: number | readonly number[]; plane: PlaneFrameSpec; arcStep: number; align: 'center' | number;
  fill: string; fillOpacity: number; stroke: string; edge: string; width: number; lines: boolean;
  highlight: number | readonly number[]; highlightFill: string; highlightOpacity: number; highlightStroke: string;
  F: Figure; name: string; part: string;
}>;

export interface Ribbon {
  node: SVGGElement;
  path: PlanePath;
  n: number;
  w: number;
  align: 'center' | number;
  ports: Ports;
}

export function ribbonOff(r: Pick<Ribbon, 'n' | 'w' | 'align'>, k: number): number {
  return ((r.align === 'center' ? r.n / 2 - k : r.align - k) * r.w) / r.n;
}

export function ribbonLine(r: Pick<Ribbon, 'n' | 'w' | 'align' | 'path'>, k: number): Point[] {
  return ppPage(r.path, ribbonOff(r, k));
}

export function ribbonChannel(r: Pick<Ribbon, 'n' | 'w' | 'align' | 'path'>, k: number): Point[] {
  return [...ribbonLine(r, k), ...ribbonLine(r, k + 1).toReversed()];
}

function ribbonBand(r: Pick<Ribbon, 'n' | 'w' | 'align' | 'path'>, k0: number, k1: number): Point[] {
  return [...ribbonLine(r, k0), ...ribbonLine(r, k1).toReversed()];
}

function drawRibbonLines(g: SVGGElement, r: Ribbon, o: RibbonOpts, hl: readonly number[]): void {
  const stroke = o.stroke ?? C.ink;
  if (stroke === 'none') return;
  for (let k = 0; k <= r.n; k++) {
    const isEdge = k === 0 || k === r.n;
    const isHl = hl.includes(k) || hl.includes(k - 1);
    if (!isEdge && o.lines === false) continue;
    const hs = o.highlightStroke;
    const col = isHl && hs !== undefined && hs !== '' ? hs : isEdge && o.edge !== undefined && o.edge !== '' ? o.edge : stroke;
    path(g, dPts(ribbonLine(r, k), false), { stroke: col, width: o.width ?? STYLE.line.hair, part: isEdge ? 'ribbon-edge' : 'ribbon-line' });
  }
}

export function ribbon3(p: Parent, P: Proj, verts: readonly Point[], w: number, o: RibbonOpts = {}): Ribbon {
  const n = o.n ?? 1;
  const pp = planePath(P, verts, { radius: o.radius, plane: o.plane, arcStep: o.arcStep });
  const g = el(p, 'g', { 'data-part': o.part ?? 'ribbon' });
  const ports: Ports = {
    start: ppAt(pp, 0).page, end: ppAt(pp, 1).page, mid: ppAt(pp, 0.5).page,
  };
  const r: Ribbon = { node: g, path: pp, n, w, align: o.align ?? 'center', ports };
  path(g, dPts(ribbonBand(r, 0, n)), { fill: o.fill ?? '#f4d9e6', fillOpacity: o.fillOpacity, part: 'ribbon-fill' });
  const hl = o.highlight === undefined ? [] : typeof o.highlight === 'number' ? [o.highlight] : [...o.highlight];
  for (const k of hl) {
    path(g, dPts(ribbonBand(r, k, k + 1)), { fill: o.highlightFill ?? C.vermillion, fillOpacity: o.highlightOpacity, part: 'ribbon-highlight' });
  }
  drawRibbonLines(g, r, o, hl);
  reg(o.F, o.name, p, ports);
  return r;
}
