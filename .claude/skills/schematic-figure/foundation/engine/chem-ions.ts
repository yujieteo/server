// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Dash, Loose, Parent, Point } from './types.ts';
import { STYLE } from './style.ts';
import { el } from './core.ts';
import { circle, line, path, polyline } from './draw.ts';
import { f3, unit } from './util.ts';
import { C, INK, chemText, defsOf, gOf, rad } from './chem-text.ts';
import { barbHead } from './chem-arrows.ts';

export type IonOpts = Loose<{
  r: number;
  label: string;
  fill: string;
  stroke: string;
  width: number;
  size: number;
  color: string;
  weight: string | number;
  formula: boolean;
  part: string;
}>;

export function ion(p: Parent, x: number, y: number, o: IonOpts = {}): { node: SVGGElement; r: number } {
  const g = gOf(p, o.part ?? 'ion');
  const r = o.r ?? 4;
  circle(g.node, x, y, r, { fill: o.fill ?? '#F3F3F3', stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.thin });
  if (o.label !== undefined && o.label !== '') {
    chemText(g.node, x, y, o.label, { size: o.size ?? Math.min(STYLE.text.label, r * 1.25), anchor: 'middle', valign: 'middle', color: o.color, weight: o.weight, formula: o.formula });
  }
  return { node: g.node, r };
}

export type SolventOpts = Loose<{ r: number; fill: string; stroke: string; width: number }>;
export type SolvatedOpts = Loose<{ ion: IonOpts | null; n: number; shell: number; start: number; solvent: SolventOpts }>;

export function solvated(p: Parent, x: number, y: number, o: SolvatedOpts = {}): { node: SVGGElement; at: Point[] } {
  const g = gOf(p, 'solvated-ion');
  const ir = o.ion === null ? 0 : (o.ion?.r ?? 4);
  const so: SolventOpts = o.solvent ?? {};
  const sr = so.r ?? (ir !== 0 ? ir * 0.5 : 2);
  const n = o.n ?? 6;
  const R = o.shell ?? ir + sr * 1.2;
  const centres: Point[] = [];
  for (let k = 0; k < n; k++) {
    const a = rad((o.start ?? 0) + (360 * k) / n);
    const q: Point = [x + R * Math.cos(a), y + R * Math.sin(a)];
    centres.push(q);
    circle(g.node, q[0], q[1], sr, { fill: so.fill ?? '#F3F3F3', stroke: so.stroke ?? INK, width: so.width ?? STYLE.line.thin, part: 'solvent' });
  }
  if (o.ion !== null) ion(g.node, x, y, { ...o.ion, r: ir });
  return { node: g.node, at: centres };
}

export type StippleOpts = Loose<{ pitch: number; r: number; color: string; bg: string; hex: boolean; x: number; y: number }>;

let pid = 0;

export function stipple(p: Parent, o: StippleOpts = {}): string {
  pid += 1;
  const id = `chst${pid}`;
  const pitch = o.pitch ?? 1.4;
  const r = o.r ?? 0.22;
  const hex = o.hex !== false;
  const H = hex ? pitch * 2 : pitch;
  const col = o.color ?? C.mid;
  const pat = el(defsOf(p), 'pattern', { id, width: f3(pitch), height: f3(H), patternUnits: 'userSpaceOnUse', x: o.x ?? 0, y: o.y ?? 0 });
  if (o.bg !== undefined && o.bg !== '') el(pat, 'rect', { x: 0, y: 0, width: f3(pitch), height: f3(H), fill: o.bg });
  const dots: Point[] = hex ? [[pitch / 2, pitch / 2], [0, pitch * 1.5], [pitch, pitch * 1.5]] : [[pitch / 2, pitch / 2]];
  for (const [cx, cy] of dots) el(pat, 'circle', { cx: f3(cx), cy: f3(cy), r, fill: col });
  return `url(#${id})`;
}

export type SpanOpts = Loose<{
  label: string;
  size: number;
  labelColor: string;
  formula: boolean;
  labelAt: number;
  pad: number;
  ends: 'both' | 'start' | 'end';
  head: 'open' | 'barb';
  len: number;
  half: number;
  dash: false | Dash;
  width: number;
  color: string;
  tick: number | readonly [number, number];
}>;

interface SpanCtx {
  g: SVGGElement;
  col: string;
  lw: number;
  Lh: number;
  Hh: number;
  head: 'open' | 'barb';
  half: number | undefined;
}

function spanHead(c: SpanCtx, tip: Point, u: Point): void {
  if (c.head === 'barb') {
    barbHead(c.g, tip, u, { len: c.Lh, half: c.half, color: c.col });
    return;
  }
  const d = `M${f3(tip[0] - u[0] * c.Lh + u[1] * c.Hh)},${f3(tip[1] - u[1] * c.Lh - u[0] * c.Hh)} L${f3(tip[0])},${f3(tip[1])} L${f3(tip[0] - u[0] * c.Lh - u[1] * c.Hh)},${f3(tip[1] - u[1] * c.Lh + u[0] * c.Hh)}`;
  path(c.g, d, { stroke: c.col, width: c.lw * 1.1, join: 'miter', cap: 'butt', part: 'span-head' });
}

