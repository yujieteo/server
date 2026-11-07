// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Figure, Loose, Parent } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { line } from './draw.ts';
import { at } from './util.ts';
import { C, mathFont } from './qc-base.ts';
import type { QSeg } from './qc-circuit.ts';
import { cnot, gateBox, qcontrol, qmeter, qswap, qtarget, qwire } from './qc-circuit.ts';
import { ket } from './qc-ket.ts';
import { qubit } from './qc-code.ts';

export type WireRef = number | string;
export type WireSpec = Loose<{ id: string; label: string; init: string; dot: string; color: string; classical: boolean; labelColor: string }>;
export type NormWire = WireSpec & { id: string };

export type CircuitGate = { g: 'cnot' | 'cz' | 'link' | 'gate' | 'meter' | 'swap' | 'ctrl' | 'target'; col: number } & Loose<{
  c: WireRef;
  t: WireRef;
  q: WireRef;
  q2: WireRef;
  a: WireRef;
  b: WireRef;
  xt: number;
  color: string;
  label: string;
  w: number;
  rounded: boolean;
  fill: string;
  basis: string;
  basisPos: 'below' | 'inside' | 'none';
  output: number;
}>;

export type CircuitGroup = { from: WireRef } & Loose<{ to: WireRef; label: string; color: string }>;

export type CircuitOpts = Loose<{
  part: string;
  x: number;
  y: number;
  wires: number | readonly WireSpec[];
  cols: number;
  colW: number;
  pitch: number;
  lead: number;
  tail: number;
  gates: readonly CircuitGate[];
  header: string;
  headerLabels: readonly string[];
  dividers: readonly number[];
  activeSpan: boolean;
  groups: readonly CircuitGroup[];
  rounded: boolean;
  gateR: number;
  gateW: number;
  gateH: number;
  meterW: number;
  meterH: number;
  dotR: number;
  dotGap: number;
  dotShadow: boolean | string;
  gateShadow: boolean | string;
  gateFill: string;
  F: Figure;
  name: string;
  active: string;
  idle: string;
  width: number;
  r: number;
  dot: number;
  size: number;
  family: string;
  ketSize: number;
  groupExtend: number;
  groupExtendRight: number;
  groupLabelX: number;
  groupFamily: string;
  groupDividers: boolean;
  groupColor: string;
  groupWidth: number;
  groupDash: string;
  dividerTop: number;
  dividerBottom: number;
  dividerColor: string;
  dividerWidth: number;
  dividerDash: string;
}>;

export interface CircuitOut {
  node: SVGGElement;
  xEnd: number;
  wires: NormWire[];
  half: { cnot: number; cz: number; gate: number; meter: number };
  x: number;
  y: number;
  lead: number;
  colW: number;
  pitch: number;
}

export function wireIndex(wires: readonly NormWire[], q: WireRef | undefined): number {
  if (typeof q === 'number') return q;
  for (let i = 0; i < wires.length; i++) {
    if (at(wires, i).id === q) return i;
  }
  return -1;
}

export function circuitX(c: CircuitOut, col: number): number {
  return c.x + c.lead + (col - 0.5) * c.colW;
}

export function circuitY(c: CircuitOut, q: WireRef | undefined): number {
  return c.y + wireIndex(c.wires, q) * c.pitch;
}

function normWires(spec: number | readonly WireSpec[] | undefined): NormWire[] {
  const raw: WireSpec[] = [];
  if (typeof spec === 'number') {
    for (let i = 0; i < spec; i++) raw.push({});
  } else if (spec !== undefined) raw.push(...spec);
  const out: NormWire[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = at(raw, i);
    out.push({ ...w, id: w.id ?? `q${i}` });
  }
  return out;
}

function touchLists(c: CircuitOut, gates: readonly CircuitGate[]): CircuitGate[][] {
  const touch: CircuitGate[][] = [];
  for (let i = 0; i < c.wires.length; i++) touch.push([]);
  for (const G of gates) {
    for (const q of [G.c, G.t, G.q, G.q2, G.a, G.b]) {
      const i = wireIndex(c.wires, q);
      if (q !== undefined && i >= 0) at(touch, i).push(G);
    }
  }
  return touch;
}

