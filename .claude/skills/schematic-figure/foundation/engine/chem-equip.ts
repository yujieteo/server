// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, line, linearGradient, path, polygon, rect } from './draw.ts';
import { f3 } from './util.ts';
import { C, INK, chemText, gOf, rad, reg, roundPath } from './chem-text.ts';
import type { Box } from './chem-text.ts';

function filled(s: string | undefined): s is string {
  return s !== undefined && s !== '';
}

export type CardOpts = Loose<{
  r: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  shadow: number;
  shadowColor: string;
  title: string;
  titleSize: number;
  titleColor: string;
  titleWeight: string | number;
  well: string;
  inset: number;
  label: string;
  labelSize: number;
  labelColor: string;
  labelWeight: string | number;
  formula: boolean;
  part: string;
  F: Figure;
  name: string;
}>;

export function card(p: Parent, x: number, y: number, w: number, h: number, o: CardOpts = {}): { node: SVGGElement; well: Box | null; box: Box } {
  const g = gOf(p, o.part ?? 'card');
  const r = o.r ?? Math.min(w, h) * 0.1;
  const sh = o.shadow ?? 1;
  if (sh !== 0) rect(g.node, x + sh, y + sh, w, h, { r, fill: o.shadowColor ?? '#8c8c8c' });
  rect(g.node, x, y, w, h, { r, fill: o.fill ?? '#fbfbfb', stroke: o.stroke ?? '#a3a3a3', width: o.strokeWidth ?? STYLE.line.thin });
  const ts = o.titleSize ?? STYLE.text.label;
  const top = filled(o.title) ? ts * 1.9 : 0;
  const inset = o.inset ?? Math.min(w, h) * 0.07;
  if (filled(o.title)) chemText(g.node, x + w / 2, y + ts * 1.3, o.title, { size: ts, anchor: 'middle', color: o.titleColor, weight: o.titleWeight, formula: o.formula });
  const lead = top !== 0 ? top : inset;
  let well: Box | null = null;
  if (filled(o.well)) {
    well = { x: x + inset, y: y + lead, w: w - 2 * inset, h: h - lead - inset };
    rect(g.node, well.x, well.y, well.w, well.h, { r: r * 0.8, fill: o.well });
  }
  const B: Box = well ?? { x, y: y + top, w, h: h - top };
  if (filled(o.label)) {
    chemText(g.node, B.x + B.w / 2, B.y + B.h / 2, o.label, { size: o.labelSize ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor, weight: o.labelWeight, formula: o.formula });
  }
  reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g.node, well, box: { x, y, w, h } };
}

export type TubeOpts = Loose<{ width: number; wall: number; edge: string; fill: string; r: number; hollow: boolean; cap: string }>;
export type TubePaths = readonly Point[] | readonly (readonly Point[])[];

function isMulti(paths: TubePaths): paths is readonly (readonly Point[])[] {
  const f = paths[0];
  return f !== undefined && typeof f[0] !== 'number';
}

export function tube(p: Parent, paths: TubePaths, o: TubeOpts = {}): { node: SVGGElement } {
  const list = isMulti(paths) ? paths : [paths];
  const g = gOf(p, 'tube');
  const w = o.width ?? 4;
  const wall = o.wall ?? Math.max(0.4, w * 0.14);
  const r = o.r ?? w * 1.5;
  const cap = o.cap ?? 'butt';
  const edge = o.edge ?? '#9d9d9d';
  const hollow = o.hollow !== false;
  const ds: string[] = [];
  for (const P of list) ds.push(roundPath(P, r));
  if (hollow) for (const d of ds) path(g.node, d, { stroke: edge, width: w, cap, join: 'round', part: 'tube-wall' });
  for (const d of ds) path(g.node, d, { stroke: o.fill ?? (hollow ? C.paper : edge), width: hollow ? w - 2 * wall : w, cap, join: 'round', part: 'tube-bore' });
  return { node: g.node };
}

export type PumpOpts = Loose<{
  dir: number;
  fill: string;
  edge: string;
  wall: number;
  arrow: string | false;
  flanges: boolean;
  flangeSide: number;
  stubL: number;
  stubH: number;
  F: Figure;
  name: string;
}>;

