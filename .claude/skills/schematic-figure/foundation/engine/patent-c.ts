// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/patent.js
import type { Figure, Loose, Paint, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, polygon, polyline } from './draw.ts';
import { regPorts } from './patent-b.ts';
import { f3 } from './util.ts';

const C = STYLE.color;

export type TwoTermOpts = Loose<{
  len: number; width: number; F: Figure; name: string; amp: number; plate: number; turns: number; half: number; open: boolean; closed: boolean;
}>;

export interface SymbolResult {
  node: SVGGElement;
  ports: Ports;
}

type Body =
  | { kind: 'resistor'; amp: number }
  | { kind: 'capacitor'; plate: number }
  | { kind: 'inductor'; turns: number }
  | { kind: 'diode'; half: number; open: boolean }
  | { kind: 'battery' }
  | { kind: 'switch'; closed: boolean };

function resistorBody(g: SVGGElement, hl: number, st: Paint, amp: number): void {
  const n = 6;
  const pts: Point[] = [[-hl, 0]];
  for (let i = 0; i < n; i++) pts.push([-hl + ((i + 0.5) * 2 * hl) / n, i % 2 === 1 ? amp : -amp]);
  pts.push([hl, 0]);
  polyline(g, pts, { ...st, join: 'miter' });
}

function inductorBody(g: SVGGElement, hl: number, st: Paint, n: number): void {
  const r = hl / n;
  let d = `M${f3(-hl)},0`;
  for (let i = 0; i < n; i++) d += ` A${f3(r)},${f3(r)} 0 0 1 ${f3(-hl + (i + 1) * 2 * r)},0`;
  path(g, d, st);
}

function drawBody(g: SVGGElement, hl: number, st: Paint, body: Body): void {
  if (body.kind === 'resistor') resistorBody(g, hl, st, body.amp);
  else if (body.kind === 'inductor') inductorBody(g, hl, st, body.turns);
  else if (body.kind === 'capacitor') {
    line(g, [-hl, -body.plate], [-hl, body.plate], { ...st, width: STYLE.line.bold });
    line(g, [hl, -body.plate], [hl, body.plate], { ...st, width: STYLE.line.bold });
  } else if (body.kind === 'diode') {
    polygon(g, [[-hl, -body.half], [hl, 0], [-hl, body.half]], { ...st, fill: body.open ? '#ffffff' : C.ink });
    line(g, [hl, -body.half], [hl, body.half], st);
  } else if (body.kind === 'battery') {
    line(g, [-hl, -10], [-hl, 10], st);
    line(g, [hl, -5], [hl, 5], { ...st, width: STYLE.line.bold * 1.6 });
  } else {
    circle(g, -hl, 0, 1.6, { ...st, fill: '#ffffff' });
    circle(g, hl, 0, 1.6, { ...st, fill: '#ffffff' });
    line(g, [-hl + 1.4, -0.8], [hl * 0.8, body.closed ? -1 : -hl * 0.9], st);
  }
}

