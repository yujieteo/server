// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, GradientStop, Parent, Point, Ports } from './types.ts';
import { el, node } from './core.ts';
import { at, f3 } from './util.ts';

export type V3 = readonly [number, number, number];
export type M3 = [number, number, number];
export interface HasNormal {
  normal: V3;
}
export type AxisSpec = string | V3 | HasNormal;

export function reg(F: Figure | undefined, name: string | undefined, parent: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y);
  }
  return ports;
}

export function add3(a: V3, b: V3, k: number = 1): V3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}
export function sub3(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale3(a: V3, k: number): V3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}
export function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross3(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function len3(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function unit3(a: V3): V3 {
  const n = orOne(len3(a));
  return [a[0] / n, a[1] / n, a[2] / n];
}

export function orOne(v: number): number {
  return v === 0 || Number.isNaN(v) ? 1 : v;
}

export function dPts(pts: readonly Point[], close: boolean = true): string {
  let d = 'M';
  for (let i = 0; i < pts.length; i++) {
    const q = at(pts, i);
    d += `${i > 0 ? ' L' : ''}${f3(q[0])},${f3(q[1])}`;
  }
  return d + (close ? 'Z' : '');
}

export const UNIT: readonly [V3, V3, V3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function axis3(a: AxisSpec): V3 {
  if (typeof a !== 'string') return 'normal' in a ? a.normal : unit3(a);
  const sg = a.charAt(0) === '-' ? -1 : 1;
  const name = a.replace(/^[+-]/, '');
  const k = name.length === 1 ? 'xyz'.indexOf(name) : -1;
  if (k < 0) throw new Error(`axis3: unknown axis "${a}"`);
  return scale3(at(UNIT, k), sg);
}

function cross2(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointAfter(a: Point, b: Point): boolean {
  return (a[0] - b[0] || a[1] - b[1]) > 0;
}

function sortPoints(pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) {
    let k = out.length;
    while (k > 0 && pointAfter(at(out, k - 1), q)) k--;
    out.splice(k, 0, q);
  }
  return out;
}

function halfHull(pts: readonly Point[]): Point[] {
  const h: Point[] = [];
  for (const q of pts) {
    while (h.length >= 2 && cross2(at(h, h.length - 2), at(h, h.length - 1), q) <= 0) h.pop();
    h.push(q);
  }
  return h;
}

export function hull2(pts: readonly Point[]): Point[] {
  const sorted = sortPoints(pts);
  const lo = halfHull(sorted);
  const up = halfHull(sorted.toReversed());
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export function orderBy(keys: readonly number[]): number[] {
  const idx: number[] = [];
  for (let i = 0; i < keys.length; i++) {
    let k = idx.length;
    while (k > 0 && at(keys, at(idx, k - 1)) > at(keys, i)) k--;
    idx.splice(k, 0, i);
  }
  return idx;
}

let ugid = 0;

function defsOf(p: Parent): Element {
  let n: Node | null = node(p);
  while (n !== null && !(n instanceof Element && n.tagName === 'svg')) n = n.parentNode;
  const d = n instanceof Element ? n.querySelector('defs') : null;
  if (d === null) throw new Error('no defs in the figure');
  return d;
}

export function userGradient(p: Parent, a: Point, b: Point, stops: readonly GradientStop[]): string {
  ugid += 1;
  const id = `ug${ugid}`;
  const g = el(defsOf(p), 'linearGradient', {
    id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]),
  });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}
