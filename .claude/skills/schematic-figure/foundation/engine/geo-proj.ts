// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { at, f3 } from './util.ts';
import type { AxisSpec, M3, V3 } from './geo-vec.ts';
import { UNIT, add3, axis3, cross3, dot3, scale3, sub3, unit3 } from './geo-vec.ts';

export interface Proj {
  ex: Point;
  ey: Point;
  ez: Point;
  origin: Point;
  view: V3;
}

export function projPt(P: Proj, x: number, y: number, z: number = 0): Point {
  return [
    P.origin[0] + x * P.ex[0] + y * P.ey[0] + z * P.ez[0],
    P.origin[1] + x * P.ex[1] + y * P.ey[1] + z * P.ez[1],
  ];
}

export function proj3(P: Proj, q: V3): Point {
  return projPt(P, q[0], q[1], q[2]);
}

export function projVec(P: Proj, v: V3): Point {
  return [v[0] * P.ex[0] + v[1] * P.ey[0] + v[2] * P.ez[0], v[0] * P.ex[1] + v[1] * P.ey[1] + v[2] * P.ez[1]];
}

export function projDepth(P: Proj, q: V3): number {
  return dot3(q, P.view);
}

export function projAt(P: Proj, origin: Point): Proj {
  return { ex: P.ex, ey: P.ey, ez: P.ez, origin: [origin[0], origin[1]], view: P.view };
}

export function projVisible(P: Proj, n: AxisSpec): boolean {
  return dot3(axis3(n), P.view) > 1e-9;
}

export type FaceKey = 'x0' | 'x1' | 'y0' | 'y1' | 'z0' | 'z1';

export interface Mapper {
  P: Proj;
  base: V3;
  du: V3;
  dv: V3;
}

export interface Face extends Mapper {
  key: FaceKey;
  normal: V3;
  visible: boolean;
  o: Point;
  eu: Point;
  ev: Point;
  corners: Point[];
  center: Point;
  size: Point;
}

export function faceWorld(M: Mapper, u: number, v: number): V3 {
  return add3(add3(M.base, M.du, u), M.dv, v);
}

export function faceAt(M: Mapper, u: number, v: number): Point {
  return proj3(M.P, faceWorld(M, u, v));
}

export function faceQuad(M: Mapper, u0: number, v0: number, u1: number, v1: number): Point[] {
  return [faceAt(M, u0, v0), faceAt(M, u1, v0), faceAt(M, u1, v1), faceAt(M, u0, v1)];
}

export function mapperCorners(M: Mapper): Point[] {
  return faceQuad(M, 0, 0, 1, 1);
}

export type PlaneNormal = { normal: AxisSpec; point?: V3 | undefined };
export type PlaneCoord = Loose<{ x: number; y: number; z: number }>;
export type PlaneSpec = number | Face | PlaneNormal | PlaneCoord;

function planeBasis(n: V3): [V3, V3] {
  const t = Math.abs(n[0]) < 0.9 ? at(UNIT, 0) : at(UNIT, 1);
  const e1 = unit3(sub3(t, scale3(n, dot3(t, n))));
  return [e1, cross3(n, e1)];
}

function inversePlane(plane: PlaneSpec): { c: V3; n: V3 } {
  if (typeof plane === 'number') return { c: [0, 0, plane], n: [0, 0, 1] };
  if ('base' in plane) return { c: faceWorld(plane, 0, 0), n: plane.normal };
  if ('normal' in plane) return { c: plane.point ?? [0, 0, 0], n: axis3(plane.normal) };
  const k: number = plane.x !== undefined ? 0 : plane.y !== undefined ? 1 : plane.z !== undefined ? 2 : -1;
  const value = k === 0 ? plane.x : k === 1 ? plane.y : plane.z;
  if (k < 0 || value === undefined) throw new Error('P.inv: bad plane');
  const c: M3 = [0, 0, 0];
  c[k] = value;
  return { c, n: at(UNIT, k) };
}

