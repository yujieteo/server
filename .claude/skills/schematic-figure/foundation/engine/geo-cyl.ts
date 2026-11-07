// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, Loose, Paint, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { path } from './draw.ts';
import { at, f3 } from './util.ts';
import type { AxisSpec, V3 } from './geo-vec.ts';
import { UNIT, add3, axis3, cross3, dPts, dot3, hull2, len3, reg, scale3, sub3, unit3, userGradient } from './geo-vec.ts';
import type { Proj } from './geo-proj.ts';
import { proj3, projVec } from './geo-proj.ts';

const C = STYLE.color;

export function ringBasis(P: Proj, a: V3): [V3, V3] {
  let wr = sub3(P.view, scale3(a, dot3(P.view, a)));
  if (len3(wr) < 1e-6) {
    const t = Math.abs(a[0]) < 0.9 ? at(UNIT, 0) : at(UNIT, 1);
    wr = sub3(t, scale3(a, dot3(t, a)));
  }
  const e1 = unit3(wr);
  return [e1, cross3(a, e1)];
}

function ellipsePt(o: Point, u: Point, v: Point, a: number, b: number): Point {
  return [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b];
}

const ARC_SEGS: readonly Point[] = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 0]];

export function circleD(P: Proj, c: V3, n: V3, r: number): string {
  const [e1, e2] = ringBasis(P, n);
  const o = proj3(P, c);
  const eu = projVec(P, e1);
  const ev = projVec(P, e2);
  const u: Point = [eu[0] * r, eu[1] * r];
  const v: Point = [ev[0] * r, ev[1] * r];
  const k = 0.5523;
  const start = ellipsePt(o, u, v, 1, 0);
  let d = `M${f3(start[0])},${f3(start[1])}`;
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = at(ARC_SEGS, i);
    const [a1, b1] = at(ARC_SEGS, i + 1);
    const c1 = ellipsePt(o, u, v, a0 + k * a1, b0 + k * b1);
    const c2 = ellipsePt(o, u, v, a1 + k * a0, b1 + k * b0);
    const e = ellipsePt(o, u, v, a1, b1);
    d += ` C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(e[0])},${f3(e[1])}`;
  }
  return d + 'Z';
}

export interface Circle3 {
  node: SVGPathElement;
  P: Proj;
  c: V3;
  e1: V3;
  e2: V3;
  r: number;
}

export function circle3(p: Parent, P: Proj, c: V3, normal: AxisSpec, r: number, s: Paint = {}): Circle3 {
  const n = axis3(normal);
  const [e1, e2] = ringBasis(P, n);
  const node = path(p, circleD(P, c, n, r), { fill: 'none', ...s, part: s.part ?? 'circle3' });
  return { node, P, c, e1, e2, r };
}

export function circleAt(ci: Circle3, phi: number): Point {
  return proj3(ci.P, add3(add3(ci.c, ci.e1, ci.r * Math.cos(phi)), ci.e2, ci.r * Math.sin(phi)));
}

export interface CylGeom {
  P: Proj;
  c0: V3;
  A: V3;
  e1: V3;
  e2: V3;
  r0: number;
  r1: number;
}

export function cylRing(g: CylGeom, t: number, phi: number, k: number = 1): Point {
  const R = g.r0 + (g.r1 - g.r0) * t;
  return proj3(g.P, add3(add3(add3(g.c0, g.A, t), g.e1, k * R * Math.cos(phi)), g.e2, k * R * Math.sin(phi)));
}

export interface Cyl extends CylGeom {
  node: SVGGElement;
  tip: Point;
  base: Point;
  cap: 'c0' | 'c1' | null;
  alpha: number;
  ports: Ports;
  axis: V3;
}

export type Band = { t0: number; t1: number } & Loose<{ fill: string; k: number; stroke: boolean; width: number }>;
export type Streak = Loose<{ at: number; width: number; color: string; opacity: number; t0: number; t1: number }>;

export type CylOpts = Loose<{
  fill: string; capFill: string; cap: boolean; stroke: string; width: number; shading: boolean;
  bands: readonly Band[]; streak: boolean | Streak; F: Figure; name: string; part: string;
}>;

interface CylCtx {
  p: Parent;
  g: SVGGElement;
  geom: CylGeom;
  alpha: number;
  fill: string;
  stroke: string;
  width: number;
  st: Paint;
}

function visibleHalfAngle(geom: CylGeom, a: V3, L: number): number {
  const w = geom.P.view;
  const wr = len3(sub3(w, scale3(a, dot3(w, a))));
  const dr = (geom.r0 - geom.r1) * dot3(a, w);
  const kap = L > 1e-9 && wr > 1e-9 ? (-(geom.r0 - geom.r1) * dot3(a, w)) / (L * wr) : dr > 0 ? -2 : 2;
  return Math.acos(Math.max(-1, Math.min(1, kap)));
}

function bodyPath(geom: CylGeom): string {
  const N = 120;
  const pts: Point[] = [];
  for (let t = 0; t < 2; t++) {
    for (let i = 0; i < N; i++) pts.push(cylRing(geom, t, (2 * Math.PI * i) / N));
  }
  return dPts(hull2(pts));
}

function litSide(geom: CylGeom, alpha: number): number {
  const gp = cylRing(geom, 0.5, alpha * 0.5);
  const gm = cylRing(geom, 0.5, -alpha * 0.5);
  return gp[0] + gp[1] <= gm[0] + gm[1] ? 1 : -1;
}

