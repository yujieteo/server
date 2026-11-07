// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/patent.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el, text } from './core.ts';
import { PATENT, STYLE } from './style.ts';
import { arrow, path, polygon, rect, toLocal } from './draw.ts';
import { numeral } from './notation.ts';
import type { NumeralResult, NumeralTarget } from './notation.ts';
import { at, f3 } from './util.ts';

const C = STYLE.color;

export function regPorts(F: Figure | undefined, name: string | undefined, parent: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y);
  }
  return ports;
}

type NumeralSide = 'left' | 'right' | 'top' | 'bottom' | 'inside';
type Anchor3 = 'start' | 'middle' | 'end';

interface Place {
  pos: Point;
  to: Point | null;
  anchor: Anchor3;
}

function numeralPlace(x: number, y: number, w: number, h: number, where: NumeralSide | Point, lead: number): Place {
  if (typeof where !== 'string') return { pos: where, to: null, anchor: 'middle' };
  const ty = y + Math.min(h * 0.4, 14);
  if (where === 'left') return { pos: [x - lead, ty - lead * 0.55], to: [x, ty], anchor: 'end' };
  if (where === 'top') return { pos: [x + w * 0.8 + lead * 0.45, y - lead * 0.9], to: [x + w * 0.8, y], anchor: 'start' };
  if (where === 'bottom') return { pos: [x + w * 0.8 + lead * 0.45, y + h + lead * 0.9], to: [x + w * 0.8, y + h], anchor: 'start' };
  return { pos: [x + w + lead, ty - lead * 0.55], to: [x + w, ty], anchor: 'start' };
}

export type PBoxOpts = Loose<{
  numeralAt: NumeralSide | Point; numeralTo: NumeralTarget; numeralSize: number; lead: number; curve: number | 'S' | 'wavy' | false; size: number; width: number;
  dash: boolean | string; r: number; fill: string; F: Figure; name: string; part: string;
}>;

export interface PartResult {
  node: SVGGElement;
  ports: Ports;
  numeral: NumeralResult | null;
}

function boxNumeral(g: SVGGElement, x: number, y: number, w: number, h: number, num: string | number, o: PBoxOpts): NumeralResult {
  const pl = numeralPlace(x, y, w, h, o.numeralAt ?? 'right', o.lead ?? 18);
  const target = o.numeralTo ?? pl.to ?? undefined;
  return numeral(g, pl.pos[0], pl.pos[1], String(num), { to: target, curve: o.curve ?? 0.3, size: o.numeralSize, anchor: pl.anchor, F: o.F });
}

export function pBox(p: Parent, x: number, y: number, w: number, h: number, legend: string | undefined, num: string | number | undefined, o: PBoxOpts = {}): PartResult {
  const g = el(p, 'g', { 'data-part': o.part ?? 'pbox' });
  const dash = o.dash === true ? '6 3' : o.dash === false ? undefined : o.dash;
  rect(g, x, y, w, h, { r: o.r ?? 0, fill: o.fill ?? '#ffffff', stroke: C.ink, width: o.width ?? STYLE.line.normal, dash });
  const size = o.size ?? PATENT.text.legend;
  const hasNum = num !== undefined && num !== '' && num !== 0;
  const inside = o.numeralAt === 'inside' && hasNum;
  const hasLegend = legend !== undefined && legend !== '';
  if (hasLegend) text(g, x + w / 2, y + h / 2 - (inside ? size * 0.55 : 0), legend, { size, anchor: 'middle', valign: 'middle', role: 'legend' });
  let nm: NumeralResult | null = null;
  if (inside) {
    nm = numeral(g, x + w / 2, hasLegend ? y + h / 2 + size * 0.75 : y + h / 2, String(num), { size: o.numeralSize, underline: true });
  } else if (hasNum) nm = boxNumeral(g, x, y, w, h, num, o);
  const ports = regPorts(o.F, o.name, p, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g, ports, numeral: nm };
}

export type FlowShape = 'process' | 'decision' | 'terminal' | 'io';
export type FlowStepOpts = Loose<{
  shape: FlowShape; numeralAt: 'left' | 'right' | Point; numeralTo: NumeralTarget; numeralSize: number; lead: number; curve: number | 'S' | 'wavy' | false;
  size: number; width: number; F: Figure; name: string; part: string;
}>;

function flowShape(g: SVGGElement, shape: FlowShape, cx: number, cy: number, w: number, h: number, width: number): Point {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const st = { fill: '#ffffff', stroke: C.ink, width };
  if (shape === 'decision') {
    polygon(g, [[cx, y], [x + w, cy], [cx, y + h], [x, cy]], { ...st, part: 'flow-decision' });
    return [cx + w / 4, cy - h / 4];
  }
  if (shape === 'terminal') {
    rect(g, x, y, w, h, { ...st, r: h / 2, part: 'flow-terminal' });
    return [x + w - h * 0.2, y + h * 0.1];
  }
  if (shape === 'io') {
    const k = h * 0.3;
    polygon(g, [[x + k, y], [x + w, y], [x + w - k, y + h], [x, y + h]], { ...st, part: 'flow-io' });
    return [x + w - k * 0.6, y + h * 0.4];
  }
  rect(g, x, y, w, h, { ...st, part: 'flow-process' });
  return [x + w, y + Math.min(h * 0.4, 14)];
}

