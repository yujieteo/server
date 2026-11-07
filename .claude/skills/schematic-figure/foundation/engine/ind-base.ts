// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, GradientStop, Palette, Parent, Point, Ports } from './types.ts';
import { el, node, text } from './core.ts';
import { STYLE } from './style.ts';
import { polygon } from './draw.ts';
import { at, f3, unit } from './util.ts';

export const C: Palette = STYLE.color;
export const INK: string = C.ink;
export const PAPER: string = C.paper;

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: Record<Dir, Point> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface Part {
  node: SVGElement;
  ports: Ports;
}

export interface Rng {
  s: number;
}

export function newRng(seed: number = 1): Rng {
  const s = seed >>> 0;
  return { s: s === 0 ? 1 : s };
}

export function rngNext(r: Rng): number {
  r.s = (r.s * 1664525 + 1013904223) >>> 0;
  return r.s / 4294967296;
}

export function portOf(ports: Ports, k: string): Point {
  const v = ports[k];
  if (v === undefined) throw new Error(`no port ${k}`);
  return v;
}

export function reg(F: Figure | undefined, name: string | undefined, g: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, g, x, y);
  }
  return ports;
}

export function wrap(p: Parent, part: string, rot: number | undefined, cx: number, cy: number): SVGGElement {
  const turned = rot !== undefined && rot !== 0;
  return el(p, 'g', { 'data-part': part, transform: turned ? `rotate(${rot} ${f3(cx)} ${f3(cy)})` : undefined });
}

export function d(pts: readonly Point[]): string {
  let s = 'M';
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = at(pts, i);
    s += `${i > 0 ? ' L' : ''}${f3(x)},${f3(y)}`;
  }
  return s;
}

export function defsOf(p: Parent): Element {
  let n: Node | null = node(p);
  while (n !== null && !(n instanceof Element && n.tagName === 'svg')) n = n.parentNode;
  const defs = n instanceof Element ? n.querySelector('defs') : null;
  if (defs === null) throw new Error('no defs in the figure');
  return defs;
}

let uid = 0;

export function nextUid(): number {
  uid += 1;
  return uid;
}

export function userGradient(p: Parent, a: Point, b: Point, stops: readonly GradientStop[]): string {
  const id = `indg${nextUid()}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}

export function insideText(t: SVGTextElement, halo: string = PAPER): SVGTextElement {
  t.setAttribute('data-inside', 'symbol');
  t.setAttribute('paint-order', 'stroke');
  t.setAttribute('stroke', halo);
  t.setAttribute('stroke-width', '0.5');
  t.setAttribute('stroke-linejoin', 'round');
  return t;
}

export function symbolText(g: Parent, x: number, y: number, s: string, size: number, family: string | undefined, color: string, halo: string): SVGTextElement {
  const t = text(g, x, y, s, { size, family, anchor: 'middle', color, halo, haloWidth: 0.5 });
  t.setAttribute('data-inside', 'symbol');
  return t;
}

function offsetAt(pts: readonly Point[], N: readonly Point[], i: number, dist: number): Point {
  const n = pts.length;
  const [x, y] = at(pts, i);
  if (i === 0) {
    const a = at(N, 0);
    return [x + a[0] * dist, y + a[1] * dist];
  }
  if (i === n - 1) {
    const a = at(N, n - 2);
    return [x + a[0] * dist, y + a[1] * dist];
  }
  const a = at(N, i - 1);
  const b = at(N, i);
  const kk = 1 + a[0] * b[0] + a[1] * b[1];
  const k = kk === 0 || Number.isNaN(kk) ? 1 : kk;
  return [x + ((a[0] + b[0]) / k) * dist, y + ((a[1] + b[1]) / k) * dist];
}

export function offsetPoints(pts: readonly Point[], dist: number): Point[] {
  const n = pts.length;
  const N: Point[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = at(pts, i);
    const b = at(pts, i + 1);
    const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
    N.push([uy, -ux]);
  }
  const out: Point[] = [];
  for (let i = 0; i < n; i++) out.push(offsetAt(pts, N, i, dist));
  return out;
}

export interface Along {
  p: Point;
  u: Point;
}

export function along(pts: readonly Point[], s0: number): Along {
  let s = s0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = at(pts, i);
    const [x1, y1] = at(pts, i + 1);
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (s <= len || i + 2 === pts.length) {
      const t = len !== 0 ? Math.min(1, s / len) : 0;
      return { p: [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t], u: unit(x1 - x0, y1 - y0) };
    }
    s -= len;
  }
  throw new Error('path needs two points');
}

export function lengthOf(pts: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    const q = at(pts, i);
    const r = at(pts, i - 1);
    sum += Math.hypot(q[0] - r[0], q[1] - r[1]);
  }
  return sum;
}

function normAngle(a: number, a0: number): number {
  const TAU = 2 * Math.PI;
  return (((a - a0) % TAU) + TAU) % TAU;
}

export function arcPoints(p1: Point, p2: Point, p3: Point, n: number = 48): Point[] {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(D) < 1e-9) return [[x1, y1], [x3, y3]];
  const s1 = x1 * x1 + y1 * y1;
  const s2 = x2 * x2 + y2 * y2;
  const s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / D;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / D;
  const r = Math.hypot(x1 - cx, y1 - cy);
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const am = normAngle(Math.atan2(y2 - cy, x2 - cx), a0);
  const a1 = normAngle(Math.atan2(y3 - cy, x3 - cx), a0);
  const sweep = am < a1 ? a1 : a1 - 2 * Math.PI;
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

export function rounded(pts: readonly Point[], r: number): string {
  if (r === 0 || pts.length < 3) return d(pts);
  const p0 = at(pts, 0);
  let s = `M${f3(p0[0])},${f3(p0[1])}`;
  for (let i = 1; i + 1 < pts.length; i++) {
    const [px, py] = at(pts, i);
    const prev = at(pts, i - 1);
    const next = at(pts, i + 1);
    const ua = unit(px - prev[0], py - prev[1]);
    const ub = unit(next[0] - px, next[1] - py);
    const rr = Math.min(r, Math.hypot(px - prev[0], py - prev[1]) / 2, Math.hypot(next[0] - px, next[1] - py) / 2);
    s += ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + ub[0] * rr)},${f3(py + ub[1] * rr)}`;
  }
  const q = at(pts, pts.length - 1);
  return s + ` L${f3(q[0])},${f3(q[1])}`;
}

export function tri(g: Parent, tip: Point, u: Point, L: number, W: number, fill: string): SVGPolygonElement {
  const bx = tip[0] - u[0] * L;
  const by = tip[1] - u[1] * L;
  return polygon(g, [tip, [bx - u[1] * W, by + u[0] * W], [bx + u[1] * W, by - u[0] * W]], { fill, part: 'arrowhead' });
}
