// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, rect, smooth } from './draw.ts';
import { C, DIRS, INK, PAPER, d, defsOf, nextUid, offsetPoints } from './ind-base.ts';
import type { Dir } from './ind-base.ts';

type Side = 'top' | 'bottom' | 'left' | 'right';
type Targets = readonly [Point, Point];

export type CalloutBoxOpts = Loose<{
  to: Point | Targets; notch: number; side: Side; at: number; stroke: string; width: number; fill: string;
  size: number; color: string; family: string;
}>;

function wedgePoints(side: Side, x: number, y: number, w: number, h: number, A: number, B: number): Point[] {
  const X0 = x;
  const X1 = x + w;
  const Y0 = y;
  const Y1 = y + h;
  if (side === 'top') return [[X0 + B, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0], [X0 + A, Y0]];
  if (side === 'bottom') return [[X0 + A, Y1], [X0, Y1], [X0, Y0], [X1, Y0], [X1, Y1], [X0 + B, Y1]];
  if (side === 'left') return [[X0, Y0 + A], [X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0 + B]];
  return [[X1, Y0 + B], [X1, Y1], [X0, Y1], [X0, Y0], [X1, Y0], [X1, Y0 + A]];
}

function isPoint(v: Point | Targets): v is Point {
  return typeof v[0] === 'number';
}

function targetsOf(to: Point | Targets): Targets {
  return isPoint(to) ? [to, to] : to;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function openedBox(g: Parent, b: Box, T: Targets, o: CalloutBoxOpts, stroke: string, width: number): void {
  const { x, y, w, h } = b;
  const tx = (T[0][0] + T[1][0]) / 2;
  const ty = (T[0][1] + T[1][1]) / 2;
  const side: Side = o.side ?? (ty > y + h ? 'bottom' : ty < y ? 'top' : tx < x ? 'left' : 'right');
  const horiz = side === 'top' || side === 'bottom';
  const Ls = horiz ? w : h;
  const nt = Math.min(o.notch ?? Math.min(Ls * 0.3, 8), Ls * 0.8);
  const s = Math.max(nt / 2 + 1, Math.min(Ls - nt / 2 - 1, o.at ?? (horiz ? tx - x : ty - y)));
  const pts = wedgePoints(side, x, y, w, h, s - nt / 2, s + nt / 2);
  path(g, d(pts), { stroke, width, join: 'miter', cap: 'butt' });
  const first = pts[0] ?? [x, y];
  const last = pts[pts.length - 1] ?? [x, y];
  const lowFirst = side === 'top' || side === 'left';
  const lo = lowFirst ? last : first;
  const hi = lowFirst ? first : last;
  const k = horiz ? 0 : 1;
  const ordered: Targets = T[0][k] <= T[1][k] ? [T[0], T[1]] : [T[1], T[0]];
  line(g, lo, ordered[0], { stroke, width, cap: 'butt' });
  line(g, hi, ordered[1], { stroke, width, cap: 'butt' });
}

export function calloutBox(p: Parent, x: number, y: number, w: number, h: number, str: string, o: CalloutBoxOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'callout-box' });
  const stroke = o.stroke ?? C.sky;
  const width = o.width ?? STYLE.line.thin * 1.2;
  rect(g, x, y, w, h, { fill: o.fill ?? PAPER });
  if (o.to === undefined) rect(g, x, y, w, h, { stroke, width, join: 'miter' });
  else openedBox(g, { x, y, w, h }, targetsOf(o.to), o, stroke, width);
  if (str !== '') text(g, x + w / 2, y + h / 2, str, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.color ?? C.text, family: o.family });
  return g;
}

export type PinLabelOpts = Loose<{
  len: number; dir: Dir; dot: 'target' | 'label' | 'none'; dotR: number; size: number; gap: number; color: string; width: number;
  textColor: string; family: string;
}>;

export function pinLabel(p: Parent, x: number, y: number, str: string, o: PinLabelOpts = {}): SVGGElement {
  const [dx, dy] = DIRS[o.dir ?? 'up'];
  const len = o.len ?? 6;
  const size = o.size ?? STYLE.text.small;
  const color = o.color ?? INK;
  const gap = o.gap ?? size * 0.3;
  const g = el(p, 'g', { 'data-part': 'pin-label' });
  const ex = x + dx * len;
  const ey = y + dy * len;
  line(g, [x, y], [ex, ey], { stroke: color, width: o.width ?? STYLE.line.thin, cap: 'butt' });
  const dot = o.dot ?? 'target';
  const R = o.dotR ?? 0.7;
  if (dot === 'target') circle(g, x, y, R, { fill: color });
  else if (dot === 'label') circle(g, ex, ey, R, { fill: color });
  text(g, ex + dx * gap, ey + dy * gap, str, {
    size, family: o.family, color: o.textColor ?? C.text,
    anchor: dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle', valign: dy < 0 ? 'bottom' : dy > 0 ? 'top' : 'middle',
  });
  return g;
}

export type TextOnPathOpts = Loose<{
  smooth: boolean; at: number; anchor: 'start' | 'middle' | 'end'; dy: number; reverse: boolean; size: number; color: string;
  weight: string | number; family: string; letterSpacing: number | string;
}>;

export function textOnPath(p: Parent, pts: readonly Point[], str: string, o: TextOnPathOpts = {}): SVGTextElement {
  let P: readonly Point[] = o.reverse === true ? pts.toReversed() : pts;
  if (o.dy !== undefined && o.dy !== 0) P = offsetPoints(P, o.dy);
  const id = `indtp${nextUid()}`;
  el(defsOf(p), 'path', { id, d: o.smooth === true ? smooth(P, false, 0.5) : d(P) });
  const size = o.size ?? STYLE.text.label;
  const t = el(p, 'text', {
    'font-family': o.family ?? STYLE.font.family, 'font-size': size, fill: o.color ?? C.text, 'font-weight': o.weight ?? 'normal',
    'data-role': 'label', 'data-rotate': 1, 'letter-spacing': o.letterSpacing,
  });
  el(t, 'textPath', { href: `#${id}`, startOffset: `${(o.at ?? 0.5) * 100}%`, 'text-anchor': o.anchor ?? 'middle' }, str);
  return t;
}