function spanSegments(g: SVGGElement, a: Point, b: Point, A0: Point, B0: Point, u: Point, o: SpanOpts): (readonly [Point, Point])[] {
  if (o.label === undefined || o.label === '') return [[A0, B0]];
  const m = o.labelAt ?? 0.5;
  const M: Point = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m];
  const t = chemText(g, M[0], M[1], o.label, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor ?? INK, formula: o.formula });
  const bb = t.getBBox();
  const ext = (Math.abs(u[0]) * bb.width + Math.abs(u[1]) * bb.height) / 2 + (o.pad ?? 1.5);
  return [[A0, [M[0] - u[0] * ext, M[1] - u[1] * ext]], [[M[0] + u[0] * ext, M[1] + u[1] * ext], B0]];
}

function spanTicks(c: SpanCtx, a: Point, b: Point, n: Point, tick: number | readonly [number, number]): void {
  const t0 = typeof tick === 'number' ? tick / 2 : tick[0];
  const t1 = typeof tick === 'number' ? tick / 2 : tick[1];
  for (const q of [a, b]) line(c.g, [q[0] - n[0] * t0, q[1] - n[1] * t0], [q[0] + n[0] * t1, q[1] + n[1] * t1], { stroke: c.col, width: c.lw * 1.1, cap: 'butt' });
}

export function spanArrow(p: Parent, a: Point, b: Point, o: SpanOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'span-arrow');
  const col = o.color ?? C.mid;
  const lw = o.width ?? STYLE.line.thin;
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
  const Lh = o.len ?? 2.4;
  const ends = o.ends ?? 'both';
  const head = o.head ?? 'open';
  const hasS = ends === 'both' || ends === 'start';
  const hasE = ends === 'both' || ends === 'end';
  const dash = o.dash === undefined ? [1.1, 0.8] : (o.dash === false || o.dash === '' ? undefined : o.dash);
  const trim = head === 'barb' ? Lh * 0.75 : 0;
  const A0: Point = hasS ? [a[0] + ux * trim, a[1] + uy * trim] : a;
  const B0: Point = hasE ? [b[0] - ux * trim, b[1] - uy * trim] : b;
  const c: SpanCtx = { g: g.node, col, lw, Lh, Hh: o.half ?? Lh * 0.58, head, half: o.half };
  for (const [s, e] of spanSegments(g.node, a, b, A0, B0, [ux, uy], o)) line(g.node, s, e, { stroke: col, width: lw, dash, cap: 'butt', part: 'span-shaft' });
  if (hasE) spanHead(c, b, [ux, uy]);
  if (hasS) spanHead(c, a, [-ux, -uy]);
  if (o.tick !== undefined && o.tick !== 0) spanTicks(c, a, b, [-uy, ux], o.tick);
  return { node: g.node };
}

export type ChargeRowOpts = Loose<{ n: number; sign: '-' | '+'; len: number; width: number; color: string }>;

export function chargeRow(p: Parent, a: Point, b: Point, o: ChargeRowOpts = {}): { node: SVGGElement; at: Point[] } {
  const g = gOf(p, 'charge-row');
  const n = o.n ?? 8;
  const h = (o.len ?? 3) / 2;
  const col = o.color ?? INK;
  const w = o.width ?? STYLE.line.normal * 1.3;
  const marks: Point[] = [];
  for (let k = 0; k < n; k++) {
    const t = n > 1 ? k / (n - 1) : 0.5;
    const q: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    marks.push(q);
    line(g.node, [q[0] - h, q[1]], [q[0] + h, q[1]], { stroke: col, width: w, cap: 'butt' });
    if (o.sign === '+') line(g.node, [q[0], q[1] - h], [q[0], q[1] + h], { stroke: col, width: w, cap: 'butt' });
  }
  return { node: g.node, at: marks };
}

export type CheckOpts = Loose<{ kind: 'check' | 'cross'; size: number; color: string; width: number }>;

export function checkMark(p: Parent, x: number, y: number, o: CheckOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'check-mark');
  const s = o.size ?? 5;
  const col = o.color ?? (o.kind === 'cross' ? INK : C.green);
  const w = o.width ?? s * 0.14;
  if (o.kind === 'cross') {
    const c = s * 0.36;
    line(g.node, [x - c, y - c], [x + c, y + c], { stroke: col, width: w });
    line(g.node, [x - c, y + c], [x + c, y - c], { stroke: col, width: w });
  } else polyline(g.node, [[x - s * 0.42, y + s * 0.02], [x - s * 0.12, y + s * 0.34], [x + s * 0.46, y - s * 0.4]], { stroke: col, width: w, join: 'round' });
  return { node: g.node };
}
