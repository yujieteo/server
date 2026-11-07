// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, polygon, rect } from './draw.ts';
import { f3 } from './util.ts';
import { C, DIRS, INK, PAPER, insideText, reg, symbolText, wrap } from './ind-base.ts';
import type { Dir, Part } from './ind-base.ts';

export type InstrumentDisplay = 'discrete' | 'shared' | 'computer' | 'plc';
export type InstrumentLocation = 'field' | 'panel' | 'rear' | 'aux';

export type InstrumentOpts = Loose<{
  r: number;
  tag: string;
  loop: string | number;
  location: InstrumentLocation;
  display: InstrumentDisplay;
  kind: 'bubble' | 'rotameter';
  apex: number;
  size: number;
  leading: number;
  family: string;
  stroke: string;
  width: number;
  fill: string;
  color: string;
  F: Figure;
  name: string;
}>;

interface Body {
  g: SVGGElement;
  cx: number;
  cy: number;
  r: number;
  disp: InstrumentDisplay;
  fill: string;
  stroke: string;
  width: number;
}

function drawBody(b: Body): void {
  const { g, cx, cy, r, disp, fill, stroke, width } = b;
  if (disp === 'shared' || disp === 'plc') rect(g, cx - r, cy - r, 2 * r, 2 * r, { fill, stroke, width, join: 'miter' });
  if (disp === 'plc') polygon(g, [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]], { fill, stroke, width: width * 0.8, join: 'miter' });
  if (disp === 'computer') {
    const R = r * 1.1;
    const pts: Point[] = [];
    for (const k of [0, 1, 2, 3, 4, 5]) pts.push([cx + R * Math.cos((k * Math.PI) / 3), cy + R * Math.sin((k * Math.PI) / 3)]);
    polygon(g, pts, { fill, stroke, width, join: 'miter' });
  }
  if (disp === 'discrete' || disp === 'shared') circle(g, cx, cy, r, { fill, stroke, width });
}

function halfW(disp: InstrumentDisplay, r: number, k: number): number {
  if (disp === 'plc') return r - Math.abs(k);
  if (disp === 'computer') return r * 1.1 - Math.abs(k) * 0.577;
  return Math.sqrt(r * r - k * k);
}

interface Float {
  bottom: Point;
  tc: number;
}

function drawFloat(b: Body, apex: number | undefined): Float {
  const { g, cx, cy, r, fill, stroke, width } = b;
  const D = apex ?? r * 1.6;
  const phi = Math.acos(Math.min(0.999, r / D));
  const tx = r * Math.sin(phi);
  const ty = cy + r * Math.cos(phi);
  polygon(g, [[cx - tx, ty], [cx, cy + D], [cx + tx, ty]], { fill, stroke, width, join: 'miter' });
  return { bottom: [cx, cy + D], tc: (cy - r + ty) / 2 };
}

function drawLocation(b: Body, loc: InstrumentLocation, dl: number): void {
  if (loc === 'field') return;
  const { g, cx, cy, r, disp, stroke, width } = b;
  for (const k of loc === 'aux' ? [-dl, dl] : [0]) {
    const hw = halfW(disp, r, k);
    line(g, [cx - hw, cy + k], [cx + hw, cy + k], { stroke, width: width * 0.8, dash: loc === 'rear' ? [1.2, 0.8] : undefined, cap: 'butt' });
  }
}

export function instrument(p: Parent, cx: number, cy: number, o: InstrumentOpts = {}): Part {
  const loc = o.location ?? 'field';
  const r = o.r ?? (loc === 'field' ? 6.5 : 7.5);
  const size = o.size ?? STYLE.text.small;
  const g = el(p, 'g', { 'data-part': 'instrument' });
  const b: Body = { g, cx, cy, r, disp: o.display ?? 'discrete', fill: o.fill ?? PAPER, stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.normal * 1.2 };
  drawBody(b);
  let bottom: Point = [cx, cy + r];
  let tc = cy;
  if (o.kind === 'rotameter') {
    const f = drawFloat(b, o.apex);
    bottom = f.bottom;
    tc = f.tc;
  }
  const dl = loc === 'aux' ? r * 0.09 : 0;
  drawLocation(b, loc, dl);
  const gap = (loc === 'field' ? 0.22 : 0.5) * size * (o.leading ?? 1) + 2 * dl;
  const cap = 0.72 * size;
  const col = o.color ?? C.text;
  if (o.tag !== undefined && o.tag !== '') symbolText(g, cx, tc - gap / 2, o.tag, size, o.family, col, b.fill);
  if (o.loop !== undefined && o.loop !== '') symbolText(g, cx, tc + gap / 2 + cap, String(o.loop), size, o.family, col, b.fill);
  const hw0 = halfW(b.disp, r, 0);
  const ports = reg(o.F, o.name, g, { top: [cx, cy - r], bottom, left: [cx - hw0, cy], right: [cx + hw0, cy], center: [cx, cy] });
  return { node: g, ports };
}