function bodyFill(c: CylCtx, shading: boolean): string {
  if (!shading) return c.fill;
  const lit = litSide(c.geom, c.alpha);
  const sa = cylRing(c.geom, 0.5, lit * c.alpha);
  const sb = cylRing(c.geom, 0.5, -lit * c.alpha);
  const f = c.fill;
  return userGradient(c.p, sa, sb, [[0, shade(f, 0.4)], [0.3, shade(f, 0.12)], [0.65, f], [1, shade(f, -0.3)]]);
}

function stripD(geom: CylGeom, t0: number, t1: number, p0: number, p1: number, k: number = 1): string {
  const n = 48;
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) pts.push(cylRing(geom, t0, p0 + ((p1 - p0) * i) / n, k));
  for (let i = 0; i <= n; i++) pts.push(cylRing(geom, t1, p1 - ((p1 - p0) * i) / n, k));
  return dPts(pts);
}

function arcD(geom: CylGeom, alpha: number, t: number, k: number): string {
  const pts: Point[] = [];
  for (let i = 0; i < 49; i++) pts.push(cylRing(geom, t, -alpha + (2 * alpha * i) / 48, k));
  return dPts(pts, false);
}

function drawBand(c: CylCtx, b: Band): void {
  const k = b.k ?? 1;
  const raised = k > 1 && b.stroke !== false && c.stroke !== 'none';
  path(c.g, stripD(c.geom, b.t0, b.t1, -c.alpha, c.alpha, k), {
    fill: b.fill ?? shade(c.fill, -0.2), ...(raised ? c.st : {}), part: 'cylinder-band',
  });
  if (!raised && b.stroke !== false && c.stroke !== 'none') {
    for (const t of [b.t0, b.t1]) {
      path(c.g, arcD(c.geom, c.alpha, t, k), { stroke: c.stroke, width: b.width ?? c.width, part: 'cylinder-band-rim' });
    }
  }
}

function drawStreak(c: CylCtx, streak: boolean | Streak): void {
  const s: Streak = streak === true ? {} : streak === false ? {} : streak;
  const at0 = litSide(c.geom, c.alpha) * (s.at ?? 0.45) * c.alpha;
  const hw = (s.width ?? 0.14) * c.alpha;
  const col = s.color ?? '#ffffff';
  const op = s.opacity ?? 0.8;
  const gr = userGradient(c.p, cylRing(c.geom, 0.5, at0 - hw), cylRing(c.geom, 0.5, at0 + hw), [[0, col, 0], [0.5, col, op], [1, col, 0]]);
  path(c.g, stripD(c.geom, s.t0 ?? 0.04, s.t1 ?? 0.96, at0 - hw, at0 + hw), { fill: gr, part: 'cylinder-streak' });
}

function capEndOf(a: V3, w: V3): 'c0' | 'c1' | null {
  const ad = dot3(a, w);
  return Math.abs(ad) < 1e-9 ? null : ad > 0 ? 'c1' : 'c0';
}

export function cylinder3(p: Parent, P: Proj, c0: V3, c1: V3, r0: number, r1: number = r0, o: CylOpts = {}): Cyl {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cylinder' });
  const A = sub3(c1, c0);
  const a = unit3(A);
  const [e1, e2] = ringBasis(P, a);
  const geom: CylGeom = { P, c0, A, e1, e2, r0, r1 };
  const alpha = visibleHalfAngle(geom, a, len3(A));
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.thin;
  const st: Paint = stroke === 'none' ? {} : { stroke, width, join: 'round' };
  const c: CylCtx = { p, g, geom, alpha, fill: o.fill ?? '#c9ced6', stroke, width, st };
  path(g, bodyPath(geom), { fill: bodyFill(c, o.shading === true), ...st, part: 'cylinder-body' });
  if (alpha > 1e-3) for (const b of o.bands ?? []) drawBand(c, b);
  if (o.streak !== undefined && o.streak !== false && alpha > 1e-3) drawStreak(c, o.streak);
  const capEnd = capEndOf(a, P.view);
  if (capEnd !== null && o.cap !== false) {
    const rr = capEnd === 'c1' ? r1 : r0;
    if (rr > 0) path(g, circleD(P, capEnd === 'c1' ? c1 : c0, a, rr), { fill: o.capFill ?? shade(c.fill, 0.3), ...st, part: 'cylinder-cap' });
  }
  const base = proj3(P, c0);
  const tip = proj3(P, c1);
  const ports = reg(o.F, o.name, p, { base, tip, center: proj3(P, add3(c0, A, 0.5)) });
  return { node: g, ...geom, tip, base, cap: capEnd, alpha, ports, axis: a };
}

export type KnobOpts = Loose<{
  side: string; face: string; dot: boolean; dotColor: string; stroke: string; width: number; shading: boolean;
  part: string; F: Figure; name: string;
}>;

export function knob3(p: Parent, P: Proj, base: V3, axis: AxisSpec, r: number, len: number, o: KnobOpts = {}): Cyl {
  const a = axis3(axis);
  const tip = add3(base, a, len);
  const res = cylinder3(p, P, base, tip, r, r, {
    fill: o.side ?? '#c9ced6', capFill: o.face ?? '#ffffff', stroke: o.stroke, width: o.width ?? STYLE.line.hair * 1.2,
    shading: o.shading, part: o.part ?? 'knob', F: o.F, name: o.name,
  });
  if (o.dot !== false && res.cap === 'c1') path(res.node, circleD(P, tip, a, r * 0.28), { fill: o.dotColor ?? C.ink, part: 'knob-dot' });
  return res;
}
