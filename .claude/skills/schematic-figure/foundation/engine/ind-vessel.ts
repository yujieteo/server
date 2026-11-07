// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, GradientStop, Loose, Parent, Point, Ports } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, clipPath, line, linearGradient, path, rect } from './draw.ts';
import { f3 } from './util.ts';
import { C, INK, PAPER, d, reg } from './ind-base.ts';
import type { Part } from './ind-base.ts';

export type TapOpts = Loose<{ side: 'right' | 'left'; len: number; tick: number; sep: number; stroke: string; width: number; F: Figure; name: string }>;

export interface TapResult {
  node: SVGGElement;
  end: Point;
}

export function tap(p: Parent, x: number, y: number, o: TapOpts = {}): TapResult {
  const s = o.side === 'left' ? -1 : 1;
  const tick = o.tick ?? 3.4;
  const sep = o.sep ?? 1.8;
  const len = o.len ?? 6;
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const g = el(p, 'g', { 'data-part': 'tap' });
  for (const k of [-1, 1]) line(g, [x - tick / 2, y + (k * sep) / 2], [x + tick / 2, y + (k * sep) / 2], { stroke, width: width * 0.8, cap: 'butt' });
  line(g, [x + (s * tick) / 2, y], [x + s * len, y], { stroke, width: width * 0.9, cap: 'butt' });
  const end: Point = [x + s * len, y];
  if (o.F !== undefined && o.name !== undefined && o.name !== '') o.F.anchor(o.name, g, end[0], end[1]);
  return { node: g, end };
}

export interface ColumnFill {
  from?: number | undefined;
  to?: number | undefined;
  color?: string | undefined;
}

export type ColumnTap = number | { at: number; side?: 'left' | 'right' | undefined; len?: number | undefined };

export type ColumnOpts = Loose<{
  stroke: string;
  width: number;
  flanges: readonly number[];
  flangeExt: number;
  flangeGap: number;
  fill: ColumnFill;
  packing: 'none' | 'dots' | 'rings';
  grain: number;
  grid: number;
  taps: readonly ColumnTap[];
  tapSide: 'left' | 'right';
  tapLen: number;
  label: string;
  labelSize: number;
  labelWeight: string | number;
  labelColor: string;
  labelRotate: number;
  family: string;
  F: Figure;
  name: string;
}>;

export interface ColumnResult extends Part {
  taps: Point[];
}

interface Lehmer {
  s: number;
}

function lehmerNext(r: Lehmer): number {
  r.s = (r.s * 16807) % 2147483647;
  return r.s / 2147483647;
}

function scatterGrains(g: Parent, x: number, w: number, y0: number, y1: number, o: ColumnOpts, stroke: string): void {
  const pk = o.packing ?? 'none';
  if (pk === 'none') return;
  const rnd: Lehmer = { s: 7 };
  const r0 = o.grain ?? 0.9;
  const n = Math.round((w * (y1 - y0)) / (r0 * r0 * 9));
  for (let i = 0; i < n; i++) {
    const cx = x + r0 + lehmerNext(rnd) * (w - 2 * r0);
    const cy = y0 + r0 + lehmerNext(rnd) * (y1 - y0 - 2 * r0);
    if (pk === 'rings') circle(g, cx, cy, r0, { stroke, width: STYLE.line.hair });
    else circle(g, cx, cy, r0 * (0.6 + 0.5 * lehmerNext(rnd)), { fill: C.mid });
  }
}

function drawColumnTaps(g: Parent, x: number, yTop: number, w: number, h: number, o: ColumnOpts, stroke: string): Point[] {
  const out: Point[] = [];
  const list = o.taps ?? [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t === undefined) continue;
    const q = typeof t === 'number' ? { at: t, side: undefined, len: undefined } : t;
    const side = q.side ?? o.tapSide ?? 'right';
    const name = o.F !== undefined && o.name !== undefined && o.name !== '' ? `${o.name}.tap${i + 1}` : undefined;
    out.push(tap(g, side === 'left' ? x : x + w, yTop + q.at * h, { side, len: q.len ?? o.tapLen, stroke, F: o.F, name }).end);
  }
  return out;
}

