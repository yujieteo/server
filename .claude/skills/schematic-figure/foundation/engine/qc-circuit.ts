// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Figure, Loose, Parent } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, polygon, rect } from './draw.ts';
import { reg } from './cs-base.ts';
import { C, mathFont, shadowOf, sortNums, w0 } from './qc-base.ts';

export type QSeg = readonly [number, number, string];

export type QwireOpts = Loose<{
  part: string;
  segments: readonly QSeg[];
  active: string;
  idle: string;
  width: number;
  base: string;
  classical: boolean;
  gap: number;
  F: Figure;
  name: string;
}>;

function stateAt(base: string, segs: readonly QSeg[], xm: number): string {
  let s = base;
  for (const [a, b, k] of segs) {
    if (xm > Math.min(a, b) && xm < Math.max(a, b)) s = k;
  }
  return s;
}

function cutsOf(x0: number, x1: number, segs: readonly QSeg[]): number[] {
  const raw: number[] = [x0, x1];
  for (const [a, b] of segs) raw.push(a, b);
  const kept: number[] = [];
  for (const v of raw) {
    if (v >= x0 && v <= x1) kept.push(v);
  }
  return sortNums(kept);
}

function wireRun(g: SVGGElement, o: QwireOpts, y: number, a: number, b: number, c: string): void {
  const w = o.width ?? w0();
  if (o.classical === true) {
    const d = o.gap ?? 0.8;
    for (const s of [-1, 1]) line(g, [a, y + s * d], [b, y + s * d], { stroke: c, width: w * 0.8, cap: 'butt', part: 'qwire' });
  } else line(g, [a, y], [b, y], { stroke: c, width: w, cap: 'butt', part: 'qwire' });
}

export function qwire(p: Parent, x0: number, x1: number, y: number, o: QwireOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'qwire' });
  const active = o.active ?? C.ink;
  const idle = o.idle ?? C.light;
  const segs = o.segments ?? [];
  const cuts = cutsOf(x0, x1, segs);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i];
    const b = cuts[i + 1];
    if (a === undefined || b === undefined || b - a <= 1e-6) continue;
    const st = stateAt(o.base ?? 'active', segs, (a + b) / 2);
    wireRun(g, o, y, a, b, st === 'active' ? active : st === 'idle' ? idle : st);
  }
  reg(o.F, o.name, p, { in: [x0, y], out: [x1, y] });
  return g;
}

export type QcontrolOpts = Loose<{ r: number; open: boolean; color: string; width: number }>;

export function qcontrol(p: Parent, x: number, y: number, o: QcontrolOpts = {}): SVGCircleElement {
  const c = o.color ?? C.ink;
  return circle(p, x, y, o.r ?? 1.3, o.open === true ? { fill: '#fff', stroke: c, width: o.width ?? w0() } : { fill: c, part: 'qcontrol' });
}

export type QtargetOpts = Loose<{ r: number; color: string; width: number; fill: string }>;

export function qtarget(p: Parent, x: number, y: number, o: QtargetOpts = {}): SVGGElement {
  const r = o.r ?? 3.2;
  const c = o.color ?? C.ink;
  const w = o.width ?? w0();
  const g = el(p, 'g', { 'data-part': 'qtarget' });
  circle(g, x, y, r, { fill: o.fill ?? '#fff', stroke: c, width: w });
  line(g, [x - r, y], [x + r, y], { stroke: c, width: w, cap: 'butt' });
  line(g, [x, y - r], [x, y + r], { stroke: c, width: w, cap: 'butt' });
  return g;
}

export type CnotOpts = Loose<{
  part: string;
  r: number;
  dot: number;
  width: number;
  color: string;
  xTarget: number;
  open: boolean;
  kind: 'x' | 'z';
  F: Figure;
  name: string;
  from: string;
  to: string;
}>;