export function projInv(P: Proj, q: Point, plane: PlaneSpec = 0): V3 {
  const { c, n } = inversePlane(plane);
  const [e1, e2] = planeBasis(n);
  const a = projVec(P, e1);
  const b = projVec(P, e2);
  const o = proj3(P, c);
  const r: Point = [q[0] - o[0], q[1] - o[1]];
  const det = a[0] * b[1] - a[1] * b[0];
  const scaleDet = Math.hypot(...a) * Math.hypot(...b);
  if (Math.abs(det) < 1e-9 * (scaleDet === 0 || Number.isNaN(scaleDet) ? 1 : scaleDet)) {
    throw new Error('P.inv: the plane is seen edge-on');
  }
  return add3(add3(c, e1, (r[0] * b[1] - r[1] * b[0]) / det), e2, (a[0] * r[1] - a[1] * r[0]) / det);
}

export type ObliqueOpts = Loose<{
  preset: string; angle: number; depth: number; x: Point; y: Point; z: Point;
  scale: number; origin: Point; view: V3; below: boolean;
}>;

function presetDefaults(pre: string): Point {
  if (pre === 'cabinet') return [45, 0.5];
  if (pre === 'cavalier') return [45, 1];
  if (pre === 'angles') return [30, 0.5];
  throw new Error(`obliqueProj: unknown preset "${pre}"`);
}