export function column(p: Parent, x: number, yTop: number, w: number, h: number, o: ColumnOpts = {}): ColumnResult {
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.3;
  const g = el(p, 'g', { 'data-part': 'column' });
  const fl = o.fill;
  if (fl !== undefined) {
    const y0 = yTop + (fl.from ?? 0) * h;
    const y1 = yTop + (fl.to ?? 1) * h;
    rect(g, x, y0, w, y1 - y0, { fill: fl.color ?? C.light });
    scatterGrains(g, x, w, y0, y1, o, stroke);
  }
  line(g, [x, yTop], [x, yTop + h], { stroke, width, cap: 'butt' });
  line(g, [x + w, yTop], [x + w, yTop + h], { stroke, width, cap: 'butt' });
  const ext = o.flangeExt ?? 3;
  const gap = o.flangeGap ?? 1.2;
  for (const f of o.flanges ?? [0, 1]) {
    const y = yTop + f * h;
    const s = f >= 1 ? 1 : -1;
    for (const k of [0, s * gap]) line(g, [x - ext, y + k], [x + w + ext, y + k], { stroke, width, cap: 'butt' });
  }
  if (o.grid !== undefined) line(g, [x, yTop + o.grid * h], [x + w, yTop + o.grid * h], { stroke, width, dash: [2, 1], cap: 'butt' });
  if (o.label !== undefined && o.label !== '') {
    text(g, x + w / 2, yTop + (((fl?.from ?? 0) + (fl?.to ?? 1)) / 2) * h, o.label, { anchor: 'middle', valign: 'middle', size: o.labelSize, weight: o.labelWeight ?? 'bold', color: o.labelColor ?? (fl !== undefined ? PAPER : C.text), rotate: o.labelRotate ?? -90, family: o.family });
  }
  const taps = drawColumnTaps(g, x, yTop, w, h, o, stroke);
  const ports = reg(o.F, o.name, g, { top: [x + w / 2, yTop], bottom: [x + w / 2, yTop + h], left: [x, yTop + h / 2], right: [x + w, yTop + h / 2], center: [x + w / 2, yTop + h / 2] });
  return { node: g, ports, taps };
}

export type VesselShape = 'hopper' | 'tank' | 'drum' | 'capsule' | 'pill' | 'cyclone';

export type VesselOpts = Loose<{
  shape: VesselShape;
  w: number;
  h: number;
  cone: number;
  neckW: number;
  neckL: number;
  tubeL: number;
  inletL: number;
  level: number;
  levelColor: string;
  fill: string;
  gradient: readonly GradientStop[];
  label: string;
  labelSize: number;
  labelColor: string;
  labelWeight: string | number;
  labelRotate: number;
  family: string;
  stroke: string;
  width: number;
  F: Figure;
  name: string;
}>;

interface Shell {
  g: SVGGElement;
  cx: number;
  yTop: number;
  w: number;
  h: number;
  x0: number;
  x1: number;
  fill: string;
  stroke: string;
  width: number;
}

interface Outline {
  outline: string;
  ports: Ports;
}

function capsuleOrPill(s: Shell, shape: VesselShape): Outline {
  const { g, cx, yTop, w, h, x0, x1, fill, stroke, width } = s;
  const yb = yTop + h;
  const r = Math.min(h / 2, w / 2);
  const R = `A${f3(r)},${f3(r)} 0 0 1`;
  const outline = shape === 'capsule'
    ? `M${f3(x0)},${f3(yTop + r)} ${R} ${f3(x1)},${f3(yTop + r)} L${f3(x1)},${f3(yb - r)} ${R} ${f3(x0)},${f3(yb - r)}Z`
    : `M${f3(x0 + r)},${f3(yTop)} L${f3(x1 - r)},${f3(yTop)} ${R} ${f3(x1 - r)},${f3(yb)} L${f3(x0 + r)},${f3(yb)} ${R} ${f3(x0 + r)},${f3(yTop)}Z`;
  path(g, outline, { fill, stroke, width });
  return { outline, ports: { top: [cx, yTop], bottom: [cx, yb], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] } };
}

function cycloneShape(s: Shell, o: VesselOpts): Outline {
  const { g, cx, yTop, w, h, x0, x1, fill, stroke, width } = s;
  const cone = o.cone ?? w * 1.2;
  const n = (o.neckW ?? w * 0.22) / 2;
  const nl = o.neckL ?? 3;
  const yc = yTop + h;
  const yn = yc + cone;
  const tw = w * 0.18;
  const tl = o.tubeL ?? 4;
  const outline = d([[x0, yTop], [x1, yTop], [x1, yc], [cx + n, yn], [cx - n, yn], [x0, yc]]) + 'Z';
  path(g, outline, { fill, stroke, width, join: 'miter' });
  line(g, [x0, yc], [x1, yc], { stroke, width: width * 0.6, cap: 'butt' });
  for (const k of [-1, 1]) {
    line(g, [cx + k * tw, yTop - tl], [cx + k * tw, yTop + h * 0.55], { stroke, width: width * 0.8, cap: 'butt' });
    line(g, [cx + k * n, yn], [cx + k * n, yn + nl], { stroke, width: width * 0.8, cap: 'butt' });
  }
  const ih = Math.min(h * 0.3, w * 0.3);
  const il = o.inletL ?? w * 0.35;
  rect(g, x0 - il, yTop, il, ih, { fill, stroke, width, join: 'miter' });
  return { outline, ports: { top: [cx, yTop - tl], bottom: [cx, yn + nl], inlet: [x0 - il, yTop + ih / 2], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] } };
}