function wireSegments(c: CircuitOut, w: NormWire, touch: readonly CircuitGate[], o: CircuitOpts): QSeg[] {
  if (o.activeSpan !== true || touch.length === 0) return [];
  const xs: number[] = [];
  for (const G of touch) xs.push(circuitX(c, G.col));
  const a = Math.min(...xs);
  const b = Math.max(...xs);
  let lastM = false;
  for (const G of touch) {
    if (G.g === 'meter' && circuitX(c, G.col) === b) lastM = true;
  }
  const first: QSeg = w.init !== undefined ? [c.x, c.x, 'idle'] : [c.x, a, 'idle'];
  const second: QSeg = lastM ? [b, c.xEnd, 'none'] : [b, c.xEnd, 'idle'];
  return [first, second];
}

function wireEnd(c: CircuitOut, i: number, segs: readonly QSeg[], touch: readonly CircuitGate[]): number {
  let out = Infinity;
  for (const G of touch) {
    if (G.g === 'meter' && G.output !== undefined && G.output !== 0 && wireIndex(c.wires, G.q) === i) out = Math.min(out, circuitX(c, G.col));
  }
  if (out !== Infinity) return out;
  for (const s of segs) {
    if (s[2] === 'none') return s[0];
  }
  return c.xEnd;
}

function drawWire(g: SVGGElement, wl: SVGGElement, c: CircuitOut, i: number, touch: readonly CircuitGate[], o: CircuitOpts): void {
  const w = at(c.wires, i);
  const yy = circuitY(c, i);
  const segs = wireSegments(c, w, touch, o);
  const live: QSeg[] = [];
  for (const s of segs) {
    if (s[2] !== 'none') live.push(s);
  }
  const name = o.name !== undefined && o.name !== '' ? `${o.name}.${w.id}` : undefined;
  qwire(wl, c.x, wireEnd(c, i, segs, touch), yy, { segments: live, active: w.color ?? o.active, idle: o.idle, width: o.width, classical: w.classical, F: o.F, name });
  let kx = c.x;
  if (w.dot !== undefined && w.dot !== '') {
    const dr = o.dotR ?? c.pitch * 0.2;
    qubit(g, c.x - dr - (o.dotGap ?? 2.5), yy, dr, w.dot, { filter: o.dotShadow });
    kx = c.x - 2 * dr - (o.dotGap ?? 2.5);
  }
  if (w.init !== undefined) kx = ket(g, kx - 1, yy, w.init, { size: o.ketSize, family: o.family }).x0;
  if (w.label !== undefined && w.label !== '') {
    text(g, kx - 1.5, yy, w.label, { anchor: 'end', valign: 'middle', size: o.size ?? STYLE.text.label, family: o.family ?? mathFont(), color: w.labelColor });
  }
}

function drawGroups(g: SVGGElement, wl: SVGGElement, c: CircuitOut, groups: readonly CircuitGroup[], o: CircuitOpts): void {
  const gx0 = c.x - (o.groupExtend ?? c.pitch * 1.2);
  const gx1 = c.xEnd + (o.groupExtendRight ?? 2);
  for (let k = 0; k < groups.length; k++) {
    const G = at(groups, k);
    const a = wireIndex(c.wires, G.from);
    const b = wireIndex(c.wires, G.to ?? G.from);
    const ym = (circuitY(c, a) + circuitY(c, b)) / 2;
    if (G.label !== undefined && G.label !== '') {
      text(g, o.groupLabelX ?? gx0 - 1.5, ym, G.label, { anchor: 'end', valign: 'middle', size: o.size ?? STYLE.text.label, family: o.groupFamily ?? STYLE.font.family, color: G.color });
    }
    const nx = groups[k + 1];
    if (nx !== undefined && o.groupDividers !== false) {
      const yd = (circuitY(c, b) + circuitY(c, wireIndex(c.wires, nx.from))) / 2;
      line(wl, [gx0, yd], [gx1, yd], { stroke: o.groupColor ?? C.ink, width: o.groupWidth ?? STYLE.line.thin, dash: o.groupDash ?? '2 1.6', cap: 'butt', part: 'group-divider' });
    }
  }
}

function drawLink(gl: SVGGElement, c: CircuitOut, G: CircuitGate, o: CircuitOpts): void {
  const xc = circuitX(c, G.col);
  const ci = wireIndex(c.wires, G.c);
  const ti = wireIndex(c.wires, G.t);
  const kind = G.g === 'cnot' ? 'x' : 'z';
  cnot(gl, xc, circuitY(c, ci), circuitY(c, ti), {
    color: G.color ?? o.active,
    width: o.width,
    r: o.r,
    dot: o.dot,
    kind,
    xTarget: G.xt !== undefined ? circuitX(c, G.xt) : undefined,
  });
  if (o.F !== undefined && o.name !== undefined && o.name !== '') {
    o.F.drew(`${o.name}.${at(c.wires, ci).id}.in`, `${o.name}.${at(c.wires, ti).id}.in`, G.g === 'cnot' ? 'cnot' : 'cz');
  }
}