export function cnot(p: Parent, x: number, yC: number, yT: number, o: CnotOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cnot' });
  const c = o.color ?? C.ink;
  const w = o.width ?? w0();
  const r = o.r ?? 3.2;
  const xT = o.xTarget ?? x;
  const z = o.kind === 'z';
  const sg = Math.sign(yT - yC);
  const s = sg === 0 || Number.isNaN(sg) ? 1 : sg;
  line(g, [x, yC], [xT, z ? yT : yT + s * r], { stroke: c, width: w, cap: 'butt' });
  if (z) qcontrol(g, xT, yT, { r: o.dot, color: c });
  else qtarget(g, xT, yT, { r, color: c, width: w });
  qcontrol(g, x, yC, { r: o.dot, color: c, open: o.open, width: w });
  if (o.F !== undefined && o.name !== undefined && o.name !== '') {
    reg(o.F, o.name, p, { c: [x, yC], t: [xT, yT] });
    o.F.drew(o.from ?? `${o.name}.c`, o.to ?? `${o.name}.t`, z ? 'cz' : 'cnot');
  }
  return g;
}

export type QswapOpts = Loose<{ part: string; s: number; color: string; width: number }>;

export function qswap(p: Parent, x: number, y1: number, y2: number, o: QswapOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'qswap' });
  const c = o.color ?? C.ink;
  const w = o.width ?? w0();
  const s = (o.s ?? 4) / 2;
  line(g, [x, y1], [x, y2], { stroke: c, width: w, cap: 'butt' });
  for (const y of [y1, y2]) {
    line(g, [x - s, y - s], [x + s, y + s], { stroke: c, width: w });
    line(g, [x - s, y + s], [x + s, y - s], { stroke: c, width: w });
  }
  return g;
}

export type GateBoxOpts = Loose<{
  part: string;
  w: number;
  h: number;
  y2: number;
  r: number;
  rounded: boolean;
  fill: string;
  stroke: string;
  width: number;
  size: number;
  family: string;
  italic: boolean;
  color: string;
  filter: boolean | string;
  shadow: boolean | string;
  F: Figure;
  name: string;
}>;

export function gateBox(p: Parent, x: number, y: number, label: string, o: GateBoxOpts = {}): SVGGElement {
  const w = o.w ?? 8;
  const h = o.h ?? 8;
  const yA = o.y2 !== undefined ? Math.min(y, o.y2) : y;
  const yB = o.y2 !== undefined ? Math.max(y, o.y2) : y;
  const top = yA - h / 2;
  const H = yB - yA + h;
  const ym = (yA + yB) / 2;
  const r = o.r ?? (o.rounded === true ? Math.min(w, h) * 0.28 : undefined);
  const g = el(p, 'g', { 'data-part': o.part ?? 'gate' });
  rect(g, x - w / 2, top, w, H, { fill: o.fill ?? '#fff', stroke: o.stroke ?? C.ink, width: o.width ?? w0(), join: 'miter', r, filter: shadowOf(p, o.filter ?? o.shadow) });
  if (label !== '') text(g, x, ym, label, { anchor: 'middle', valign: 'middle', size: o.size ?? STYLE.text.label, family: o.family ?? mathFont(), italic: o.italic, color: o.color });
  reg(o.F, o.name, p, { left: [x - w / 2, ym], right: [x + w / 2, ym], top: [x, top], bottom: [x, top + H] });
  return g;
}

export type QmeterOpts = Loose<{
  part: string;
  w: number;
  h: number;
  y2: number;
  basis: string;
  basisPos: 'below' | 'inside' | 'none';
  r: number;
  meterY: number;
  needle: number;
  head: number;
  output: number;
  gap: number;
  width: number;
  size: number;
  family: string;
  color: string;
  fill: string;
  stroke: string;
  F: Figure;
  name: string;
}>;

interface MeterGeo {
  x: number;
  y: number;
  h: number;
  hb: number;
  span: number;
  inside: boolean;
  r: number;
  cy: number;
  c: string;
  lw: number;
}