function hopperShape(s: Shell, o: VesselOpts): Outline {
  const { g, cx, yTop, w, h, x0, x1, fill, stroke, width } = s;
  const cone = o.cone ?? w * 0.8;
  const n = (o.neckW ?? w * 0.18) / 2;
  const nl = o.neckL ?? 3;
  const yc = yTop + h;
  const yn = yc + cone;
  const outline = d([[x0, yTop], [x1, yTop], [x1, yc], [cx + n, yn], [cx - n, yn], [x0, yc]]) + 'Z';
  path(g, outline, { fill, stroke, width, join: 'miter' });
  line(g, [x0, yc], [x1, yc], { stroke, width, cap: 'butt' });
  for (const k of [-1, 1]) line(g, [cx + k * n, yn], [cx + k * n, yn + nl], { stroke, width: width * 0.8, cap: 'butt' });
  return { outline, ports: { top: [cx, yTop], bottom: [cx, yn + nl], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] } };
}

function drumShape(s: Shell): Outline {
  const { g, cx, yTop, w, h, x0, x1, fill, stroke, width } = s;
  const ry = h / 2;
  const rx = Math.min(h / 4, w / 4);
  const cy = yTop + ry;
  const A = `A${f3(rx)},${f3(ry)} 0 0 1`;
  const outline = `M${f3(x0 + rx)},${f3(yTop)} L${f3(x1 - rx)},${f3(yTop)} ${A} ${f3(x1 - rx)},${f3(yTop + h)} L${f3(x0 + rx)},${f3(yTop + h)} ${A} ${f3(x0 + rx)},${f3(yTop)}Z`;
  path(g, outline, { fill, stroke, width });
  for (const x of [x0 + rx, x1 - rx]) line(g, [x, yTop], [x, yTop + h], { stroke, width: width * 0.6, cap: 'butt' });
  return { outline, ports: { top: [cx, yTop], bottom: [cx, yTop + h], left: [x0, cy], right: [x1, cy] } };
}

function tankShape(s: Shell): Outline {
  const { g, cx, yTop, w, h, x0, x1, fill, stroke, width } = s;
  const hd = Math.min(w / 4, h / 4);
  const yb = yTop + h;
  const A = `A${f3(w / 2)},${f3(hd)} 0 0 1`;
  const outline = `M${f3(x0)},${f3(yTop + hd)} ${A} ${f3(x1)},${f3(yTop + hd)} L${f3(x1)},${f3(yb - hd)} ${A} ${f3(x0)},${f3(yb - hd)}Z`;
  path(g, outline, { fill, stroke, width });
  for (const y of [yTop + hd, yb - hd]) line(g, [x0, y], [x1, y], { stroke, width: width * 0.6, cap: 'butt' });
  return { outline, ports: { top: [cx, yTop], bottom: [cx, yb], left: [x0, yTop + h / 2], right: [x1, yTop + h / 2] } };
}

function shapeOutline(s: Shell, shape: VesselShape, o: VesselOpts): Outline {
  if (shape === 'capsule' || shape === 'pill') return capsuleOrPill(s, shape);
  if (shape === 'cyclone') return cycloneShape(s, o);
  if (shape === 'hopper') return hopperShape(s, o);
  if (shape === 'drum') return drumShape(s);
  return tankShape(s);
}

function drawLevel(p: Parent, s: Shell, outline: string, level: number, color: string): void {
  const { g, stroke, width } = s;
  const b = g.getBBox();
  const yl = b.y + b.height * (1 - level);
  const cg = el(g, 'g', { 'clip-path': clipPath(p, outline) });
  rect(cg, b.x, yl, b.width, b.y + b.height - yl, { fill: color });
  line(cg, [b.x, yl], [b.x + b.width, yl], { stroke, width: width * 0.6, cap: 'butt' });
  path(g, outline, { stroke, width, join: 'miter' });
}

export function vessel(p: Parent, cx: number, yTop: number, o: VesselOpts = {}): Part {
  const shape = o.shape ?? 'tank';
  const w = o.w ?? 16;
  const h = o.h ?? 30;
  const g = el(p, 'g', { 'data-part': 'vessel-' + shape });
  const fill = o.gradient !== undefined ? linearGradient(g, o.gradient, 90) : (o.fill ?? PAPER);
  const s: Shell = { g, cx, yTop, w, h, x0: cx - w / 2, x1: cx + w / 2, fill, stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.normal * 1.2 };
  const { outline, ports } = shapeOutline(s, shape, o);
  if (o.level !== undefined) drawLevel(p, s, outline, o.level, o.levelColor ?? C.light);
  if (o.label !== undefined && o.label !== '') {
    const rotl = o.labelRotate ?? (h > 1.6 * w ? -90 : 0);
    text(g, cx, yTop + h / 2, o.label, { anchor: 'middle', valign: 'middle', size: o.labelSize ?? STYLE.text.label, weight: o.labelWeight, color: o.labelColor ?? C.text, rotate: rotl === 0 ? undefined : rotl, family: o.family });
  }
  ports['center'] = [cx, yTop + h / 2];
  reg(o.F, o.name, g, ports);
  return { node: g, ports };
}
