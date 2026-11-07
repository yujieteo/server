// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/draw.js
import type { ArrowOpts, Figure, Loose, Parent, Point, Rect } from './types.ts';
import { ctm, el, node, text } from './core.ts';
import { STYLE } from './style.ts';
import { at, f3, unit } from './util.ts';
import { circle, line, path, polygon, polyline, rect } from './draw-base.ts';

export function toLocal(F: Figure, p: Parent, q: { x: number; y: number }): Point {
  const m = ctm(node(p)).inverse().multiply(ctm(F.svg));
  const r = new DOMPoint(q.x, q.y).matrixTransform(m);
  return [r.x, r.y];
}

function head(p: Parent, tip: Point, dir: Point, s: ArrowOpts): SVGPolygonElement {
  const L = s.head ?? STYLE.arrow.head;
  const Wd = s.headWidth ?? L * 0.42;
  const [ux, uy] = dir;
  const nx = -uy;
  const ny = ux;
  const bx = tip[0] - ux * L;
  const by = tip[1] - uy * L;
  const notch = s.notch ?? 0.18;
  const a: Point[] = [
    [tip[0], tip[1]],
    [bx + nx * Wd, by + ny * Wd],
    [tip[0] - ux * L * (1 - notch), tip[1] - uy * L * (1 - notch)],
    [bx - nx * Wd, by - ny * Wd],
  ];
  return polygon(p, a, { fill: s.stroke ?? STYLE.color.ink, part: 'arrowhead' });
}

function openHead(g: Parent, tip: Point, dir: Point, st: ArrowOpts): SVGPathElement {
  const L = st.head ?? STYLE.arrow.head;
  const x0 = f3(tip[0] - dir[0] * L - dir[1] * L * 0.5);
  const y0 = f3(tip[1] - dir[1] * L + dir[0] * L * 0.5);
  const x1 = f3(tip[0] - dir[0] * L + dir[1] * L * 0.5);
  const y1 = f3(tip[1] - dir[1] * L - dir[0] * L * 0.5);
  const d = `M${x0},${y0} L${f3(tip[0])},${f3(tip[1])} L${x1},${y1}`;
  return path(g, d, { stroke: st.stroke, width: st.width, join: 'miter', part: 'arrowhead' });
}

interface Route {
  d: string;
  a: Point;
  b: Point;
  endDir: Point;
  startDir: Point;
}

