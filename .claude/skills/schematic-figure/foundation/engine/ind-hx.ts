// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, path, rect } from './draw.ts';
import { C, INK, PAPER, d, insideText, reg, wrap } from './ind-base.ts';
import type { Part } from './ind-base.ts';

export type HeatExchangerOpts = Loose<{
  kind: 'coil' | 'shell'; r: number; w: number; h: number; turns: number; ext: number; rot: number;
  stroke: string; width: number; fill: string; F: Figure; name: string;
}>;

function zigzag(cy: number, turns: number, xa: number, xb: number, amp: number): Point[] {
  const n = turns * 2;
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push([xa + ((xb - xa) * (i + 0.5)) / n, cy + (i % 2 !== 0 ? amp : -amp)]);
  return pts;
}

function shellExchanger(g: Parent, cx: number, cy: number, o: HeatExchangerOpts, turns: number, st: { stroke: string; width: number; fill: string }): Ports {
  const { stroke, width, fill } = st;
  const w = o.w ?? 26;
  const h = o.h ?? 10;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const sheet = w * 0.1;
  const ext = o.ext ?? 3;
  rect(g, x0, cy - h / 2, w, h, { r: h * 0.25, fill, stroke, width });
  for (const x of [x0 + sheet, x1 - sheet]) line(g, [x, cy - h / 2], [x, cy + h / 2], { stroke, width: width * 0.6, cap: 'butt' });
  path(g, d([[x0 - ext, cy], [x0 + sheet, cy], ...zigzag(cy, turns, x0 + sheet, x1 - sheet, h * 0.3), [x1 - sheet, cy], [x1 + ext, cy]]), { stroke, width: width * 0.8, join: 'miter' });
  return { tubeIn: [x0 - ext, cy], tubeOut: [x1 + ext, cy], in: [x0 + w * 0.25, cy - h / 2], out: [x1 - w * 0.25, cy + h / 2], top: [cx, cy - h / 2], bottom: [cx, cy + h / 2] };
}

function coilExchanger(g: Parent, cx: number, cy: number, o: HeatExchangerOpts, turns: number, st: { stroke: string; width: number; fill: string }): Ports {
  const { stroke, width, fill } = st;
  const r = o.r ?? 6;
  const e = r * 1.35;
  circle(g, cx, cy, r, { fill, stroke, width });
  path(g, d([[cx - e, cy], [cx - r * 0.75, cy], ...zigzag(cy, turns, cx - r * 0.75, cx + r * 0.75, r * 0.42), [cx + r * 0.75, cy], [cx + e, cy]]), { stroke, width: width * 0.8, join: 'miter' });
  return { left: [cx - e, cy], right: [cx + e, cy], top: [cx, cy - r], bottom: [cx, cy + r] };
}

export function heatExchanger(p: Parent, cx: number, cy: number, o: HeatExchangerOpts = {}): Part {
  const st = { stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.normal * 1.2, fill: o.fill ?? PAPER };
  const g = wrap(p, 'heat-exchanger', o.rot, cx, cy);
  const turns = o.turns ?? 2;
  const ports = (o.kind ?? 'coil') === 'shell' ? shellExchanger(g, cx, cy, o, turns, st) : coilExchanger(g, cx, cy, o, turns, st);
  ports['center'] = [cx, cy];
  reg(o.F, o.name, g, ports);
  return { node: g, ports };
}

export type PlateHXOpts = Loose<{
  plates: number; fill: string; endFill: string; stroke: string; width: number; rot: number; F: Figure; name: string;
}>;

export function plateHX(p: Parent, x: number, y: number, w: number, h: number, o: PlateHXOpts = {}): Part {
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const n = o.plates ?? 7;
  const e = w * 0.12;
  const g = wrap(p, 'plate-hx', o.rot, x + w / 2, y + h / 2);
  rect(g, x, y, w, h, { fill: o.fill ?? '#f1f1f1', stroke, width, r: Math.min(w, h) * 0.04 });
  for (const x0 of [x, x + w - e]) rect(g, x0, y, e, h, { fill: o.endFill ?? '#9a9a9a', stroke, width });
  for (let i = 1; i <= n; i++) {
    const xx = x + e + ((w - 2 * e) * i) / (n + 1);
    line(g, [xx, y + h * 0.08], [xx, y + h * 0.92], { stroke: shade(stroke, 0.35), width: width * 0.65, cap: 'butt' });
  }
  const ports = reg(o.F, o.name, g, {
    hotIn: [x + e / 2, y], hotOut: [x + w - e / 2, y + h], coldIn: [x + e / 2, y + h], coldOut: [x + w - e / 2, y],
    left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2],
  });
  return { node: g, ports };
}

