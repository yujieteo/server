// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { Dash, Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { arrow, circle } from './draw.ts';
import { at } from './util.ts';
import { record, res } from './cs-base.ts';
import type { BadgeAt, BadgeKind, BoxOut } from './cs-box.ts';
import { box } from './cs-box.ts';
import type { ConnOpts, HeadStyle } from './cs-conn.ts';
import { link, route, toArrow, wire } from './cs-conn.ts';

const C = STYLE.color;

export type StackItem = Loose<{
  name: string;
  label: string;
  h: number;
  w: number;
  dx: number;
  fill: string;
  stroke: string;
  width: number;
  r: number;
  pill: boolean;
  dash: Dash;
  size: number;
  color: string;
  family: string;
  lineGap: number;
  fit: boolean | number;
  badge: BadgeKind;
  badgeAt: BadgeAt;
  badgeSize: number;
  badgeColor: string;
  gap: number;
  link: 'auto' | 'arrow' | 'wire' | false;
  linkWidth: number;
}>;

export type StackOpts = Loose<{
  part: string;
  dir: 'up' | 'down';
  align: 'center' | 'left' | 'right';
  gap: number;
  fill: string;
  r: number;
  stroke: string;
  width: number;
  size: number;
  color: string;
  family: string;
  lineGap: number;
  fit: boolean | number;
  badge: BadgeKind;
  badgeAt: BadgeAt;
  badgeSize: number;
  badgeColor: string;
  link: 'auto' | 'arrow' | 'wire' | false;
  linkWidth: number;
  linkStroke: string;
  arrow: Loose<{ head: number; headWidth: number; notch: number }>;
  relate: boolean;
  F: Figure;
}>;

export interface StackBox {
  x: number;
  y: number;
  w: number;
  h: number;
  ports: Ports;
  width: number;
}

export interface StackOut {
  node: SVGGElement;
  boxes: Record<string, StackBox>;
  list: StackBox[];
  top: number;
  bottom: number;
  cx: number;
}

function stackBoxAt(boxes: SVGGElement, it: StackItem, o: StackOpts, bx: number, by: number, bw: number, h: number, iw: number): BoxOut {
  return box(boxes, bx, by, bw, h, {
    label: it.label,
    fill: it.fill ?? o.fill ?? C.tintBlue,
    stroke: it.stroke ?? o.stroke ?? C.ink,
    width: iw,
    r: it.r ?? o.r ?? 1.6,
    pill: it.pill,
    dash: it.dash,
    size: it.size ?? o.size,
    color: it.color ?? o.color ?? C.text,
    family: it.family ?? o.family,
    lineGap: it.lineGap ?? o.lineGap,
    fit: it.fit ?? o.fit,
    badge: it.badge ?? o.badge,
    badgeAt: it.badgeAt ?? o.badgeAt,
    badgeSize: it.badgeSize ?? o.badgeSize,
    badgeColor: it.badgeColor ?? o.badgeColor,
    F: o.F,
    name: it.name,
    part: 'stack-box',
  });
}

function stackLink(links: SVGGElement, o: StackOpts, up: boolean, kind: 'auto' | 'arrow' | 'wire', pi: StackItem, it: StackItem, prev: StackBox, b: StackBox): void {
  const lx = (Math.max(prev.x, b.x) + Math.min(prev.x + prev.w, b.x + b.w)) / 2;
  const a: Point = [lx, up ? prev.y : prev.y + prev.h];
  const t: Point = [lx, up ? b.y + b.h : b.y];
  const gapLen = Math.abs(t[1] - a[1]) - (prev.width + b.width) / 2;
  const lw = pi.linkWidth ?? o.linkWidth ?? STYLE.line.normal;
  const ls = o.linkStroke ?? o.stroke ?? C.ink;
  const head = o.arrow?.head ?? STYLE.arrow.head;
  const useArrow = kind === 'arrow' || (kind === 'auto' && gapLen > head * 1.6);
  const named = pi.name !== undefined && pi.name !== '' && it.name !== undefined && it.name !== '';
  const relFrom = named ? `${pi.name}.${up ? 'top' : 'bottom'}` : undefined;
  const relTo = named ? `${it.name}.${up ? 'bottom' : 'top'}` : undefined;
  if (useArrow) {
    link(links, a, t, { outline: b.width, outline0: prev.width, width: lw, stroke: ls, ...o.arrow });
    if (o.F !== undefined && relFrom !== undefined && relTo !== undefined) {
      o.F.drawn.push({ from: relFrom, to: relTo, kind: 'flow' });
      if (o.relate === true) o.F.relate(relFrom, relTo, 'flow');
    }
  } else wire(links, a, t, { width: lw, stroke: ls, gap0: prev.width / 2, gap1: b.width / 2, F: o.F, relate: o.relate, relFrom, relTo });
}