function drawGate(gl: SVGGElement, c: CircuitOut, G: CircuitGate, o: CircuitOpts): void {
  const xc = circuitX(c, G.col);
  const y2 = G.q2 !== undefined ? circuitY(c, G.q2) : undefined;
  if (G.g === 'cnot' || G.g === 'cz' || G.g === 'link') drawLink(gl, c, G, o);
  else if (G.g === 'gate') {
    gateBox(gl, xc, circuitY(c, G.q), G.label ?? '', {
      w: G.w ?? o.gateW, h: o.gateH, y2, size: o.size, family: o.family, stroke: G.color, rounded: G.rounded ?? o.rounded, r: o.gateR, filter: o.gateShadow, fill: G.fill ?? o.gateFill,
    });
  } else if (G.g === 'meter') {
    qmeter(gl, xc, circuitY(c, G.q), { w: o.meterW, h: o.meterH, y2, basis: G.basis, basisPos: G.basisPos, family: o.family, stroke: G.color, output: G.output });
  } else if (G.g === 'swap') qswap(gl, xc, circuitY(c, G.a), circuitY(c, G.b), { color: G.color, width: o.width });
  else if (G.g === 'ctrl') qcontrol(gl, xc, circuitY(c, G.q), { color: G.color ?? o.active, width: o.width, r: o.r });
  else qtarget(gl, xc, circuitY(c, G.q), { color: G.color ?? o.active, width: o.width, r: o.r });
}

function drawDecor(g: SVGGElement, c: CircuitOut, o: CircuitOpts): void {
  const yTop = circuitY(c, 0) - c.pitch * 0.6;
  const yBot = circuitY(c, c.wires.length - 1) + c.pitch * 0.6;
  for (const d of o.dividers ?? []) {
    const xd = c.x + c.lead + d * c.colW;
    line(g, [xd, o.dividerTop ?? yTop], [xd, o.dividerBottom ?? yBot], { stroke: o.dividerColor ?? C.blue, width: o.dividerWidth ?? STYLE.line.thin, dash: o.dividerDash, cap: 'butt', part: 'divider' });
  }
  if (o.header === undefined) return;
  const hy = yTop - 1.5;
  const size = o.size ?? STYLE.text.label;
  const family = o.family ?? mathFont();
  const labs: string[] = [];
  if (o.headerLabels !== undefined) labs.push(...o.headerLabels);
  else for (let i = 0; i < (o.cols ?? 1); i++) labs.push(String(i + 1));
  if (o.header !== '') text(g, circuitX(c, 1) - c.colW * 0.6, hy, o.header, { anchor: 'end', size, family });
  for (let i = 0; i < labs.length; i++) text(g, circuitX(c, i + 1), hy, at(labs, i), { anchor: 'middle', size, family });
}

export function circuit(p: Parent, o: CircuitOpts = {}): CircuitOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'circuit' });
  const x = o.x ?? 0;
  const colW = o.colW ?? 12;
  const lead = o.lead ?? colW * 0.6;
  const xEnd = x + lead + (o.cols ?? 1) * colW + (o.tail ?? colW * 0.6);
  const half = { cnot: o.r ?? 3.2, cz: o.dot ?? 1.3, gate: (o.gateW ?? 8) / 2, meter: (o.meterW ?? 9) / 2 };
  const c: CircuitOut = { node: g, xEnd, wires: normWires(o.wires), half, x, y: o.y ?? 0, lead, colW, pitch: o.pitch ?? 10 };
  const gates = o.gates ?? [];
  const touch = touchLists(c, gates);
  const wl = el(g, 'g', { 'data-part': 'wires' });
  const gl = el(g, 'g', { 'data-part': 'gates' });
  for (let i = 0; i < c.wires.length; i++) drawWire(g, wl, c, i, at(touch, i), o);
  if (o.groups !== undefined) drawGroups(g, wl, c, o.groups, o);
  for (const G of gates) drawGate(gl, c, G, o);
  drawDecor(g, c, o);
  return c;
}
