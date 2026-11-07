// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/light3.js
import type { GradientStop, Handle, Loose, Parent, Point } from './types.ts';
import type { Proj } from './geo-proj.ts';
import { proj3 } from './geo-proj.ts';
import type { V3 } from './geo-vec.ts';
import { add3, cross3, dot3, scale3, sub3, unit3 } from './geo-vec.ts';
import { el } from './core.ts';
import { ramp } from './style.ts';
import { defsOf } from './svgdefs.ts';
import { at, f3 } from './util.ts';

export type Box = readonly [number, number, number, number];

export interface Style3 {
  color?: string | undefined;
  opacity?: number | undefined;
  fade?: readonly number[] | undefined;
  part?: string | undefined;
}

export interface SeenSpec {
  transmission: number;
  tint: string;
  mix: number;
}

export interface HighlightSpec {
  dir?: Point | undefined;
  span?: number | undefined;
  at?: number | undefined;
  width?: number | undefined;
  opacity?: number | undefined;
}

export interface BlendSpec {
  k?: number | undefined;
  mix?: number | undefined;
}

export type LensSpec = { c: V3; axis: V3 } & Loose<{
  r: number; e1: V3; e2: V3; t: number; n: number; rim: string; rimOpacity: number; face: readonly GradientStop[]; stroke: string; width: number;
  faceWidth: number; highlight: false | HighlightSpec; seen: Loose<SeenSpec>; blend: boolean | BlendSpec; glass: string;
}>;

export type SurfaceSpec = { point: V3; normal: V3 } & Loose<{ pts: readonly V3[]; veil: number }>;

export interface Inner {
  pts: V3[];
  style: Style3;
  beam: number;
}

export interface SurfaceItem {
  kind: 'surface';
  idx: number;
  name: string;
  point: V3;
  normal: V3;
  box: Box | null;
  sil: Point[] | null;
  veil: number;
}

export interface LensItem {
  kind: 'lens';
  idx: number;
  name: string;
  point: V3;
  normal: V3;
  axis: V3;
  t: number;
  e1: V3;
  e2: V3;
  front: number;
  faceRing: V3[];
  sil: Point[];
  box: Box;
  inner: Inner[];
  blendSegs: SegItem[];
  s: LensSpec;
  seen: SeenSpec;
  glass: string;
}

export interface SegItem {
  kind: 'seg';
  idx: number;
  beam: number;
  i: number;
  total: number;
  pts3: V3[];
  a3: V3;
  b3: V3;
  page: Point[];
  box: Box;
  style: Style3;
  front: LensItem[];
  veils: SurfaceItem[];
  blends: LensItem[];
}

export type PlaneItem = SurfaceItem | LensItem;
export type Item = PlaneItem | SegItem;

export interface Tint {
  to: string;
  amount: number;
}

let lid = 0;

export function nextId(): number {
  lid += 1;
  return lid;
}

export function mean3(pts: readonly V3[]): V3 {
  let s: V3 = [0, 0, 0];
  for (const q of pts) s = add3(s, q, 1 / pts.length);
  return s;
}

export function bbox(pts: readonly Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of pts) {
    x0 = Math.min(x0, q[0]);
    y0 = Math.min(y0, q[1]);
    x1 = Math.max(x1, q[0]);
    y1 = Math.max(y1, q[1]);
  }
  return [x0, y0, x1, y1];
}

export function boxHit(a: Box, b: Box): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

export function pageOf(P: Proj, pts: readonly V3[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) out.push(proj3(P, q));
  return out;
}

export function basis(n: V3): [V3, V3] {
  const t: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = unit3(sub3(t, scale3(n, dot3(t, n))));
  return [e1, cross3(n, e1)];
}

export function ring3(c: V3, e1: V3, e2: V3, n: number = 48): V3[] {
  const out: V3[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * 2 * Math.PI;
    out.push(add3(add3(c, e1, Math.cos(t)), e2, Math.sin(t)));
  }
  return out;
}

export function gradient(p: Parent, a: Point, b: Point, stops: readonly GradientStop[]): string {
  const id = `l3g${nextId()}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': f3(op ?? 1) });
  return `url(#${id})`;
}

export function tinted(col: string, tint: Tint | null): string {
  return tint === null ? col : ramp([col, tint.to], Math.min(1, tint.amount));
}

export function fadeAt(fd: readonly number[], u: number): number {
  const x = u * (fd.length - 1);
  const k = Math.min(fd.length - 2, Math.floor(x));
  return at(fd, k) + (at(fd, k + 1) - at(fd, k)) * (x - k);
}

export interface FillSrc {
  style: Style3;
  i: number;
  total: number;
  a3: V3;
  b3: V3;
}

export function fillOf(P: Proj, g: Parent, it: FillSrc, defColor: string, tint: Tint | null, opk: number = 1): { fill: string; fillOpacity?: number } {
  const col = tinted(it.style.color ?? defColor, tint);
  const op = (it.style.opacity ?? 0.3) * opk;
  const fd = it.style.fade;
  if (fd === undefined) return { fill: col, fillOpacity: f3(op) };
  const a = proj3(P, it.a3);
  const b = proj3(P, it.b3);
  const u0 = it.i / it.total;
  const u1 = (it.i + 1) / it.total;
  return { fill: gradient(g, a, b, [[0, col, fadeAt(fd, u0) * opk], [1, col, fadeAt(fd, u1) * opk]]) };
}

export interface BeamDef {
  stops: readonly BeamStop[];
  style: Style3;
}

export type BeamStop = readonly V3[] | ({ at: string } & Loose<{ pts: readonly V3[]; fill: number }>);

export interface Scene3Opts {
  eps?: number | undefined;
  part?: string | undefined;
}

export interface Scene3 {
  p: Parent;
  P: Proj;
  o: Scene3Opts;
  eps: number;
  items: Item[];
  named: Record<string, PlaneItem>;
  beams: BeamDef[];
  slots: Record<string, Handle>;
}

export interface Scene3Out {
  slots: Record<string, Handle>;
  order: string[];
  lenses: Record<string, { silhouette: Point[]; face: Point[] }>;
  segments: { page: Point[]; beam: number }[];
}
