// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Dash, Figure, Loose, Parent, Point } from './types.ts';
import { STYLE } from './style.ts';
import { path, polygon } from './draw.ts';
import { at, f3, unit } from './util.ts';
import { INK, gOf, rad, sign1 } from './chem-text.ts';

export type Cubic = readonly [Point, Point, Point, Point];
export type HeadKind = 'end' | 'start' | 'both' | 'none';
export type RelPair = readonly [string, string];

export type BarbOpts = Loose<{ len: number; half: number; notch: number; side: number; color: string }>;

export function barbHead(p: Parent, tip: Point, dir: Point, o: BarbOpts = {}): SVGPolygonElement {
  const len = o.len ?? 4.2;
  const notch = o.notch ?? 0.28;
  const side = o.side ?? 0;
  const color = o.color ?? INK;
  const [ux, uy] = unit(dir[0], dir[1]);
  const nx = uy;
  const ny = -ux;
  const h = o.half ?? len * (side !== 0 ? 0.48 : 0.4);
  const bx = tip[0] - ux * len;
  const by = tip[1] - uy * len;
  const inner: Point = [tip[0] - ux * len * (1 - notch), tip[1] - uy * len * (1 - notch)];
  const L: Point = [bx + nx * h, by + ny * h];
  const R: Point = [bx - nx * h, by - ny * h];
  const pts: Point[] = side === 0 ? [tip, L, inner, R] : side > 0 ? [tip, L, inner] : [tip, inner, R];
  return polygon(p, pts, { fill: color, part: 'arrowhead' });
}

function bez1(a: number, b: number, c: number, d: number, t: number): number {
  return (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
}

export function bezierAt(cb: Cubic, t: number): Point {
  const [p0, c1, c2, p1] = cb;
  return [bez1(p0[0], c1[0], c2[0], p1[0], t), bez1(p0[1], c1[1], c2[1], p1[1], t)];
}

function curveParam(cb: Cubic, atEnd: boolean, dist: number): number {
  const E = atEnd ? cb[3] : cb[0];
  for (let i = 1; i <= 1000; i++) {
    const t = atEnd ? 1 - i / 1000 : i / 1000;
    const q = bezierAt(cb, t);
    if (Math.hypot(q[0] - E[0], q[1] - E[1]) >= dist) return t;
  }
  return atEnd ? 0 : 1;
}

export type CurveOpts = Loose<{
  head: HeadKind;
  harpoon: number;
  len: number;
  half: number;
  width: number;
  color: string;
  dash: Dash;
  part: string;
}>;
export interface CurveResult {
  node: SVGGElement;
  ctrl: Cubic;
}

function shaftPath(cb: Cubic, t0: number, t1: number): string {
  let d = 'M';
  for (let i = 0; i < 49; i++) {
    const [x, y] = bezierAt(cb, t0 + ((t1 - t0) * i) / 48);
    d += `${i > 0 ? ' L' : ''}${f3(x)},${f3(y)}`;
  }
  return d;
}

export function curveArrow(p: Parent, cb: Cubic, o: CurveOpts = {}): CurveResult {
  const g = gOf(p, o.part ?? 'arrow');
  const len = o.len ?? 4.2;
  const head = o.head ?? 'end';
  const col = o.color ?? INK;
  const [p0, , , p1] = cb;
  const hasEnd = head === 'end' || head === 'both';
  const hasStart = head === 'start' || head === 'both';
  const t0 = hasStart ? curveParam(cb, false, len * 0.75) : 0;
  const t1 = hasEnd ? curveParam(cb, true, len * 0.75) : 1;
  path(g, shaftPath(cb, t0, t1), { stroke: col, width: o.width ?? STYLE.line.normal, cap: 'butt', dash: o.dash, part: 'arrow-shaft' });
  const hs: BarbOpts = { len, half: o.half, color: col, side: o.harpoon ?? 0 };
  if (hasEnd) {
    const q = bezierAt(cb, curveParam(cb, true, len));
    barbHead(g, p1, [p1[0] - q[0], p1[1] - q[1]], hs);
  }
  if (hasStart) {
    const q = bezierAt(cb, curveParam(cb, false, len));
    barbHead(g, p0, [p0[0] - q[0], p0[1] - q[1]], hs);
  }
  return { node: g.node, ctrl: cb };
}

export interface ArcGeom {
  cx: number;
  cy: number;
  r: number;
  sg: number;
}

export function arcPoint(g: ArcGeom, a: number): Point {
  return [g.cx + g.r * Math.cos(rad(a)), g.cy + g.r * Math.sin(rad(a))];
}

export function arcTangent(g: ArcGeom, a: number): Point {
  return [-Math.sin(rad(a)) * g.sg, Math.cos(rad(a)) * g.sg];
}

function degOf(g: ArcGeom, d: number): number {
  return ((d / g.r) * 180 / Math.PI) * g.sg;
}

export type ArcOpts = Loose<{
  head: HeadKind;
  harpoon: 'out' | 'in';
  len: number;
  half: number;
  notch: number;
  width: number;
  color: string;
  dash: Dash;
  part: string;
  F: Figure;
  rel: RelPair;
  kind: string;
}>;
export interface ArcResult {
  node: SVGGElement;
  arc: ArcGeom;
}

function harpoonSide(g: ArcGeom, harpoon: 'out' | 'in' | undefined, tip: Point, dir: Point): number {
  if (harpoon === undefined) return 0;
  const out = [tip[0] - g.cx, tip[1] - g.cy];
  const left = [dir[1], -dir[0]];
  const s = sign1((out[0] ?? 0) * (left[0] ?? 0) + (out[1] ?? 0) * (left[1] ?? 0));
  return harpoon === 'out' ? s : -s;
}

function arcHead(g: { node: SVGGElement }, geom: ArcGeom, a: number, back: number, o: ArcOpts): void {
  const tip = arcPoint(geom, a);
  const q = arcPoint(geom, a - back);
  const dir: Point = [tip[0] - q[0], tip[1] - q[1]];
  barbHead(g, tip, dir, { len: o.len ?? 4.2, half: o.half, notch: o.notch, color: o.color ?? INK, side: harpoonSide(geom, o.harpoon, tip, dir) });
}

export function arcArrow(p: Parent, cx: number, cy: number, r: number, a0: number, a1: number, o: ArcOpts = {}): ArcResult {
  const g = gOf(p, o.part ?? 'arc-arrow');
  const len = o.len ?? 4.2;
  const head = o.head ?? 'end';
  const geom: ArcGeom = { cx, cy, r, sg: sign1(a1 - a0) };
  const hasEnd = head === 'end' || head === 'both';
  const hasStart = head === 'start' || head === 'both';
  const s0 = hasStart ? a0 + degOf(geom, len * 0.75) : a0;
  const e1 = hasEnd ? a1 - degOf(geom, len * 0.75) : a1;
  const [x0, y0] = arcPoint(geom, s0);
  const [x1, y1] = arcPoint(geom, e1);
  const large = Math.abs(e1 - s0) > 180 ? 1 : 0;
  const sweep = geom.sg > 0 ? 1 : 0;
  const d = `M${f3(x0)},${f3(y0)} A${f3(r)},${f3(r)} 0 ${large} ${sweep} ${f3(x1)},${f3(y1)}`;
  path(g, d, { stroke: o.color ?? INK, width: o.width ?? STYLE.line.normal, cap: 'butt', dash: o.dash, part: 'arrow-shaft' });
  if (hasEnd) arcHead(g, geom, a1, degOf(geom, len), o);
  if (hasStart) arcHead(g, geom, a0, -degOf(geom, len), o);
  if (o.F !== undefined && o.rel !== undefined) o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'flow');
  return { node: g.node, arc: geom };
}