function twoTerm(p: Parent, a: Point, b: Point, len: number, part: string, body: Body, o: TwoTermOpts): SymbolResult {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const hl = Math.min(len, L) / 2;
  const g = el(p, 'g', { 'data-part': part, transform: `translate(${f3((a[0] + b[0]) / 2)} ${f3((a[1] + b[1]) / 2)}) rotate(${f3((Math.atan2(dy, dx) * 180) / Math.PI)})` });
  const st: Paint = { stroke: C.ink, width: o.width ?? STYLE.line.normal };
  if (L / 2 > hl) {
    line(g, [-L / 2, 0], [-hl, 0], st);
    line(g, [hl, 0], [L / 2, 0], st);
  }
  drawBody(g, hl, st, body);
  const ports = regPorts(o.F, o.name, p, { a, b, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  return { node: g, ports };
}

export function resistor(p: Parent, a: Point, b: Point, o: TwoTermOpts = {}): SymbolResult {
  return twoTerm(p, a, b, o.len ?? 24, 'resistor', { kind: 'resistor', amp: o.amp ?? 4.5 }, o);
}

export function capacitor(p: Parent, a: Point, b: Point, o: TwoTermOpts = {}): SymbolResult {
  return twoTerm(p, a, b, o.len ?? 6, 'capacitor', { kind: 'capacitor', plate: o.plate ?? 9 }, o);
}

export function inductor(p: Parent, a: Point, b: Point, o: TwoTermOpts = {}): SymbolResult {
  return twoTerm(p, a, b, o.len ?? 28, 'inductor', { kind: 'inductor', turns: o.turns ?? 4 }, o);
}

export function diode(p: Parent, a: Point, b: Point, o: TwoTermOpts = {}): SymbolResult {
  return twoTerm(p, a, b, o.len ?? 12, 'diode', { kind: 'diode', half: o.half ?? 6, open: o.open === true }, o);
}

export function battery(p: Parent, a: Point, b: Point, o: TwoTermOpts = {}): SymbolResult {
  return twoTerm(p, a, b, o.len ?? 6, 'battery', { kind: 'battery' }, o);
}

export function switchSym(p: Parent, a: Point, b: Point, o: TwoTermOpts = {}): SymbolResult {
  return twoTerm(p, a, b, o.len ?? 22, 'switch', { kind: 'switch', closed: o.closed === true }, o);
}

export type GroundOpts = Loose<{ stem: number; w: number; width: number; F: Figure; name: string }>;

export function groundSym(p: Parent, x: number, y: number, o: GroundOpts = {}): SymbolResult {
  const g = el(p, 'g', { 'data-part': 'ground' });
  const st: Paint = { stroke: C.ink, width: o.width ?? STYLE.line.normal };
  const s = o.stem ?? 8;
  const w = o.w ?? 16;
  line(g, [x, y], [x, y + s], st);
  const ks = [1, 0.62, 0.25];
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i] ?? 1;
    line(g, [x - (w / 2) * k, y + s + i * 3.2], [x + (w / 2) * k, y + s + i * 3.2], st);
  }
  return { node: g, ports: regPorts(o.F, o.name, p, { top: [x, y] }) };
}

export function junction(p: Parent, x: number, y: number, o: Loose<{ r: number }> = {}): SVGCircleElement {
  return circle(p, x, y, o.r ?? 2, { fill: C.ink, part: 'junction' });
}

export type WireOpts = Loose<{ width: number; dash: string }>;

export function wire(p: Parent, pts: readonly Point[], o: WireOpts = {}): SVGPolylineElement {
  return polyline(p, pts, { stroke: C.ink, width: o.width ?? STYLE.line.normal, dash: o.dash, join: 'miter', cap: 'square', part: 'wire' });
}

export type OpampOpts = Loose<{ size: number; flip: boolean; width: number; F: Figure; name: string }>;

export function opamp(p: Parent, x: number, y: number, o: OpampOpts = {}): SymbolResult {
  const s = o.size ?? 40;
  const k = o.flip === true ? -1 : 1;
  const g = el(p, 'g', { 'data-part': 'opamp' });
  const st: Paint = { stroke: C.ink, width: o.width ?? STYLE.line.normal };
  polygon(g, [[x, y - s / 2], [x + k * s * 0.87, y], [x, y + s / 2]], { ...st, fill: '#ffffff' });
  const yi = s * 0.25;
  const mx = x + k * 6;
  const m = 2.6;
  line(g, [mx - m, y - yi], [mx + m, y - yi], st);
  line(g, [mx, y - yi - m], [mx, y - yi + m], st);
  line(g, [mx - m, y + yi], [mx + m, y + yi], st);
  const ports = regPorts(o.F, o.name, p, { plus: [x, y - yi], minus: [x, y + yi], out: [x + k * s * 0.87, y] });
  return { node: g, ports };
}
