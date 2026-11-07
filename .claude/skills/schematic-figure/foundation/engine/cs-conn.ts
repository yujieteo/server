// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { ArrowOpts, Figure, Loose, Paint, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { arrow, circle, path, polygon } from './draw.ts';
import { at, f3, unit } from './util.ts';
import type { NodeOut, RecOpts } from './cs-base.ts';
import { record, res, routeD } from './cs-base.ts';

const C = STYLE.color;

export type HeadStyle = 'fill' | 'open' | 'chevron';

export type ConnOpts = Paint &
  RecOpts &
  Loose<{
    F: Figure;
    via: readonly Point[];
    radius: number;
    gap0: number;
    gap1: number;
    dot: boolean | readonly Point[];
    dotR: number;
    outline: number;
    outline0: number;
    head: HeadStyle | boolean | number;
    headStyle: 'open' | 'chevron' | 'filled';
    tail: HeadStyle | boolean;
    headLength: number;
    headWidth: number;
    notch: number;
    order: 'hv' | 'vh';
    mid: number;
    side: 'left' | 'right';
    rail: number;
    railX: number;
  }>;

export interface PathOut {
  node: SVGGElement;
  points: Point[];
}

export function toArrow(o: ConnOpts, radius?: number): ArrowOpts {
  return {
    stroke: o.stroke ?? C.ink,
    width: o.width ?? STYLE.line.normal,
    dash: o.dash,
    opacity: o.opacity,
    cap: o.cap,
    join: o.join,
    radius: o.radius ?? radius,
    via: o.via,
    gap0: o.gap0,
    gap1: o.gap1,
    head: typeof o.head === 'number' ? o.head : undefined,
    headWidth: o.headWidth,
    notch: o.notch,
    headStyle: o.headStyle === 'open' || o.headStyle === 'filled' ? o.headStyle : undefined,
    part: o.part,
    kind: o.kind,
  };
}

function shorten(P: Point[], idx: number, from: Point, toward: Point, gap: number): void {
  const u = unit(toward[0] - from[0], toward[1] - from[1]);
  P[idx] = [from[0] + u[0] * gap, from[1] + u[1] * gap];
}

export function wire(p: Parent, from: Point | string, to: Point | string, o: ConnOpts = {}): PathOut {
  const F = o.F;
  const a = res(F, p, from);
  const b = res(F, p, to);
  const P: Point[] = [a, ...(o.via ?? []), b];
  const n = P.length;
  if (o.gap0 !== undefined && o.gap0 !== 0) shorten(P, 0, a, at(P, 1), o.gap0);
  if (o.gap1 !== undefined && o.gap1 !== 0) {
    const q = at(P, n - 2);
    const u = unit(b[0] - q[0], b[1] - q[1]);
    P[n - 1] = [b[0] - u[0] * o.gap1, b[1] - u[1] * o.gap1];
  }
  const g = el(p, 'g', { 'data-part': o.part ?? 'wire' });
  path(g, routeD(P, o.radius ?? 3), {
    stroke: o.stroke ?? C.ink,
    width: o.width ?? STYLE.line.normal,
    dash: o.dash,
    cap: o.cap ?? 'butt',
    join: o.join ?? (o.radius === 0 ? 'miter' : 'round'),
    opacity: o.opacity,
    part: 'wire-shaft',
  });
  if (o.dot !== undefined && o.dot !== false) {
    const dots: readonly Point[] = o.dot === true ? [at(P, 0)] : o.dot;
    for (const q of dots) circle(g, q[0], q[1], o.dotR ?? (o.width ?? STYLE.line.normal) * 1.4, { fill: o.stroke ?? C.ink });
  }
  record(F, from, to, o);
  return { node: g, points: P };
}

export type ArrowheadOpts = Loose<{ style: HeadStyle; head: number; headWidth: number; notch: number; stroke: string; width: number }>;

export function arrowhead(p: Parent, tip: Point, dir: Point, o: ArrowheadOpts = {}): Point {
  const [ux, uy] = dir;
  const style = o.style ?? 'fill';
  const L = o.head ?? STYLE.arrow.head;
  const stroke = o.stroke ?? C.ink;
  const w = o.width ?? STYLE.line.normal;
  const nx = -uy;
  const ny = ux;
  if (style === 'fill') {
    const Wd = o.headWidth ?? L * 0.42;
    const notch = o.notch ?? 0.18;
    const bx = tip[0] - ux * L;
    const by = tip[1] - uy * L;
    const pts: Point[] = [[tip[0], tip[1]], [bx + nx * Wd, by + ny * Wd], [tip[0] - ux * L * (1 - notch), tip[1] - uy * L * (1 - notch)], [bx - nx * Wd, by - ny * Wd]];
    polygon(p, pts, { fill: stroke, part: 'arrowhead' });
    return [tip[0] - ux * L * (1 - notch) * 0.9, tip[1] - uy * L * (1 - notch) * 0.9];
  }
  const Wd = o.headWidth ?? (style === 'chevron' ? L : L * 0.5);
  const half = Math.atan2(Wd, L);
  const back = w / 2 / Math.sin(half);
  const t: Point = [tip[0] - ux * back, tip[1] - uy * back];
  const d = `M${f3(t[0] - ux * L + nx * Wd)},${f3(t[1] - uy * L + ny * Wd)} L${f3(t[0])},${f3(t[1])} L${f3(t[0] - ux * L - nx * Wd)},${f3(t[1] - uy * L - ny * Wd)}`;
  path(p, d, { stroke, width: w, join: 'miter', cap: 'butt', part: 'arrowhead' });
  return [t[0] - ux * w * 0.5, t[1] - uy * w * 0.5];
}