export type ValveKind = 'gate' | 'globe' | 'ball' | 'check' | '3way';
export type Actuator = 'none' | 'hand' | 'diaphragm' | 'solenoid' | 'motor';

export type ValveOpts = Loose<{
  kind: ValveKind;
  ports: readonly Dir[];
  size: number;
  halfH: number;
  actuator: Actuator;
  actuatorSide: Dir;
  actuatorLen: number;
  barLen: number;
  rot: number;
  family: string;
  stroke: string;
  width: number;
  fill: string;
  F: Figure;
  name: string;
}>;

interface Stem {
  g: SVGGElement;
  cx: number;
  cy: number;
  ex: number;
  ey: number;
  dx: number;
  dy: number;
  hh: number;
  stroke: string;
  width: number;
  fill: string;
}

function motorHead(s: Stem, ports: Ports, family: string | undefined): void {
  const { g, ex, ey, dx, dy, stroke, width, fill } = s;
  const R = s.hh * 1.1;
  const c: Point = [ex + dx * R, ey + dy * R];
  circle(g, c[0], c[1], R, { fill, stroke, width });
  insideText(text(g, c[0], c[1], 'M', { size: Math.max(STYLE.text.min, R * 1.25), anchor: 'middle', valign: 'middle', color: stroke, family }), fill);
  ports['actuator'] = [c[0] + dx * R, c[1] + dy * R];
}

function diaphragmHead(s: Stem): void {
  const { g, ex, ey, dx, dy, stroke, width, fill } = s;
  const nx = -dy;
  const ny = dx;
  const R = s.hh * 1.05;
  const a0: Point = [ex - nx * R, ey - ny * R];
  const a1: Point = [ex + nx * R, ey + ny * R];
  path(g, `M${f3(a0[0])},${f3(a0[1])} A${f3(R)},${f3(R)} 0 0 ${dx + dy > 0 ? 0 : 1} ${f3(a1[0])},${f3(a1[1])} Z`, { fill, stroke, width });
}

function drawActuator(g: SVGGElement, cx: number, cy: number, o: ValveOpts, act: Actuator, base: Omit<Stem, 'g' | 'ex' | 'ey' | 'dx' | 'dy' | 'cx' | 'cy'>, size: number, ports: Ports): void {
  const [dx, dy] = DIRS[o.actuatorSide ?? 'up'];
  const Ls = o.actuatorLen ?? size * 1.25;
  const ex = cx + dx * Ls;
  const ey = cy + dy * Ls;
  const s: Stem = { ...base, g, cx, cy, ex, ey, dx, dy };
  line(g, [cx, cy], [ex, ey], { stroke: s.stroke, width: s.width, cap: 'butt' });
  if (act === 'hand') {
    const b = (o.barLen ?? s.hh * 1.7) / 2;
    const nx = -dy;
    const ny = dx;
    line(g, [ex - nx * b, ey - ny * b], [ex + nx * b, ey + ny * b], { stroke: s.stroke, width: s.width, cap: 'butt' });
  } else if (act === 'motor') motorHead(s, ports, o.family);
  else if (act === 'diaphragm') diaphragmHead(s);
  else if (act === 'solenoid') {
    const q = s.hh * 1.5;
    rect(g, ex - q / 2 + (dx * q) / 2, ey - q / 2 + (dy * q) / 2, q, q, { fill: s.fill, stroke: s.stroke, width: s.width, join: 'miter' });
  }
  ports['actuator'] ??= [ex, ey];
}

export function valve(p: Parent, cx: number, cy: number, o: ValveOpts = {}): Part {
  const kind = o.kind ?? 'gate';
  const size = o.size ?? 4.5;
  const hh = o.halfH ?? size * 0.62;
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const fill = o.fill ?? PAPER;
  const portList: readonly Dir[] = o.ports ?? (kind === '3way' ? ['left', 'right', 'down'] : ['left', 'right']);
  const g = wrap(p, 'valve', o.rot, cx, cy);
  const ports: Ports = { center: [cx, cy] };
  const act = o.actuator ?? 'none';
  if (act !== 'none') drawActuator(g, cx, cy, o, act, { hh, stroke, width, fill }, size, ports);
  for (let i = 0; i < portList.length; i++) {
    const k = portList[i] ?? 'left';
    const [dx, dy] = DIRS[k];
    const nx = -dy;
    const ny = dx;
    const bx = cx + dx * size;
    const by = cy + dy * size;
    const solid = kind === 'check' && i === portList.length - 1;
    polygon(g, [[cx, cy], [bx + nx * hh, by + ny * hh], [bx - nx * hh, by - ny * hh]], { fill: solid ? stroke : fill, stroke, width, join: 'miter' });
    ports[k] = [bx, by];
  }
  if (kind === 'globe') circle(g, cx, cy, hh * 0.38, { fill: stroke });
  if (kind === 'ball') circle(g, cx, cy, hh * 0.55, { fill, stroke, width });
  reg(o.F, o.name, g, ports);
  return { node: g, ports };
}