function flowArrow(g: SVGGElement, cx: number, cy: number, R: number, dir: number, color: string): void {
  const s = dir > 0 ? 1 : -1;
  const aw = R * 1.2;
  const hw = aw * 0.4;
  const w2 = aw * 0.19;
  const x0 = cx - (s * aw) / 2;
  const x1 = cx + (s * aw) / 2;
  const bx = x1 - s * aw * 0.45;
  polygon(g, [[x0, cy - w2], [bx, cy - w2], [bx, cy - hw], [x1, cy], [bx, cy + hw], [bx, cy + w2], [x0, cy + w2]], { fill: color, part: 'flow-arrow' });
}

export function pump(p: Parent, cx: number, cy: number, R: number, o: PumpOpts = {}): { node: SVGGElement; ports: Ports } {
  const g = gOf(p, 'pump');
  const edge = o.edge ?? '#9d9d9d';
  const wall = o.wall ?? Math.max(0.4, R * 0.1);
  const fill = o.fill ?? '#d9d9d9';
  const fl = o.flanges ?? true;
  const side = (o.flangeSide ?? 1) > 0 ? 1 : -1;
  const L = o.stubL ?? R * 0.7;
  const H = o.stubH ?? R * 0.95;
  const rects: (readonly [number, number, number, number])[] = fl
    ? [[side > 0 ? cx : cx - R - L, cy - R, R + L, H], [side > 0 ? cx - R - L : cx, cy + R - H, R + L, H]]
    : [];
  circle(g.node, cx, cy, R + wall, { fill: edge });
  for (const [x, y, w, h] of rects) rect(g.node, x - wall, y - wall, w + 2 * wall, h + 2 * wall, { fill: edge });
  circle(g.node, cx, cy, R, { fill });
  for (const [x, y, w, h] of rects) rect(g.node, x, y, w, h, { fill });
  if (o.arrow !== false) flowArrow(g.node, cx, cy, R, o.dir ?? 1, o.arrow ?? INK);
  const ports: Ports = fl
    ? { top: [cx + side * (R + L), cy - R + H / 2], bottom: [cx - side * (R + L), cy + R - H / 2] }
    : { left: [cx - R - wall, cy], right: [cx + R + wall, cy] };
  reg(o.F, o.name, p, { ...ports, center: [cx, cy] });
  return { node: g.node, ports };
}

export type PolarityOpts = Loose<{ r: number; color: string; width: number; fill: string }>;

export function polarity(p: Parent, cx: number, cy: number, sign: '+' | '-' | 1 | -1, o: PolarityOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'polarity');
  const r = o.r ?? 3.2;
  const col = o.color ?? INK;
  const w = o.width ?? r * 0.26;
  const a = r * 0.52;
  circle(g.node, cx, cy, r, { fill: o.fill ?? C.paper, stroke: col, width: w });
  line(g.node, [cx - a, cy], [cx + a, cy], { stroke: col, width: w, cap: 'butt' });
  if (sign === '+' || (typeof sign === 'number' && sign > 0)) line(g.node, [cx, cy - a], [cx, cy + a], { stroke: col, width: w, cap: 'butt' });
  return { node: g.node };
}

export type DrumOpts = Loose<{
  ry: number;
  fill: string;
  top: string;
  stroke: string;
  strokeWidth: number;
  bands: readonly number[];
  rim: string;
  cap: boolean | number;
  shade: boolean;
  label: string;
  labelSize: number;
  labelColor: string;
  labelWeight: string | number;
  formula: boolean;
  F: Figure;
  name: string;
}>;

function drumArc(cx: number, rx: number, ry: number, yy: number): string {
  return `M${f3(cx - rx)},${f3(yy)} A${f3(rx)},${f3(ry)} 0 0 0 ${f3(cx + rx)},${f3(yy)}`;
}