export type ElectrolyserOpts = Loose<{
  cells: number; fill: string; endFill: string; plateFill: string; diaphragm: boolean; rot: number;
  stroke: string; width: number; F: Figure; name: string;
}>;

export interface CellSpan {
  x: number;
  w: number;
  cx: number;
}

export interface ElectrolyserResult extends Part {
  cells: CellSpan[];
}

export function electrolyserStack(p: Parent, x: number, y: number, w: number, h: number, o: ElectrolyserOpts = {}): ElectrolyserResult {
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const n = o.cells ?? 5;
  const e = w * 0.06;
  const cw = (w - 2 * e) / n;
  const g = wrap(p, 'electrolyser-stack', o.rot, x + w / 2, y + h / 2);
  rect(g, x, y, w, h, { fill: o.fill ?? '#eef1f4', stroke, width, r: Math.min(w, h) * 0.03 });
  for (const x0 of [x, x + w - e]) rect(g, x0, y, e, h, { fill: o.endFill ?? '#8d949c', stroke, width });
  const pw = Math.max(width * 1.6, cw * 0.06);
  const inset = h * 0.04;
  const cells: CellSpan[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = x + e + i * cw;
    if (i > 0) rect(g, x0 - pw / 2, y + inset, pw, h - 2 * inset, { fill: o.plateFill ?? '#6f767e' });
    if (o.diaphragm !== false) line(g, [x0 + cw / 2, y + inset * 1.8], [x0 + cw / 2, y + h - inset * 1.8], { stroke: '#7a7a7a', width: width * 0.8, dash: [width * 2, width * 1.5], cap: 'butt' });
    cells.push({ x: x + e + i * cw, w: cw, cx: x + e + (i + 0.5) * cw });
  }
  const ports = reg(o.F, o.name, g, { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2] });
  return { node: g, ports, cells };
}

export type ScaleOpts = Loose<{
  panW: number; lip: number; lipX: number; postDx: number; gap: number; boxW: number; boxH: number;
  label: string; size: number; family: string; color: string; fill: string; stroke: string; width: number; F: Figure; name: string;
}>;

export function scale(p: Parent, cx: number, yPan: number, o: ScaleOpts = {}): Part {
  const panW = o.panW ?? 20;
  const lip = o.lip ?? panW * 0.19;
  const lipX = o.lipX ?? panW * 0.1;
  const postDx = o.postDx ?? panW * 0.17;
  const boxW = o.boxW ?? panW * 0.93;
  const boxH = o.boxH ?? panW * 0.42;
  const by = yPan + (o.gap ?? panW * 0.15);
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const a = panW / 2 - lipX;
  const g = el(p, 'g', { 'data-part': 'scale' });
  path(g, d([[cx - a - lipX, yPan - lip], [cx - a, yPan], [cx + a, yPan], [cx + a + lipX, yPan - lip]]), { stroke, width, join: 'miter' });
  for (const s of [-1, 1]) line(g, [cx + s * postDx, yPan], [cx + s * postDx, by], { stroke, width: width * 0.7, cap: 'butt' });
  rect(g, cx - boxW / 2, by, boxW, boxH, { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
  if (o.label !== '') {
    insideText(text(g, cx, by + boxH / 2, o.label ?? 'scale', { size: o.size ?? STYLE.text.small, family: o.family, anchor: 'middle', valign: 'middle', color: o.color ?? C.text }), o.fill ?? PAPER);
  }
  const ports = reg(o.F, o.name, g, { pan: [cx, yPan], bottom: [cx, by + boxH], left: [cx - boxW / 2, by + boxH / 2], right: [cx + boxW / 2, by + boxH / 2] });
  return { node: g, ports };
}
