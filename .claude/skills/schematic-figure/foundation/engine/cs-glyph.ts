// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { Dash, Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, rect } from './draw.ts';
import { f3 } from './util.ts';
import { polyD, reg } from './cs-base.ts';

const C = STYLE.color;

export type OpNodeOpts = Loose<{
  part: string;
  op: string;
  opScale: number;
  fill: string;
  stroke: string;
  width: number;
  opWidth: number;
  size: number;
  family: string;
  F: Figure;
  name: string;
}>;

const OP_ALIAS: Record<string, string> = { '⊕': '+', '⊗': '×', concat: '∥', '||': '∥', '-': '−' };

function opOf(op: string | undefined): string {
  if (op === undefined) return '+';
  return OP_ALIAS[op] ?? op;
}

function opMark(g: SVGGElement, op: string, cx: number, cy: number, r: number, stroke: string, ow: number, o: OpNodeOpts): void {
  const a = r * (o.opScale ?? 0.62);
  const s = { stroke, width: ow, cap: 'butt' };
  if (op === '+') {
    line(g, [cx - a, cy], [cx + a, cy], s);
    line(g, [cx, cy - a], [cx, cy + a], s);
  } else if (op === '×') {
    const b = a * 0.72;
    line(g, [cx - b, cy - b], [cx + b, cy + b], s);
    line(g, [cx - b, cy + b], [cx + b, cy - b], s);
  } else if (op === '−') line(g, [cx - a, cy], [cx + a, cy], s);
  else if (op === '⊙' || op === '·') circle(g, cx, cy, r * 0.2, { fill: stroke });
  else if (op === '∥') {
    line(g, [cx - a * 0.35, cy - a], [cx - a * 0.35, cy + a], s);
    line(g, [cx + a * 0.35, cy - a], [cx + a * 0.35, cy + a], s);
  } else text(g, cx, cy, op, { anchor: 'middle', valign: 'middle', size: o.size ?? Math.max(STYLE.text.min, r * 1.2), color: stroke, family: o.family });
}

function circlePorts(cx: number, cy: number, r: number): Ports {
  return { top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy], center: [cx, cy] };
}

export function opNode(p: Parent, cx: number, cy: number, r: number, o: OpNodeOpts = {}): { node: SVGGElement; ports: Ports } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'op-node' });
  const stroke = o.stroke ?? C.ink;
  const w = o.width ?? STYLE.line.normal;
  circle(g, cx, cy, r, { fill: o.fill ?? C.paper, stroke, width: w });
  opMark(g, opOf(o.op), cx, cy, r, stroke, o.opWidth ?? w * 0.9, o);
  return { node: g, ports: reg(o.F, o.name, p, circlePorts(cx, cy, r)) };
}

export type SineGlyphOpts = Loose<{
  part: string;
  lobes: 'sine' | 'arc';
  amp: number;
  span: number;
  phase: number;
  fill: string;
  stroke: string;
  width: number;
  F: Figure;
  name: string;
}>;

function sineD(cx: number, cy: number, r: number, o: SineGlyphOpts, ph: number): string {
  if ((o.lobes ?? 'sine') === 'arc') {
    const h = r / 2;
    const sw0 = ph > 0 ? 1 : 0;
    const sw1 = ph > 0 ? 0 : 1;
    return `M${f3(cx - r)},${f3(cy)} A${f3(h)},${f3(h)} 0 0 ${sw0} ${f3(cx)},${f3(cy)} A${f3(h)},${f3(h)} 0 0 ${sw1} ${f3(cx + r)},${f3(cy)}`;
  }
  const amp = (o.amp ?? 0.4) * r;
  const span = r * (o.span ?? 1);
  const n = 48;
  const P: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    P.push([cx - span + 2 * span * t, cy - ph * amp * Math.sin(2 * Math.PI * t)]);
  }
  return polyD(P);
}

export function sineGlyph(p: Parent, cx: number, cy: number, r: number, o: SineGlyphOpts = {}): { node: SVGGElement; ports: Ports } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'sine-glyph' });
  const stroke = o.stroke ?? C.ink;
  const w = o.width ?? STYLE.line.normal;
  circle(g, cx, cy, r, { fill: o.fill ?? C.paper, stroke, width: w });
  path(g, sineD(cx, cy, r, o, o.phase ?? 1), { stroke, width: w, part: 'sine-curve' });
  return { node: g, ports: reg(o.F, o.name, p, circlePorts(cx, cy, r)) };
}

export type EllipsisOpts = Loose<{ part: string; n: number; r: number; gap: number; dir: 'h' | 'v' | 'd'; fill: string }>;

export function ellipsis(p: Parent, cx: number, cy: number, o: EllipsisOpts = {}): { node: SVGGElement } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'ellipsis' });
  const n = o.n ?? 3;
  const r = o.r ?? 0.6;
  const gap = o.gap ?? r * 3.4;
  const dir = o.dir ?? 'h';
  const ux = dir === 'v' ? 0 : dir === 'd' ? Math.SQRT1_2 : 1;
  const uy = dir === 'v' ? 1 : dir === 'd' ? Math.SQRT1_2 : 0;
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * gap;
    circle(g, cx + ux * t, cy + uy * t, r, { fill: o.fill ?? C.ink });
  }
  return { node: g };
}

export type RepeatFrameOpts = Loose<{
  part: string;
  label: string | false;
  labelSide: 'left' | 'right';
  labelAt: number;
  labelGap: number;
  size: number;
  color: string;
  family: string;
  r: number;
  fill: string;
  stroke: string;
  width: number;
  dash: Dash;
  F: Figure;
  name: string;
}>;

export function repeatFrame(p: Parent, x: number, y: number, w: number, h: number, o: RepeatFrameOpts = {}): { node: SVGGElement; ports: Ports; x: number; y: number; w: number; h: number } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'repeat-frame' });
  rect(g, x, y, w, h, { r: o.r ?? 4, fill: o.fill ?? C.tintGrey, stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash });
  const side = o.labelSide ?? 'left';
  const ly = y + h * (o.labelAt ?? 0.5);
  const gap = o.labelGap ?? 3;
  const lx = side === 'left' ? x - gap : x + w + gap;
  if (o.label !== false) {
    text(g, lx, ly, o.label ?? 'N×', { anchor: side === 'left' ? 'end' : 'start', valign: 'middle', size: o.size ?? STYLE.text.title, color: o.color ?? C.text, family: o.family });
  }
  const ports = reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], label: [lx, ly] });
  return { node: g, ports, x, y, w, h };
}