export type EquilibriumOpts = ArcOpts & Loose<{ gap: number; back: number }>;

export function equilibriumArc(p: Parent, cx: number, cy: number, r: number, a0: number, a1: number, o: EquilibriumOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'equilibrium-arc');
  const gap = o.gap ?? 2.2;
  const back = o.back ?? 1;
  const sg = sign1(a1 - a0);
  const outer = sg > 0 ? r + gap / 2 : r - gap / 2;
  const inner = sg > 0 ? r - gap / 2 : r + gap / 2;
  const cut = ((a1 - a0) * (1 - back)) / 2;
  arcArrow(g, cx, cy, outer, a0, a1, { ...o, head: 'end', harpoon: 'out', F: undefined });
  arcArrow(g, cx, cy, inner, a1 - cut, a0 + cut, { ...o, head: 'end', harpoon: 'in', F: undefined });
  if (o.F !== undefined && o.rel !== undefined) {
    o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'equilibrium');
    o.F.drew(o.rel[1], o.rel[0], o.kind ?? 'equilibrium');
  }
  return { node: g.node };
}

export type BranchOpts = CurveOpts &
  Loose<{
    mode: 'out' | 'in';
    dir: 'cw' | 'ccw';
    curl: number;
    endDir: number;
    lift: number;
    F: Figure;
    rel: RelPair;
    kind: string;
  }>;
export interface BranchResult extends CurveResult {
  start: Point;
  end: Point;
}

function endVector(endDir: number | undefined, from: Point, to: Point): Point {
  return endDir !== undefined ? [Math.cos(rad(endDir)), Math.sin(rad(endDir))] : unit(from[0] - to[0], from[1] - to[1]);
}

function outCubic(J: Point, t: Point, to: Point, k: number, D: number, endDir: number | undefined): Cubic {
  const c1: Point = [J[0] + t[0] * k * D, J[1] + t[1] * k * D];
  const e = endVector(endDir, to, c1);
  return [J, c1, [to[0] - e[0] * k * D * 0.6, to[1] - e[1] * k * D * 0.6], to];
}