function drumCap(g: SVGGElement, o: DrumOpts, cx: number, y: number, rx: number, ry: number, body: string, stroke: string, lw: number): void {
  const capOff = o.cap === true || o.cap === undefined || o.cap === false ? 0 : o.cap;
  const cr = rx * 0.18;
  const cxx = cx + capOff * rx;
  const ch = ry * 0.5;
  path(g, `M${f3(cxx - cr)},${f3(y)} L${f3(cxx - cr)},${f3(y - ch)} L${f3(cxx + cr)},${f3(y - ch)} L${f3(cxx + cr)},${f3(y)} Z`, { fill: body, stroke, width: lw });
  ellipse(g, cxx, y - ch, cr, (cr * ry) / rx, { fill: o.top ?? shade(body, 0.4), stroke, width: lw });
}

export function drum(p: Parent, cx: number, y: number, w: number, h: number, o: DrumOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'drum');
  const rx = w / 2;
  const ry = o.ry ?? w * 0.14;
  const stroke = o.stroke ?? '#8c8c8c';
  const lw = o.strokeWidth ?? STYLE.line.thin;
  const body = o.fill ?? '#f4f4f4';
  const yb = y + h;
  const bf = o.shade === false ? body : linearGradient(g.node, [[0, shade(body, -0.1)], [0.4, shade(body, 0.55)], [1, shade(body, -0.18)]], 0);
  path(g.node, `M${f3(cx - rx)},${f3(y)} L${f3(cx - rx)},${f3(yb)} A${f3(rx)},${f3(ry)} 0 0 0 ${f3(cx + rx)},${f3(yb)} L${f3(cx + rx)},${f3(y)} Z`, { fill: bf, stroke, width: lw });
  if (filled(o.rim)) path(g.node, drumArc(cx, rx, ry, yb), { stroke: o.rim, width: lw * 2.5 });
  for (const f of o.bands ?? []) path(g.node, drumArc(cx, rx, ry, y + f * h), { stroke, width: lw });
  ellipse(g.node, cx, y, rx, ry, { fill: o.top ?? shade(body, 0.4), stroke, width: lw });
  if (o.cap !== undefined && o.cap !== false && o.cap !== 0) drumCap(g.node, o, cx, y, rx, ry, body, stroke, lw);
  if (filled(o.label)) chemText(g.node, cx, y + h / 2 + ry / 2, o.label, { size: o.labelSize ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor, weight: o.labelWeight, formula: o.formula });
  reg(o.F, o.name, p, { top: [cx, y - ry], bottom: [cx, yb + ry], left: [cx - rx, y + h / 2], right: [cx + rx, y + h / 2], center: [cx, y + h / 2] });
  return { node: g.node };
}

export type CrateOpts = Loose<{
  depth: number;
  angle: number;
  view: 'right' | 'left';
  fill: string;
  side: string;
  top: string;
  stroke: string;
  strokeWidth: number;
  cap: boolean;
  label: string;
  labelSize: number;
  labelColor: string;
  labelWeight: string | number;
  formula: boolean;
}>;

export function crate(p: Parent, x: number, y: number, w: number, h: number, o: CrateOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'crate');
  const d = o.depth ?? w * 0.3;
  const a = rad(o.angle ?? 35);
  const dx = d * Math.cos(a) * ((o.view ?? 'right') === 'left' ? -1 : 1);
  const dy = d * Math.sin(a);
  const front = o.fill ?? '#e3f0da';
  const lw = o.strokeWidth ?? STYLE.line.thin;
  const st = { stroke: o.stroke ?? '#8c8c8c', width: lw, join: 'round' };
  const sx = dx > 0 ? x + w : x;
  polygon(g.node, [[sx, y], [sx + dx, y - dy], [sx + dx, y + h - dy], [sx, y + h]], { fill: o.side ?? shade(front, -0.15), ...st });
  polygon(g.node, [[x, y], [x + w, y], [x + w + dx, y - dy], [x + dx, y - dy]], { fill: o.top ?? shade(front, 0.35), ...st });
  rect(g.node, x, y, w, h, { fill: front, ...st });
  if (o.cap === true) {
    const c: Point = [x + w / 2 + dx / 2, y - dy / 2];
    const cr = w * 0.12;
    ellipse(g.node, c[0], c[1], cr, cr * 0.45, { fill: '#f4f4f4', ...st });
  }
  if (filled(o.label)) chemText(g.node, x + w / 2, y + h / 2, o.label, { size: o.labelSize ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor, weight: o.labelWeight, formula: o.formula });
  return { node: g.node };
}