function trimEnds(P: Point[], o: ConnOpts): { u0: Point; u1: Point } {
  const n = P.length;
  const gap0 = (o.gap0 ?? 0) + (o.outline0 ?? 0) / 2;
  const gap1 = (o.gap1 ?? 0) + (o.outline ?? 0) / 2;
  const p0 = at(P, 0);
  const p1 = at(P, 1);
  const pm = at(P, n - 2);
  const pn = at(P, n - 1);
  const u0 = unit(p1[0] - p0[0], p1[1] - p0[1]);
  const u1 = unit(pn[0] - pm[0], pn[1] - pm[1]);
  P[0] = [p0[0] + u0[0] * gap0, p0[1] + u0[1] * gap0];
  P[n - 1] = [pn[0] - u1[0] * gap1, pn[1] - u1[1] * gap1];
  return { u0, u1 };
}

function headOf(h: HeadStyle | boolean | number | undefined): HeadStyle | false {
  if (h === false) return false;
  return h === 'open' || h === 'chevron' ? h : 'fill';
}

export function route(p: Parent, points: readonly (Point | string)[], o: ConnOpts = {}): PathOut {
  const F = o.F;
  const P: Point[] = [];
  for (const q of points) P.push(res(F, p, q));
  const n = P.length;
  if (n < 2) throw new Error('cs.route: need at least two points');
  const { u0, u1 } = trimEnds(P, o);
  const g = el(p, 'g', { 'data-part': o.part ?? 'route' });
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.normal;
  const radius = o.radius ?? 0;
  const hs = { head: o.headLength ?? STYLE.arrow.head, headWidth: o.headWidth, notch: o.notch, stroke, width };
  const shaft = el(g, 'g', { 'data-part': 'route-shaft' });
  const heads = el(g, 'g', { 'data-part': 'route-heads' });
  const S = P.slice();
  const hd = headOf(o.head);
  if (hd !== false) S[n - 1] = arrowhead(heads, at(P, n - 1), u1, { ...hs, style: hd });
  if (o.tail !== undefined && o.tail !== false) {
    S[0] = arrowhead(heads, at(P, 0), [-u0[0], -u0[1]], { ...hs, style: o.tail === true ? 'fill' : o.tail });
  }
  path(shaft, routeD(S, radius), { stroke, width, dash: o.dash, cap: 'butt', join: radius !== 0 ? 'round' : 'miter' });
  if (o.opacity !== undefined) g.setAttribute('opacity', String(o.opacity));
  record(F, at(points, 0), at(points, n - 1), o);
  return { node: g, points: P };
}

export function elbow(p: Parent, from: Point | string, to: Point | string, o: ConnOpts = {}): PathOut {
  const a = res(o.F, p, from);
  const b = res(o.F, p, to);
  const vh = o.order === 'vh';
  let raw: Point[];
  if (o.mid !== undefined) raw = vh ? [[a[0], o.mid], [b[0], o.mid]] : [[o.mid, a[1]], [o.mid, b[1]]];
  else raw = vh ? [[a[0], b[1]]] : [[b[0], a[1]]];
  const via: Point[] = [];
  for (const q of raw) {
    if (Math.hypot(q[0] - a[0], q[1] - a[1]) > 1e-3 && Math.hypot(q[0] - b[0], q[1] - b[1]) > 1e-3) via.push(q);
  }
  return route(p, [from, ...via, to], { part: 'elbow', ...o });
}

export function link(p: Parent, from: Point | string, to: Point | string, o: ConnOpts = {}): NodeOut {
  const gap0 = (o.gap0 ?? 0) + (o.outline0 ?? 0) / 2;
  const gap1 = (o.gap1 ?? 0) + (o.outline ?? 0) / 2;
  if (o.head === false) return wire(p, from, to, { ...o, gap0, gap1 });
  if (o.headStyle === 'chevron') {
    const r = route(p, [from, ...(o.via ?? []), to], { ...o, head: 'chevron', headLength: typeof o.head === 'number' ? o.head : o.headLength, radius: o.radius ?? 3 });
    return { node: r.node };
  }
  const g = arrow(p, from, to, { ...toArrow(o), gap0, gap1, F: o.F, noHead: false });
  if (o.relate === true && o.F !== undefined && typeof from === 'string' && typeof to === 'string') o.F.relate(from, to, o.kind ?? 'flow');
  return { node: g };
}