function meterNeedle(g: SVGGElement, m: MeterGeo, o: QmeterOpts): void {
  const ang = ((o.needle ?? 55) * Math.PI) / 180;
  const L = m.r * 1.25;
  const tx = m.x + L * Math.cos(ang);
  const ty = m.cy - L * Math.sin(ang);
  const ux = Math.cos(ang);
  const uy = -Math.sin(ang);
  const hl = o.head ?? Math.max(1.6, m.r * 0.62);
  const hw = hl * 0.5;
  const bx = tx - ux * hl;
  const by = ty - uy * hl;
  line(g, [m.x, m.cy], [bx + ux * hl * 0.3, by + uy * hl * 0.3], { stroke: m.c, width: m.lw, cap: 'butt' });
  polygon(g, [[tx, ty], [bx - uy * hw, by + ux * hw], [bx + uy * hw, by - ux * hw]], { fill: m.c });
}

function meterBasis(g: SVGGElement, m: MeterGeo, basis: string, o: QmeterOpts): void {
  const sz = o.size ?? (m.inside ? Math.max(STYLE.text.min, m.hb * 0.36) : STYLE.text.label);
  const family = o.family ?? mathFont();
  if (m.span !== 0 && m.inside) {
    text(g, m.x, m.cy + m.r * 0.45, basis, { anchor: 'middle', valign: 'top', size: o.size ?? STYLE.text.label, family, color: o.color });
    return;
  }
  const ty = m.inside ? m.y + m.h / 2 - m.h * 0.06 : m.y + m.h / 2 + 1;
  text(g, m.x, ty, basis, { anchor: 'middle', valign: m.inside ? 'bottom' : 'top', size: sz, family, color: o.color });
}

export function qmeter(p: Parent, x: number, y0: number, o: QmeterOpts = {}): SVGGElement {
  const w = o.w ?? 9;
  const hb = o.h ?? 8;
  const c = o.stroke ?? C.ink;
  const lw = o.width ?? w0();
  const span = o.y2 !== undefined ? Math.abs(o.y2 - y0) : 0;
  const h = hb + span;
  const y = o.y2 !== undefined ? (y0 + o.y2) / 2 : y0;
  const g = el(p, 'g', { 'data-part': o.part ?? 'qmeter' });
  if (o.output !== undefined && o.output !== 0) {
    const d = o.gap ?? 0.8;
    for (const s of [-1, 1]) line(g, [x + w / 2, y + s * d], [x + w / 2 + o.output, y + s * d], { stroke: c, width: lw * 0.8, cap: 'butt', part: 'qwire' });
  }
  rect(g, x - w / 2, y - h / 2, w, h, { fill: o.fill ?? '#fff', stroke: c, width: lw, join: 'miter' });
  const hasBasis = o.basis !== undefined && o.basis !== '';
  const inside = hasBasis && (o.basisPos ?? (span !== 0 ? 'inside' : 'below')) === 'inside';
  const r = o.r ?? Math.min(w * 0.36, hb * (inside && span === 0 ? 0.34 : 0.42));
  const cy = o.meterY ?? (span !== 0 ? y - (inside ? r * 0.15 : -r * 0.35) : inside ? y + hb * 0.02 : y + hb * 0.2);
  path(g, `M${x - r},${cy} A${r},${r} 0 0 1 ${x + r},${cy}`, { stroke: c, width: lw, cap: 'butt' });
  const m: MeterGeo = { x, y, h, hb, span, inside, r, cy, c, lw };
  meterNeedle(g, m, o);
  if (o.basis !== undefined && hasBasis && (o.basisPos ?? 'below') !== 'none') meterBasis(g, m, o.basis, o);
  reg(o.F, o.name, p, { left: [x - w / 2, y], right: [x + w / 2, y] });
  return g;
}