function corner(P: Point[], i: number, r: number): string {
  const [px, py] = at(P, i);
  const prev = at(P, i - 1);
  const nextP = at(P, i + 1);
  const ua = unit(px - prev[0], py - prev[1]);
  const ub = unit(nextP[0] - px, nextP[1] - py);
  const rr = Math.min(r, Math.hypot(px - prev[0], py - prev[1]) / 2, Math.hypot(nextP[0] - px, nextP[1] - py) / 2);
  return ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + ub[0] * rr)},${f3(py + ub[1] * rr)}`;
}

function viaRoute(a0: Point, b0: Point, s: ArrowOpts, st: ArrowOpts, via: readonly Point[]): Route {
  const g0 = s.gap0 ?? 0;
  const g1 = s.gap1 ?? 0;
  const P: Point[] = [a0, ...via, b0];
  const second = at(P, 1);
  const u0 = unit(second[0] - a0[0], second[1] - a0[1]);
  const a: Point = [a0[0] + u0[0] * g0, a0[1] + u0[1] * g0];
  const n = P.length;
  const beforeLast = at(P, n - 2);
  const u1 = unit(b0[0] - beforeLast[0], b0[1] - beforeLast[1]);
  const b: Point = [b0[0] - u1[0] * g1, b0[1] - u1[1] * g1];
  P[0] = a;
  P[n - 1] = b;
  let d = `M${f3(a[0])},${f3(a[1])}`;
  for (let i = 1; i < n - 1; i++) d += corner(P, i, s.radius ?? 3);
  const L = st.head ?? STYLE.arrow.head;
  const tail = s.both === true ? L * 0.8 : 0;
  d += ` L${f3(b[0] - u1[0] * L * 0.8)},${f3(b[1] - u1[1] * L * 0.8)}`;
  const startDir: Point = [-u0[0], -u0[1]];
  if (tail !== 0) d = d.replace(/^M[^ ]+/, `M${f3(a[0] - startDir[0] * tail)},${f3(a[1] - startDir[1] * tail)}`);
  return { d, a, b, endDir: u1, startDir };
}

function bentRoute(a: Point, b: Point, u: Point, len: number, bend: number, both: boolean, L: number): Route {
  const mx = (a[0] + b[0]) / 2 - u[1] * bend * len;
  const my = (a[1] + b[1]) / 2 + u[0] * bend * len;
  const endDir = unit(b[0] - mx, b[1] - my);
  const startDir = unit(a[0] - mx, a[1] - my);
  const bb: Point = [b[0] - endDir[0] * L * 0.8, b[1] - endDir[1] * L * 0.8];
  const aa: Point = both ? [a[0] - startDir[0] * L * 0.8, a[1] - startDir[1] * L * 0.8] : a;
  return { d: `M${f3(aa[0])},${f3(aa[1])} Q${f3(mx)},${f3(my)} ${f3(bb[0])},${f3(bb[1])}`, a, b, endDir, startDir };
}

function straightRoute(a0: Point, b0: Point, s: ArrowOpts, st: ArrowOpts): Route {
  const g0 = s.gap0 ?? 0;
  const g1 = s.gap1 ?? 0;
  const u = unit(b0[0] - a0[0], b0[1] - a0[1]);
  const a: Point = [a0[0] + u[0] * g0, a0[1] + u[1] * g0];
  const b: Point = [b0[0] - u[0] * g1, b0[1] - u[1] * g1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bend = s.bend ?? 0;
  const L = st.head ?? STYLE.arrow.head;
  if (bend !== 0) return bentRoute(a, b, u, len, bend, s.both === true, L);
  const aa: Point = s.both === true ? [a[0] + u[0] * L * 0.8, a[1] + u[1] * L * 0.8] : a;
  const d = `M${f3(aa[0])},${f3(aa[1])} L${f3(b[0] - u[0] * L * 0.8)},${f3(b[1] - u[1] * L * 0.8)}`;
  return { d, a, b, endDir: u, startDir: [-u[0], -u[1]] };
}

function resolvePoint(F: Figure | undefined, p: Parent, q: Point | string): Point {
  if (typeof q !== 'string') return q;
  if (F === undefined) throw new Error('an anchor name needs F');
  return toLocal(F, p, F.at(q));
}

function arrowLabel(g: Parent, r: Route, s: ArrowOpts, label: string): void {
  const { a, b } = r;
  const m = s.labelAt ?? 0.5;
  const mx = a[0] + (b[0] - a[0]) * m;
  const my = a[1] + (b[1] - a[1]) * m;
  const off = s.labelOffset ?? 4;
  const u = unit(b[0] - a[0], b[1] - a[1]);
  text(g, mx - u[1] * off, my + u[0] * off, label, { anchor: 'middle', valign: 'middle', size: s.labelSize, color: s.labelColor });
}

export function arrow(p: Parent, from: Point | string, to: Point | string, s: ArrowOpts = {}): SVGGElement {
  const F = s.F;
  const a = resolvePoint(F, p, from);
  const b = resolvePoint(F, p, to);
  const st: ArrowOpts = { stroke: STYLE.color.ink, width: STYLE.line.normal, ...s };
  const r = s.via !== undefined && s.via.length > 0 ? viaRoute(a, b, s, st, s.via) : straightRoute(a, b, s, st);
  const g = el(p, 'g', { 'data-part': s.part ?? 'arrow' });
  path(g, r.d, { stroke: st.stroke, width: st.width, dash: st.dash, part: 'arrow-shaft', opacity: st.opacity });
  const open = s.headStyle === 'open';
  if (s.noHead !== true) {
    if (open) openHead(g, r.b, r.endDir, st);
    else head(g, r.b, r.endDir, st);
  }
  if (s.both === true) {
    if (open) openHead(g, r.a, r.startDir, st);
    else head(g, r.a, r.startDir, st);
  }
  if (F !== undefined && typeof from === 'string' && typeof to === 'string') F.drawn.push({ from, to, kind: s.kind ?? 'flow' });
  if (s.label !== undefined && s.label !== '') arrowLabel(g, r, s, s.label);
  return g;
}

export type BlockArrowOpts = Loose<{ width: number; head: number; headWidth: number; fill: string; stroke: string; part: string }>;

export function blockArrow(p: Parent, from: Point, to: Point, o: BlockArrowOpts = {}): SVGPolygonElement {
  const width = o.width ?? 6;
  const headLen = o.head ?? 7;
  const headWidth = o.headWidth ?? 11;
  const [x0, y0] = from;
  const [x1, y1] = to;
  const [ux, uy] = unit(x1 - x0, y1 - y0);
  const nx = -uy;
  const ny = ux;
  const bx = x1 - ux * headLen;
  const by = y1 - uy * headLen;
  const w = width / 2;
  const hw = headWidth / 2;
  const pts: Point[] = [
    [x0 + nx * w, y0 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x1, y1],
    [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [x0 - nx * w, y0 - ny * w],
  ];
  return polygon(p, pts, { fill: o.fill ?? STYLE.color.light, stroke: o.stroke, width: 0.4, part: o.part ?? 'block-arrow' });
}

export type CalloutOpts = Loose<{
  anchor: 'start' | 'middle' | 'end';
  size: number;
  textColor: string;
  halo: boolean | string;
  pad: number;
  elbow: Point;
  color: string;
  width: number;
  dot: boolean;
  dotR: number;
}>;

function isPointList(t: Point | readonly Point[]): t is readonly Point[] {
  return typeof t[0] !== 'number';
}

function calloutOne(p: Parent, target: Point, at0: Point, str: string, o: CalloutOpts): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'callout' });
  const anchor = o.anchor ?? (at0[0] < target[0] ? 'end' : 'start');
  const t = text(g, at0[0], at0[1], str, { anchor, valign: 'middle', size: o.size, color: o.textColor, halo: o.halo });
  const b = t.getBBox();
  const ty = t.transform.baseVal.consolidate()?.matrix.f ?? 0;
  const pad = o.pad ?? 0.8;
  const bx0 = b.x - pad;
  const bx1 = b.x + b.width + pad;
  const by0 = b.y + ty - pad;
  const by1 = b.y + ty + b.height + pad;
  let ex = Math.min(bx1, Math.max(bx0, target[0]));
  let ey = Math.min(by1, Math.max(by0, target[1]));
  if (target[1] >= by0 && target[1] <= by1) ey = (by0 + by1) / 2;
  if (target[0] >= bx0 && target[0] <= bx1) ex = Math.min(bx1 - 1, Math.max(bx0 + 1, target[0]));
  else if (target[1] < by0 || target[1] > by1) ex = target[0] < bx0 ? bx0 + Math.min(2, b.width / 3) : bx1 - Math.min(2, b.width / 3);
  const elbowPts: Point[] = o.elbow !== undefined ? [target, o.elbow, [ex, ey]] : [target, [ex, ey]];
  polyline(g, elbowPts, { stroke: o.color ?? STYLE.color.ink, width: o.width ?? STYLE.line.hair * 1.6 });
  if (o.dot !== false) circle(g, target[0], target[1], o.dotR ?? 0.7, { fill: o.color ?? STYLE.color.ink });
  return g;
}

export function callout(p: Parent, target: Point | readonly Point[], at0: Point, str: string, o: CalloutOpts = {}): SVGGElement {
  if (!isPointList(target)) return calloutOne(p, target, at0, str, o);
  const first = at(target, 0);
  const g0 = calloutOne(p, first, at0, str, o);
  for (let i = 1; i < target.length; i++) {
    const anchor = o.anchor ?? (at0[0] < first[0] ? 'end' : 'start');
    const gi = calloutOne(p, at(target, i), at0, str, { ...o, anchor });
    for (const e of gi.querySelectorAll('text')) e.remove();
    let c = gi.firstChild;
    while (c !== null) {
      g0.appendChild(c);
      c = gi.firstChild;
    }
    gi.remove();
  }
  return g0;
}

export type BracketOpts = Loose<{ side: 'left' | 'right' | 'top' | 'bottom'; depth: number; label: string; stroke: string; width: number }>;

export function bracket(p: Parent, a: Point, b: Point, o: BracketOpts = {}): SVGGElement {
  const side = o.side ?? 'bottom';
  const depth = o.depth ?? 2.5;
  const g = el(p, 'g', { 'data-part': 'bracket' });
  let d: string;
  let tp: [number, number];
  let anchor: 'start' | 'middle' | 'end' = 'middle';
  let va: 'top' | 'middle' | 'bottom' = 'middle';
  if (side === 'bottom' || side === 'top') {
    const s = side === 'bottom' ? 1 : -1;
    const y = a[1];
    d = `M${a[0]},${y} l0,${s * depth} L${b[0]},${y + s * depth} l0,${-s * depth}`;
    va = side === 'bottom' ? 'top' : 'bottom';
    tp = [(a[0] + b[0]) / 2, y + s * (depth + 1.5)];
  } else {
    const s = side === 'right' ? 1 : -1;
    const x = a[0];
    d = `M${x},${a[1]} l${s * depth},0 L${x + s * depth},${b[1]} l${-s * depth},0`;
    tp = [x + s * (depth + 1.5), (a[1] + b[1]) / 2];
    anchor = side === 'right' ? 'start' : 'end';
  }
  path(g, d, { stroke: o.stroke ?? STYLE.color.ink, width: o.width ?? STYLE.line.thin });
  if (o.label !== undefined && o.label !== '') text(g, tp[0], tp[1], o.label, { anchor, valign: va });
  return g;
}

export type ZoomOpts = Loose<{ stroke: string; width: number; dash: string; box: boolean }>;

function corners(r: Rect): Point[] {
  return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
}

function zoomPairs(src: Rect, dst: Rect): [number, number][] {
  const cxA = src.x + src.w / 2;
  const cyA = src.y + src.h / 2;
  const cxB = dst.x + dst.w / 2;
  const cyB = dst.y + dst.h / 2;
  const horiz = Math.abs(cxB - cxA) * src.h > Math.abs(cyB - cyA) * src.w;
  if (horiz) return cxB > cxA ? [[1, 0], [2, 3]] : [[0, 1], [3, 2]];
  return cyB > cyA ? [[3, 0], [2, 1]] : [[0, 3], [1, 2]];
}

export function zoomLines(p: Parent, src: Rect, dst: Rect, o: ZoomOpts = {}): SVGGElement {
  const stroke = o.stroke ?? STYLE.color.mid;
  const width = o.width ?? STYLE.line.hair;
  const dash = o.dash ?? '1.2 1';
  const g = el(p, 'g', { 'data-part': 'zoom' });
  if (o.box !== false) rect(g, src.x, src.y, src.w, src.h, { stroke, width: width * 1.5 });
  const A = corners(src);
  const B = corners(dst);
  for (const [i, j] of zoomPairs(src, dst)) line(g, at(A, i), at(B, j), { stroke, width, dash });
  return g;
}
