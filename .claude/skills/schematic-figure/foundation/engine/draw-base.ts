// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/draw.js
import type { CurveSpec, GradientStop, Loose, Paint, Parent, Point } from './types.ts';
import { el, node, paint } from './core.ts';
import { STYLE, shade } from './style.ts';
import { at, f3, linspace } from './util.ts';

function pts(a: readonly Point[]): string {
  let out = '';
  for (let i = 0; i < a.length; i++) {
    const q = at(a, i);
    out += `${i > 0 ? ' ' : ''}${f3(q[0])},${f3(q[1])}`;
  }
  return out;
}

export function path(p: Parent, d: string, s: Paint = {}): SVGPathElement {
  return el(p, 'path', { d, ...paint(s), 'data-part': s.part });
}

export function line(p: Parent, a: Point, b: Point, s: Paint = {}): SVGLineElement {
  return el(p, 'line', {
    x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]),
    ...paint({ stroke: STYLE.color.ink, ...s }), 'data-part': s.part,
  });
}

export function polyline(p: Parent, a: readonly Point[], s: Paint = {}): SVGPolylineElement {
  return el(p, 'polyline', { points: pts(a), ...paint({ stroke: STYLE.color.ink, ...s }), 'data-part': s.part });
}

export function polygon(p: Parent, a: readonly Point[], s: Paint = {}): SVGPolygonElement {
  return el(p, 'polygon', { points: pts(a), ...paint(s), 'data-part': s.part });
}

export function rect(p: Parent, x: number, y: number, w: number, h: number, s: Paint = {}): SVGRectElement {
  return el(p, 'rect', { x: f3(x), y: f3(y), width: f3(w), height: f3(h), rx: s.r, ry: s.r, ...paint(s), 'data-part': s.part });
}

export function circle(p: Parent, cx: number, cy: number, r: number, s: Paint = {}): SVGCircleElement {
  return el(p, 'circle', { cx: f3(cx), cy: f3(cy), r: f3(r), ...paint(s), 'data-part': s.part });
}

export function ellipse(p: Parent, cx: number, cy: number, rx: number, ry: number, s: Paint = {}): SVGEllipseElement {
  return el(p, 'ellipse', { cx: f3(cx), cy: f3(cy), rx: f3(rx), ry: f3(ry), ...paint(s), 'data-part': s.part });
}

function curvePoint(a: readonly Point[], i: number, closed: boolean): Point {
  const n = a.length;
  return closed ? at(a, (i + n) % n) : at(a, Math.max(0, Math.min(n - 1, i)));
}

export function smooth(a: readonly Point[], closed: boolean = false, tension: number = 0.5): string {
  const n = a.length;
  if (n < 2) return '';
  const first = at(a, 0);
  let d = `M${f3(first[0])},${f3(first[1])}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = curvePoint(a, i - 1, closed);
    const p1 = curvePoint(a, i, closed);
    const p2 = curvePoint(a, i + 1, closed);
    const p3 = curvePoint(a, i + 2, closed);
    const k = tension / 3;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += ` C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(p2[0])},${f3(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

export function evalCurve(c: CurveSpec, x: number): number {
  if (c.kind === 'expDecay') return c.offset + c.amp * Math.exp(-x / c.tau);
  if (c.kind === 'line') return c.offset + c.slope * x;
  return c.offset + c.amp * Math.exp(-((x - c.centre) ** 2) / (2 * c.sigma * c.sigma));
}

export function sample(curve: CurveSpec, x0: number, x1: number, n: number = 120): Point[] {
  const out: Point[] = [];
  for (const x of linspace(x0, x1, n)) out.push([x, evalCurve(curve, x)]);
  return out;
}

function defsOf(p: Parent): Element {
  let n: Node | null = node(p);
  while (n !== null && !(n instanceof Element && n.tagName === 'svg')) n = n.parentNode;
  const d = n instanceof Element ? n.querySelector('defs') : null;
  if (d === null) throw new Error('no defs in the figure');
  return d;
}

let gid = 0;

function addStops(g: Element, stops: readonly GradientStop[]): void {
  for (const s of stops) el(g, 'stop', { offset: s[0], 'stop-color': s[1], 'stop-opacity': s[2] ?? 1 });
}

export function linearGradient(p: Parent, stops: readonly GradientStop[], angle: number = 0): string {
  gid += 1;
  const id = `lg${gid}`;
  const a = (angle * Math.PI) / 180;
  const g = el(defsOf(p), 'linearGradient', {
    id, x1: f3(0.5 - Math.cos(a) / 2), y1: f3(0.5 - Math.sin(a) / 2), x2: f3(0.5 + Math.cos(a) / 2), y2: f3(0.5 + Math.sin(a) / 2),
  });
  addStops(g, stops);
  return `url(#${id})`;
}

export type RadialOpts = Loose<{ cx: number; cy: number; r: number; fx: number; fy: number }>;

export function radialGradient(p: Parent, stops: readonly GradientStop[], o: RadialOpts = {}): string {
  gid += 1;
  const id = `rg${gid}`;
  const cx = o.cx ?? 0.5;
  const cy = o.cy ?? 0.5;
  const g = el(defsOf(p), 'radialGradient', { id, cx, cy, r: o.r ?? 0.5, fx: o.fx ?? cx, fy: o.fy ?? cy });
  addStops(g, stops);
  return `url(#${id})`;
}

export function shaded(p: Parent, base: string, angle: number = 90): string {
  return linearGradient(p, [[0, shade(base, 0.45)], [0.35, shade(base, 0.12)], [0.7, base], [1, shade(base, -0.35)]], angle);
}

export function glow(p: Parent, sd: number = 1.2): string {
  gid += 1;
  const id = `gl${gid}`;
  const f = el(defsOf(p), 'filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  el(f, 'feGaussianBlur', { stdDeviation: sd, result: 'b' });
  const m = el(f, 'feMerge');
  el(m, 'feMergeNode', { in: 'b' });
  el(m, 'feMergeNode', { in: 'SourceGraphic' });
  return `url(#${id})`;
}

export function blur(p: Parent, sd: number = 1): string {
  gid += 1;
  const id = `bl${gid}`;
  const f = el(defsOf(p), 'filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' });
  el(f, 'feGaussianBlur', { stdDeviation: sd });
  return `url(#${id})`;
}

export type ShadowOpts = Loose<{ dx: number; dy: number; sd: number; opacity: number }>;

export function dropShadow(p: Parent, o: ShadowOpts = {}): string {
  gid += 1;
  const id = `sh${gid}`;
  const f = el(defsOf(p), 'filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' });
  el(f, 'feDropShadow', { dx: o.dx ?? 0.6, dy: o.dy ?? 0.8, stdDeviation: o.sd ?? 0.9, 'flood-opacity': o.opacity ?? 0.25 });
  return `url(#${id})`;
}

export function clipPath(p: Parent, d: string): string {
  gid += 1;
  const id = `cp${gid}`;
  const c = el(defsOf(p), 'clipPath', { id });
  el(c, 'path', { d });
  return `url(#${id})`;
}