function stepNumeral(g: SVGGElement, shape: FlowShape, cx: number, cy: number, w: number, h: number, to: Point, num: string | number, o: FlowStepOpts): NumeralResult {
  const lead = o.lead ?? 18;
  const where = o.numeralAt;
  const left = where === 'left';
  const x = cx - w / 2;
  let tgt: Point = to;
  if (left) tgt = shape === 'decision' ? [cx - w / 4, cy - h / 4] : [x + (shape === 'io' ? h * 0.3 * 0.6 : 0), to[1]];
  const pos: Point = typeof where === 'object' ? where : [tgt[0] + (left ? -lead : lead) * (shape === 'decision' ? 1.6 : 1), tgt[1] - lead * 0.55];
  const anchor: Anchor3 = typeof where === 'object' ? 'middle' : left ? 'end' : 'start';
  return numeral(g, pos[0], pos[1], String(num), { to: o.numeralTo ?? tgt, curve: o.curve ?? (left ? -0.3 : 0.3), size: o.numeralSize, anchor, F: o.F });
}

export function flowStep(p: Parent, cx: number, cy: number, w: number, h: number, legend: string | undefined, num: string | number | undefined, o: FlowStepOpts = {}): PartResult {
  const g = el(p, 'g', { 'data-part': o.part ?? 'flow-step' });
  const shape = o.shape ?? 'process';
  const to = flowShape(g, shape, cx, cy, w, h, o.width ?? STYLE.line.normal);
  if (legend !== undefined && legend !== '') text(g, cx, cy, legend, { size: o.size ?? PATENT.text.legend, anchor: 'middle', valign: 'middle', role: 'legend' });
  const nm = num !== undefined && num !== '' && num !== 0 ? stepNumeral(g, shape, cx, cy, w, h, to, num, o) : null;
  const ports = regPorts(o.F, o.name, p, { top: [cx, cy - h / 2], bottom: [cx, cy - h / 2 + h], left: [cx - w / 2, cy], right: [cx - w / 2 + w, cy], center: [cx, cy] });
  return { node: g, ports, numeral: nm };
}

export type FlowLinkOpts = Loose<{
  via: readonly Point[]; label: string; labelAt: Point; labelSide: number; width: number; kind: string; F: Figure;
}>;

function resolvePt(F: Figure | undefined, p: Parent, q: Point | string): Point {
  if (typeof q !== 'string') return q;
  if (F === undefined) throw new Error('an anchor name needs F');
  return toLocal(F, p, F.at(q));
}

export function flowLink(p: Parent, from: Point | string, to: Point | string, o: FlowLinkOpts = {}): SVGGElement {
  const g = arrow(p, from, to, { F: o.F, via: o.via, radius: 0.001, width: o.width ?? STYLE.line.normal, kind: o.kind, part: 'flow-link' });
  if (o.label !== undefined && o.label !== '') {
    const a = resolvePt(o.F, p, from);
    const nx = o.via !== undefined && o.via.length > 0 ? at(o.via, 0) : resolvePt(o.F, p, to);
    const dx = nx[0] - a[0];
    const dy = nx[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    const u: Point = [dx / L, dy / L];
    const s = o.labelSide ?? 1;
    const lp: Point = o.labelAt ?? [a[0] + u[0] * 11 - u[1] * 9 * s, a[1] + u[1] * 11 + u[0] * 9 * s];
    text(p, lp[0], lp[1], o.label, { size: PATENT.text.legend, anchor: Math.abs(u[1]) > 0.5 ? (s * u[1] > 0 ? 'end' : 'start') : 'middle', valign: 'middle', role: 'legend' });
  }
  return g;
}

export type SectionLineOpts = Loose<{ side: number; len: number; width: number }>;

export function sectionLine(p: Parent, a: Point, b: Point, label: string | number | undefined, o: SectionLineOpts = {}): { node: SVGGElement } {
  const g = el(p, 'g', { 'data-part': 'section-line' });
  const w = o.width ?? STYLE.line.bold;
  path(g, `M${f3(a[0])},${f3(a[1])} L${f3(b[0])},${f3(b[1])}`, { stroke: C.ink, width: w, dash: '18 4 3 4', cap: 'butt' });
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const s = o.side ?? 1;
  const n: Point = [(dy / L) * s, (-dx / L) * s];
  const len = o.len ?? 16;
  for (const q of [a, b]) {
    arrow(g, q, [q[0] + n[0] * len, q[1] + n[1] * len], { width: STYLE.line.normal });
    if (label !== undefined && label !== '' && label !== 0) {
      text(g, q[0] + n[0] * (len + 9), q[1] + n[1] * (len + 9), String(label), { size: PATENT.text.numeral, anchor: 'middle', valign: 'middle', role: 'section' });
    }
  }
  return { node: g };
}

export type CenterLineOpts = Loose<{ width: number; dash: string }>;

export function centerLine(p: Parent, a: Point, b: Point, o: CenterLineOpts = {}): SVGPathElement {
  return path(p, `M${f3(a[0])},${f3(a[1])} L${f3(b[0])},${f3(b[1])}`, { stroke: C.ink, width: o.width ?? STYLE.line.hair, dash: o.dash ?? '14 3 2 3', cap: 'butt', part: 'center-line' });
}