export function blockStack(p: Parent, cx: number, y: number, w: number, items: readonly StackItem[], o: StackOpts = {}): StackOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'block-stack' });
  const links = el(g, 'g', { 'data-part': 'stack-links' });
  const boxes = el(g, 'g', { 'data-part': 'stack-boxes' });
  const up = (o.dir ?? 'up') === 'up';
  const align = o.align ?? 'center';
  const out: Record<string, StackBox> = {};
  const order: StackBox[] = [];
  let cur = y;
  for (let i = 0; i < items.length; i++) {
    const it = at(items, i);
    const h = it.h ?? 16;
    const bw = it.w ?? w;
    const by = up ? cur - h : cur;
    const iw = it.width ?? o.width ?? STYLE.line.normal;
    const bx = (align === 'left' ? cx - w / 2 : align === 'right' ? cx + w / 2 - bw : cx - bw / 2) + (it.dx ?? 0);
    const B = stackBoxAt(boxes, it, o, bx, by, bw, h, iw);
    const b: StackBox = { x: bx, y: by, w: bw, h, ports: B.ports, width: iw };
    if (it.name !== undefined && it.name !== '') out[it.name] = b;
    order.push(b);
    cur = up ? by - (it.gap ?? o.gap ?? 8) : by + h + (it.gap ?? o.gap ?? 8);
    if (i === 0) continue;
    const pi = at(items, i - 1);
    const kind = pi.link ?? o.link ?? 'auto';
    if (kind !== false) stackLink(links, o, up, kind, pi, it, at(order, i - 1), b);
  }
  const first = at(order, 0);
  const last = at(order, order.length - 1);
  return { node: g, boxes: out, list: order, top: up ? last.y : first.y, bottom: up ? y : last.y + last.h, cx };
}

export function residual(p: Parent, from: Point | string, to: Point | string, o: ConnOpts = {}): { node: SVGGElement; railX: number } {
  const F = o.F;
  const a = res(F, p, from);
  const b = res(F, p, to);
  const side = o.side ?? (b[0] <= a[0] ? 'left' : 'right');
  const rx = o.railX ?? b[0] + (side === 'left' ? -1 : 1) * (o.rail ?? 8);
  const via: Point[] = [[rx, a[1]], [rx, b[1]]];
  const g = el(p, 'g', { 'data-part': o.part ?? 'residual' });
  if (o.headStyle === 'chevron') {
    route(g, [a, ...via, b], { ...o, F: undefined, relate: false, head: 'chevron', headLength: typeof o.head === 'number' ? o.head : o.headLength, radius: o.radius ?? 3 });
  } else arrow(g, a, b, { ...toArrow({ ...o, via }, 3), gap1: (o.gap1 ?? 0) + (o.outline ?? 0) / 2 });
  if (o.dot !== undefined && o.dot !== false) circle(g, a[0], a[1], o.dotR ?? (o.width ?? STYLE.line.normal) * 1.5, { fill: o.stroke ?? C.ink });
  record(F, from, to, { kind: 'residual', ...o });
  return { node: g, railX: rx };
}

