// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { Dash, Figure, Loose, Parent, Point, Ports, TextOpts } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { rect } from './draw.ts';
import { reg, fitText } from './cs-base.ts';
import { flame, lock, snowflake } from './cs-badge.ts';

const C = STYLE.color;

export type BadgeKind = 'lock' | 'snowflake' | 'flame';
export type BadgeAt = 'right' | 'left' | 'tr' | 'tl' | 'center' | Point;

export type BoxOpts = Loose<{
  part: string;
  label: string;
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
  weight: string | number;
  fit: boolean | number;
  labelAt: Point;
  labelAnchor: 'start' | 'middle' | 'end';
  badge: BadgeKind;
  badgeAt: BadgeAt;
  badgeSize: number;
  badgeColor: string;
  badgeOpen: boolean;
  F: Figure;
  name: string;
}>;

export interface BoxOut {
  node: SVGGElement;
  ports: Ports;
  x: number;
  y: number;
  w: number;
  h: number;
  label: SVGTextElement | null;
}

function fitPad(fit: boolean | number | undefined, r: number): number {
  if (fit === true) return Math.max(1.5, r * 0.6);
  return typeof fit === 'number' ? fit : 0;
}

function fitOn(fit: boolean | number | undefined): boolean {
  return fit !== undefined && fit !== false && fit !== 0;
}

function sideRoom(o: BoxOpts, h: number): number {
  if (o.badge === undefined) return 0;
  const at = o.badgeAt ?? 'right';
  if (at !== 'right' && at !== 'left') return 0;
  return (o.badgeSize ?? Math.min(h * 0.32, 6)) * 1.7;
}

function boxLabel(g: SVGGElement, x: number, y: number, w: number, h: number, r: number, label: string, o: BoxOpts): SVGTextElement {
  const [fx, fy] = o.labelAt ?? [0.5, 0.5];
  const lx = x + w * fx;
  const ly = y + h * fy;
  const anchor = o.labelAnchor ?? (fx < 0.2 ? 'start' : fx > 0.8 ? 'end' : 'middle');
  const pad = fitPad(o.fit, r);
  const st: TextOpts = { anchor, valign: 'middle', size: o.size, color: o.color ?? C.text, family: o.family, lineGap: o.lineGap, weight: o.weight };
  const side = sideRoom(o, h);
  const mid = anchor === 'middle';
  const span = mid ? 2 * Math.min(lx - x, x + w - lx) - 2 * pad : anchor === 'start' ? x + w - lx - pad : lx - x - pad;
  const room = -side * (mid ? 2 : 1) + span;
  return fitOn(o.fit) ? fitText(g, lx, ly, label, room, st) : text(g, lx, ly, label, st);
}

function badgePos(at: BadgeAt, x: number, y: number, w: number, h: number, bs: number): Point {
  if (typeof at !== 'string') return [x + w * at[0], y + h * at[1]];
  if (at === 'right') return [x + w - bs * 0.95, y + h / 2];
  if (at === 'left') return [x + bs * 0.95, y + h / 2];
  if (at === 'tr') return [x + w - bs * 0.3, y + bs * 0.2];
  if (at === 'tl') return [x + bs * 0.3, y + bs * 0.2];
  return [x + w / 2, y + h / 2];
}

function boxBadge(g: SVGGElement, kind: BadgeKind, x: number, y: number, w: number, h: number, o: BoxOpts): void {
  const bs = o.badgeSize ?? Math.min(h * 0.32, 6);
  const pos = badgePos(o.badgeAt ?? 'right', x, y, w, h, bs);
  if (kind === 'lock') lock(g, pos[0], pos[1], bs, { color: o.badgeColor, open: o.badgeOpen });
  else if (kind === 'snowflake') snowflake(g, pos[0], pos[1], bs, { color: o.badgeColor });
  else flame(g, pos[0], pos[1], bs, { color: o.badgeColor });
}

export function box(p: Parent, x: number, y: number, w: number, h: number, o: BoxOpts = {}): BoxOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'box' });
  const r = o.pill === true ? Math.min(w, h) / 2 : (o.r ?? 1.6);
  rect(g, x, y, w, h, { r, fill: o.fill ?? C.tintBlue, stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash, part: 'box-outline' });
  const label = o.label !== undefined && o.label !== '' ? boxLabel(g, x, y, w, h, r, o.label, o) : null;
  if (o.badge !== undefined) boxBadge(g, o.badge, x, y, w, h, o);
  const ports = reg(o.F, o.name, p, {
    top: [x + w / 2, y], bottom: [x + w / 2, y + h], left: [x, y + h / 2], right: [x + w, y + h / 2], center: [x + w / 2, y + h / 2],
    tl: [x, y], tr: [x + w, y], bl: [x, y + h], br: [x + w, y + h],
  });
  return { node: g, ports, x, y, w, h, label };
}

export function pill(p: Parent, x: number, y: number, w: number, h: number, o: BoxOpts = {}): BoxOut {
  return box(p, x, y, w, h, { fill: C.paper, part: 'pill', ...o, pill: true });
}