function inCubic(J: Point, t: Point, to: Point, k: number, D: number, endDir: number | undefined): Cubic {
  const c2: Point = [J[0] - t[0] * k * D, J[1] - t[1] * k * D];
  const s = endVector(endDir, c2, to);
  return [to, [to[0] + s[0] * k * D * 0.6, to[1] + s[1] * k * D * 0.6], c2, J];
}

export function cycleBranch(p: Parent, cx: number, cy: number, r: number, angle: number, to: Point, o: BranchOpts = {}): BranchResult {
  const mode = o.mode ?? 'out';
  const sg = (o.dir ?? 'cw') === 'cw' ? 1 : -1;
  const rr = r + (o.lift ?? 0);
  const k = o.curl ?? 0.35;
  const J: Point = [cx + rr * Math.cos(rad(angle)), cy + rr * Math.sin(rad(angle))];
  const t: Point = [-Math.sin(rad(angle)) * sg, Math.cos(rad(angle)) * sg];
  const D = Math.hypot(to[0] - J[0], to[1] - J[1]);
  const pts = mode === 'out' ? outCubic(J, t, to, k, D, o.endDir) : inCubic(J, t, to, k, D, o.endDir);
  const head = mode === 'out' ? (o.head ?? 'end') : (o.head ?? 'none');
  const a = curveArrow(p, pts, { ...o, head, part: 'cycle-branch' });
  if (o.F !== undefined && o.rel !== undefined) o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'flow');
  return { node: a.node, start: at(pts, 0), end: at(pts, 3), ctrl: a.ctrl };
}

export type CurlyOpts = CurveOpts &
  Loose<{ bend: number; fishhook: boolean; gap0: number; gap1: number; F: Figure; rel: RelPair; kind: string }>;

export function curlyArrow(p: Parent, from: Point, to: Point, o: CurlyOpts = {}): CurveResult {
  const [ux, uy] = unit(to[0] - from[0], to[1] - from[1]);
  const g0 = o.gap0 ?? 0;
  const g1 = o.gap1 ?? 0;
  const a: Point = [from[0] + ux * g0, from[1] + uy * g0];
  const b: Point = [to[0] - ux * g1, to[1] - uy * g1];
  const Lc = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bend = o.bend ?? 0.35;
  const h = (bend * Lc) / 0.75;
  const n: Point = [uy, -ux];
  const c1: Point = [a[0] + (b[0] - a[0]) * 0.15 + n[0] * h, a[1] + (b[1] - a[1]) * 0.15 + n[1] * h];
  const c2: Point = [a[0] + (b[0] - a[0]) * 0.85 + n[0] * h, a[1] + (b[1] - a[1]) * 0.85 + n[1] * h];
  const harpoon = o.fishhook === true ? (bend >= 0 ? 1 : -1) : o.harpoon;
  const r = curveArrow(p, [a, c1, c2, b], { ...o, harpoon, part: o.part ?? 'curly-arrow' });
  if (o.F !== undefined && o.rel !== undefined) o.F.drew(o.rel[0], o.rel[1], o.kind ?? 'flow');
  return r;
}

export interface ArcThroughResult {
  node: SVGGElement;
  ctrl?: Cubic;
  arc?: ArcGeom;
  cx?: number;
  cy?: number;
  r?: number;
}

function angleOf(c: Point, q: Point): number {
  return (Math.atan2(q[1] - c[1], q[0] - c[0]) * 180) / Math.PI;
}

function mod360(v: number): number {
  return ((v % 360) + 360) % 360;
}

export function arcThrough(p: Parent, p0: Point, pm: Point, p1: Point, o: ArcOpts = {}): ArcThroughResult {
  const [ax, ay] = p0;
  const [bx, by] = pm;
  const [qx, qy] = p1;
  const d = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
  if (Math.abs(d) < 1e-9) return curveArrow(p, [p0, pm, pm, p1], { head: o.head, len: o.len, half: o.half, width: o.width, color: o.color, dash: o.dash, part: o.part });
  const cx = ((ax * ax + ay * ay) * (by - qy) + (bx * bx + by * by) * (qy - ay) + (qx * qx + qy * qy) * (ay - by)) / d;
  const cy = ((ax * ax + ay * ay) * (qx - bx) + (bx * bx + by * by) * (ax - qx) + (qx * qx + qy * qy) * (bx - ax)) / d;
  const r = Math.hypot(ax - cx, ay - cy);
  const c: Point = [cx, cy];
  const a0 = angleOf(c, p0);
  const s = mod360(angleOf(c, pm) - a0) < mod360(angleOf(c, p1) - a0) ? 1 : -1;
  const a1 = a0 + s * mod360(s * (angleOf(c, p1) - a0));
  return { ...arcArrow(p, cx, cy, r, a0, a1, o), cx, cy, r };
}