export function fork(p: Parent, from: Point | string, targets: readonly (Point | string)[], o: ConnOpts = {}): { node: SVGGElement } {
  const F = o.F;
  const a = res(F, p, from);
  const g = el(p, 'g', { 'data-part': o.part ?? 'fork' });
  const vh = o.order === 'vh';
  for (const t0 of targets) {
    const t = res(F, p, t0);
    const straight = vh ? Math.abs(t[1] - a[1]) < 0.01 : Math.abs(t[0] - a[0]) < 0.01;
    const bend: Point = vh ? [a[0], t[1]] : [t[0], a[1]];
    const via: Point[] = straight ? [] : [bend];
    arrow(g, a, t, { ...toArrow({ ...o, via }, 3), gap1: (o.gap1 ?? 0) + (o.outline ?? 0) / 2 });
    record(F, from, t0, o);
  }
  if (o.dot !== undefined && o.dot !== false) circle(g, a[0], a[1], o.dotR ?? (o.width ?? STYLE.line.normal) * 1.5, { fill: o.stroke ?? C.ink });
  return { node: g };
}

export type BusTap = { y: number; to: number } & Loose<{ rails: readonly number[]; head: HeadStyle | boolean; relTo: string }>;
export type BusRail = Loose<{ dx: number; stroke: string; width: number; dash: Dash; tapDy: number; y0: number; y1: number }>;
export type BusOpts = Loose<{
  part: string;
  rails: readonly BusRail[];
  y1: number;
  dir: 'v' | 'h';
  head: HeadStyle | boolean;
  headLength: number;
  headWidth: number;
  stroke: string;
  width: number;
  F: Figure;
  relFrom: string;
  kind: string;
  relate: boolean;
}>;

function busPt(h: boolean, u: number, v: number): Point {
  return h ? [v, u] : [u, v];
}

function busTaps(taps: readonly BusTap[], k: number): BusTap[] {
  const mine: BusTap[] = [];
  for (const t of taps) {
    if (t.rails === undefined || t.rails.includes(k)) mine.push(t);
  }
  return mine;
}

function busRail(g: SVGGElement, taps: readonly BusTap[], o: BusOpts, rl: BusRail, k: number, x: number, y0: number): void {
  const H = o.dir === 'h';
  const rx = x + (rl.dx ?? 0);
  const w = rl.width ?? o.width ?? STYLE.line.normal;
  const st: ConnOpts = { stroke: rl.stroke ?? o.stroke ?? C.ink, width: w, dash: rl.dash, radius: 0, cap: 'butt' };
  const mine = busTaps(taps, k);
  const r0 = rl.y0 ?? y0;
  let far = r0;
  for (const t of mine) {
    const ty = t.y + (rl.tapDy ?? 0);
    if (Math.abs(ty - r0) > Math.abs(far - r0)) far = ty;
  }
  const yEnd = rl.y1 ?? o.y1 ?? far;
  if (Math.abs(yEnd - r0) > 1e-3) wire(g, busPt(H, rx, r0), busPt(H, rx, yEnd), st);
  for (const t of mine) {
    const ty = t.y + (rl.tapDy ?? 0);
    const s0 = Math.sign(t.to - rx);
    const sg = s0 === 0 || Number.isNaN(s0) ? 1 : s0;
    const hd = t.head ?? o.head ?? false;
    const from = busPt(H, rx - (sg * w) / 2, ty);
    if (hd !== false) route(g, [from, busPt(H, t.to, ty)], { ...st, head: hd, headLength: o.headLength, headWidth: o.headWidth });
    else wire(g, from, busPt(H, t.to, ty), st);
    if (o.F !== undefined && o.relFrom !== undefined && o.relFrom !== '' && t.relTo !== undefined && t.relTo !== '' && k === 0) {
      record(o.F, o.relFrom, t.relTo, { kind: o.kind ?? 'condition', relate: o.relate });
    }
  }
}

export function bus(p: Parent, x: number, y0: number, taps: readonly BusTap[], o: BusOpts = {}): { node: SVGGElement; rails: number[] } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'bus' });
  const rails: readonly BusRail[] = o.rails ?? [{ dx: 0 }];
  const xs: number[] = [];
  for (let k = 0; k < rails.length; k++) {
    const rl = at(rails, k);
    busRail(g, taps, o, rl, k, x, y0);
    xs.push(x + (rl.dx ?? 0));
  }
  return { node: g, rails: xs };
}