function presetAxes(o: ObliqueOpts, pre: string): [Point, Point, Point] {
  if (o.x !== undefined && o.y !== undefined && o.z !== undefined) return [o.x, o.y, o.z];
  if (pre === 'isometric') {
    const a = ((o.angle ?? 30) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [[c, s], [-c, s], [0, -1]];
  }
  const dflt = presetDefaults(pre);
  const a = ((o.angle ?? dflt[0]) * Math.PI) / 180;
  const d = o.depth ?? dflt[1];
  return [[1, 0], [d * Math.cos(a), -d * Math.sin(a)], [0, -1]];
}

function viewOf(ex: Point, ey: Point, ez: Point, o: ObliqueOpts): V3 {
  if (o.view !== undefined) return unit3(o.view);
  const v = cross3([ex[0], ey[0], ez[0]], [-ex[1], -ey[1], -ez[1]]);
  const flip = Math.abs(v[2]) > 1e-9 && (v[2] < 0) !== (o.below ?? false);
  return unit3(flip ? [-v[0], -v[1], -v[2]] : v);
}

export function obliqueProj(o: ObliqueOpts = {}): Proj {
  const k = o.scale ?? 1;
  const [ex0, ey0, ez0] = presetAxes(o, o.preset ?? 'isometric');
  const ex: Point = [ex0[0] * k, ex0[1] * k];
  const ey: Point = [ey0[0] * k, ey0[1] * k];
  const ez: Point = [ez0[0] * k, ez0[1] * k];
  return { ex, ey, ez, origin: o.origin ?? [0, 0], view: viewOf(ex, ey, ez, o) };
}

export type CornerOpts = Loose<{ C: Point; n3: number; z: Point; below: boolean }>;

export function projFromCorners(O: Point, A: Point, B: Point, n1: number, n2: number, o: CornerOpts = {}): Proj {
  const x: Point = [(A[0] - O[0]) / n1, (A[1] - O[1]) / n1];
  const y: Point = [(B[0] - O[0]) / n2, (B[1] - O[1]) / n2];
  const n3 = o.n3 ?? 1;
  const z: Point =
    o.C !== undefined
      ? [(o.C[0] - O[0]) / n3, (o.C[1] - O[1]) / n3]
      : (o.z ?? [0, -(Math.hypot(...x) + Math.hypot(...y)) / 2]);
  return obliqueProj({ x, y, z, origin: O, below: o.below });
}

interface FaceFrame {
  ua: number;
  va: number;
  su: number;
  sv: number;
}

function unitAt(i: number): V3 {
  return at(UNIT, i);
}

function horizontalShare(Q: Proj, i: number): number {
  const v = projVec(Q, unitAt(i));
  const l = Math.hypot(...v);
  return Math.abs(v[0]) / (l === 0 || Number.isNaN(l) ? 1 : l);
}

function othersOf(ax: number): readonly [number, number] {
  return ax === 0 ? [1, 2] : ax === 1 ? [0, 2] : [0, 1];
}

function faceFrame(Q: Proj, ax: number, size: V3): FaceFrame {
  const [i, j] = othersOf(ax);
  const horiz = ax === 2;
  const swap = horiz && !(horizontalShare(Q, i) >= horizontalShare(Q, j));
  const ua = swap ? j : i;
  const va = horiz ? (swap ? i : j) : 2;
  let su = horiz ? (projVec(Q, unitAt(ua))[0] >= 0 ? 1 : -1) : 1;
  let sv = horiz ? 1 : -1;
  const eu0 = projVec(Q, unitAt(ua));
  const ev0 = projVec(Q, unitAt(va));
  const cu: Point = [eu0[0] * su * at(size, ua), eu0[1] * su * at(size, ua)];
  const cv: Point = [ev0[0] * sv * at(size, va), ev0[1] * sv * at(size, va)];
  if (cu[0] * cv[1] - cu[1] * cv[0] < 0) {
    if (horiz) sv = -sv;
    else su = -su;
  }
  return { ua, va, su, sv };
}

export function faceMapper(Q: Proj, key: FaceKey, size: V3): Face {
  const ax = 'xyz'.indexOf(key.charAt(0));
  const val = +key.charAt(1);
  const f = faceFrame(Q, ax, size);
  const sua = at(size, f.ua);
  const sva = at(size, f.va);
  const n: M3 = [0, 0, 0];
  n[ax] = val !== 0 ? 1 : -1;
  const base: M3 = [0, 0, 0];
  base[ax] = val * at(size, ax);
  if (f.su < 0) base[f.ua] = sua;
  if (f.sv < 0) base[f.va] = sva;
  const du: M3 = [0, 0, 0];
  const dv: M3 = [0, 0, 0];
  du[f.ua] = f.su * sua;
  dv[f.va] = f.sv * sva;
  const M: Mapper = { P: Q, base, du, dv };
  const o = faceAt(M, 0, 0);
  const pu = faceAt(M, 1, 0);
  const pv = faceAt(M, 0, 1);
  return {
    ...M, key, normal: n, visible: dot3(n, Q.view) > 1e-9, o,
    eu: [pu[0] - o[0], pu[1] - o[1]], ev: [pv[0] - o[0], pv[1] - o[1]],
    corners: faceQuad(M, 0, 0, 1, 1), center: faceAt(M, 0.5, 0.5), size: [sua, sva],
  };
}

export type FaceGroupOpts = Loose<{ rotate: number; part: string }>;

export function faceGroup(p: Parent, M: Face, u: number = 0, v: number = 0, o: FaceGroupOpts = {}): { node: SVGGElement; scale: number } {
  const a = M.eu;
  const b = M.ev;
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  const q = faceAt(M, u, v);
  const na = la === 0 || Number.isNaN(la) ? 1 : la;
  const nb = lb === 0 || Number.isNaN(lb) ? 1 : lb;
  const m = [f3(a[0] / na), f3(a[1] / na), f3(b[0] / nb), f3(b[1] / nb), f3(q[0]), f3(q[1])];
  const rot = o.rotate !== undefined && o.rotate !== 0 ? ` rotate(${o.rotate})` : '';
  const g = el(p, 'g', { transform: `matrix(${m.join(' ')})${rot}`, 'data-part': o.part ?? 'face-group' });
  return { node: g, scale: Math.sqrt(Math.abs(at(m, 0) * at(m, 3) - at(m, 1) * at(m, 2))) };
}
