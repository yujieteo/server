// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Dash, Figure, Loose, Paint, Parent, Point } from './types.ts';
import { STYLE } from './style.ts';
import { line, path, polygon, polyline, rect, smooth } from './draw.ts';
import { at, f3, unit } from './util.ts';
import { C, INK, chemText, gOf, rad } from './chem-text.ts';
import type { ChemTextOpts } from './chem-text.ts';
import type { AtomTuple, BondTuple, MolResult } from './chem-mol-types.ts';
import { molecule } from './chem-mol.ts';
import { barbHead } from './chem-arrows.ts';
import type { BarbOpts, RelPair } from './chem-arrows.ts';

export type ReactionKind = 'forward' | 'equilibrium' | 'retro' | 'resonance' | 'none';
export type Conditions = string | readonly string[];

export type ReactionOpts = Loose<{
  kind: ReactionKind;
  above: Conditions;
  below: Conditions;
  size: number;
  gap: number;
  labelAt: number;
  labelColor: string;
  formula: boolean;
  lineGap: number;
  sep: number;
  back: number;
  cross: boolean;
  crossSize: number;
  len: number;
  half: number;
  notch: number;
  width: number;
  color: string;
  dash: Dash;
  part: string;
  F: Figure;
  rel: RelPair;
}>;

interface ArrowGeom {
  ux: number;
  uy: number;
  U: Point;
}

function shiftPt(ar: ArrowGeom, q: Point, d: number, s: number = 0): Point {
  return [q[0] + ar.ux * d + ar.U[0] * s, q[1] + ar.uy * d + ar.U[1] * s];
}

function ptStr(q: Point): string {
  return `${f3(q[0])},${f3(q[1])}`;
}

interface ArrowCtx {
  g: SVGGElement;
  ar: ArrowGeom;
  col: string;
  lw: number;
  len: number;
  dash: Dash | undefined;
  hs: BarbOpts;
  su: number;
}

function shaft(c: ArrowCtx, a: Point, b: Point): void {
  line(c.g, a, b, { stroke: c.col, width: c.lw, cap: 'butt', dash: c.dash, part: 'arrow-shaft' });
}

function equilibriumShape(c: ArrowCtx, from: Point, to: Point, o: ReactionOpts): number {
  const { ar, len, hs, su } = c;
  const sep = o.sep ?? 2.4;
  const Lt = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const cut = (Lt * (1 - (o.back ?? 1))) / 2;
  const a1 = shiftPt(ar, to, 0, sep / 2);
  const b1 = shiftPt(ar, from, cut, -sep / 2);
  shaft(c, shiftPt(ar, from, 0, sep / 2), shiftPt(ar, a1, -len * 0.75));
  barbHead(c.g, a1, [ar.ux, ar.uy], { ...hs, side: su });
  shaft(c, shiftPt(ar, to, -cut, -sep / 2), shiftPt(ar, b1, len * 0.75));
  barbHead(c.g, b1, [-ar.ux, -ar.uy], { ...hs, side: su });
  return sep / 2;
}

function retroShape(c: ArrowCtx, from: Point, to: Point, o: ReactionOpts): number {
  const { ar, len } = c;
  const sep = o.sep ?? 2.6;
  const H = sep / 2 + (o.half ?? len * 0.45);
  const Lh = H * 1.25;
  for (const s of [1, -1]) shaft(c, shiftPt(ar, from, 0, (s * sep) / 2), shiftPt(ar, to, (-Lh * (sep / 2)) / H, (s * sep) / 2));
  path(c.g, `M${ptStr(shiftPt(ar, to, -Lh, H))} L${ptStr(to)} L${ptStr(shiftPt(ar, to, -Lh, -H))}`, { stroke: c.col, width: c.lw, join: 'miter', cap: 'butt', part: 'arrowhead' });
  return sep / 2;
}

function plainShape(c: ArrowCtx, from: Point, to: Point, kind: ReactionKind): void {
  const { ar, len, hs } = c;
  const hasEnd = kind !== 'none';
  const hasStart = kind === 'resonance';
  shaft(c, hasStart ? shiftPt(ar, from, len * 0.75, 0) : from, hasEnd ? shiftPt(ar, to, -len * 0.75, 0) : to);
  if (hasEnd) barbHead(c.g, to, [ar.ux, ar.uy], hs);
  if (hasStart) barbHead(c.g, from, [-ar.ux, -ar.uy], hs);
}

function conditionText(g: SVGGElement, str: Conditions | undefined, s: number, M: Point, ext: number, ar: ArrowGeom, o: ReactionOpts): void {
  if (str === undefined || str === '') return;
  const size = o.size ?? STYLE.text.label;
  const gap = o.gap ?? size * 0.4;
  const V: Point = [ar.U[0] * s, ar.U[1] * s];
  const q: Point = [M[0] + V[0] * (ext + gap), M[1] + V[1] * (ext + gap)];
  const vert = Math.abs(V[1]) >= Math.abs(V[0]);
  const anchor = vert ? 'middle' : V[0] < 0 ? 'end' : 'start';
  const valign = vert ? (V[1] < 0 ? 'bottom' : 'top') : 'middle';
  chemText(g, q[0], q[1], typeof str === 'string' ? str : str.join('\n'), { size, anchor, valign, color: o.labelColor, formula: o.formula, lineGap: o.lineGap });
}

export interface ReactionResult {
  node: SVGGElement;
  mid: Point;
  up: Point;
}

export function reactionArrow(p: Parent, from: Point, to: Point, o: ReactionOpts = {}): ReactionResult {
  const g = gOf(p, o.part ?? 'reaction-arrow');
  const col = o.color ?? INK;
  const len = o.len ?? 4.2;
  const kind = o.kind ?? 'forward';
  const [ux, uy] = unit(to[0] - from[0], to[1] - from[1]);
  const lx = uy;
  const ly = -ux;
  const su = ly < -1e-9 || (Math.abs(ly) < 1e-9 && lx < 0) ? 1 : -1;
  const ar: ArrowGeom = { ux, uy, U: [lx * su, ly * su] };
  const c: ArrowCtx = { g: g.node, ar, col, lw: o.width ?? STYLE.line.normal, len, dash: o.dash, hs: { len, half: o.half, notch: o.notch, color: col }, su };
  let ext = 0;
  if (kind === 'equilibrium') ext = equilibriumShape(c, from, to, o);
  else if (kind === 'retro') ext = retroShape(c, from, to, o);
  else plainShape(c, from, to, kind);
  const m = o.labelAt ?? 0.5;
  const M: Point = [from[0] + (to[0] - from[0]) * m, from[1] + (to[1] - from[1]) * m];
  if (o.cross === true) {
    const cs = o.crossSize ?? 2.4;
    for (const s of [1, -1]) line(g.node, [M[0] - cs, M[1] - cs * s], [M[0] + cs, M[1] + cs * s], { stroke: col, width: c.lw });
  }
  conditionText(g.node, o.above, 1, M, ext, ar, o);
  conditionText(g.node, o.below, -1, M, ext, ar, o);
  if (o.F !== undefined && o.rel !== undefined) o.F.drew(o.rel[0], o.rel[1], o.kind === 'equilibrium' ? 'equilibrium' : 'flow');
  return { node: g.node, mid: M, up: ar.U };
}

export type BracketsOpts = Loose<{
  shape: 'square' | 'round';
  tick: number;
  width: number;
  color: string;
  sup: string;
  sub: string;
  size: number;
  labelColor: string;
  formula: boolean;
}>;

export function brackets(p: Parent, x: number, y: number, w: number, h: number, o: BracketsOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'brackets');
  const t = o.tick ?? Math.max(1.2, Math.min(3, h * 0.08));
  const st: Paint = { stroke: o.color ?? INK, width: o.width ?? STYLE.line.normal, cap: 'butt', join: 'miter' };
  const sides: readonly (readonly [number, number])[] = [[x, 1], [x + w, -1]];
  for (const [xx, s] of sides) {
    if (o.shape === 'round') path(g.node, `M${f3(xx + s * t)},${f3(y)} Q${f3(xx - s * t)},${f3(y + h / 2)} ${f3(xx + s * t)},${f3(y + h)}`, st);
    else polyline(g.node, [[xx + s * t, y], [xx, y], [xx, y + h], [xx + s * t, y + h]], st);
  }
  const lo: ChemTextOpts = { size: o.size ?? STYLE.text.label, anchor: 'start', valign: 'middle', color: o.labelColor, formula: o.formula };
  if (o.sup !== undefined && o.sup !== '') chemText(g.node, x + w + 0.8, y, o.sup, lo);
  if (o.sub !== undefined && o.sub !== '') chemText(g.node, x + w + 0.8, y + h, o.sub, lo);
  return { node: g.node };
}

export type RepeatOpts = Loose<{
  n: string | null | false;
  at: number;
  span: number;
  h: number;
  bow: number;
  size: number;
  width: number;
  color: string;
  halo: boolean | string;
}>;

export function repeatBracket(p: Parent, a: Point, b: Point, o: RepeatOpts = {}): { node: SVGGElement } {
  const g = gOf(p, 'repeat-bracket');
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
  const Lb = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const frac = o.at ?? 0.5;
  const span = o.span ?? Lb * 0.45;
  const h = o.h ?? Lb * 0.4;
  const bow = o.bow ?? h * 0.3;
  const col = o.color ?? INK;
  let n: Point = [-uy, ux];
  if (n[1] < -1e-9 || (Math.abs(n[1]) < 1e-9 && n[0] < 0)) n = [-n[0], -n[1]];
  const m: Point = [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  let end: Point = m;
  for (const s of [-1, 1]) {
    const c: Point = [m[0] + (ux * s * span) / 2, m[1] + (uy * s * span) / 2];
    const d = `M${f3(c[0] - n[0] * h)},${f3(c[1] - n[1] * h)} Q${f3(c[0] + ux * s * bow * 2)},${f3(c[1] + uy * s * bow * 2)} ${f3(c[0] + n[0] * h)},${f3(c[1] + n[1] * h)}`;
    path(g.node, d, { stroke: col, width: o.width ?? STYLE.line.normal, part: 'bracket' });
    end = c;
  }
  const size = o.size ?? STYLE.text.label;
  if (o.n !== null && o.n !== false) {
    const tx = end[0] + n[0] * h * 0.85 + ux * (bow + size * 0.2);
    const ty = end[1] + n[1] * h * 0.85 + uy * (bow + size * 0.2);
    chemText(g.node, tx, ty, o.n ?? 'n', { size, anchor: ux < -0.3 ? 'end' : 'start', valign: 'middle', color: col, halo: o.halo });
  }
  return { node: g.node };
}

export type SchemeBoxOpts = Loose<{
  size: number;
  weight: string | number;
  textColor: string;
  color: string;
  width: number;
  pad: number;
  inset: number;
  r: number;
  fill: string;
  formula: boolean;
}>;

function framePath(x: number, y: number, w: number, h: number, r: number, a: number, c: number): string {
  return `M${f3(c)},${f3(y)} H${f3(x + w - r)} Q${f3(x + w)},${f3(y)} ${f3(x + w)},${f3(y + r)} V${f3(y + h - r)} Q${f3(x + w)},${f3(y + h)} ${f3(x + w - r)},${f3(y + h)}`
    + ` H${f3(x + r)} Q${f3(x)},${f3(y + h)} ${f3(x)},${f3(y + h - r)} V${f3(y + r)} Q${f3(x)},${f3(y)} ${f3(x + r)},${f3(y)} H${f3(a)}`;
}

export function schemeBox(p: Parent, x: number, y: number, w: number, h: number, title: string, o: SchemeBoxOpts = {}): { node: SVGGElement; title: SVGTextElement | null } {
  const g = gOf(p, 'scheme-box');
  const size = o.size ?? STYLE.text.title;
  const r = o.r ?? 0;
  const pad = o.pad ?? size * 0.3;
  if (o.fill !== undefined && o.fill !== '') rect(g.node, x, y, w, h, { fill: o.fill, r });
  const t = title === '' ? null : chemText(g.node, x + (o.inset ?? size * 1.2), y, title, { size, weight: o.weight, color: o.textColor ?? INK, anchor: 'start', valign: 'middle', formula: o.formula });
  const bb = t === null ? null : t.getBBox();
  const a = bb === null ? x + r : bb.x - pad;
  const c = bb === null ? x + r : bb.x + bb.width + pad;
  const fr = path(g.node, framePath(x, y, w, h, r, a, c), { stroke: o.color ?? C.light, width: o.width ?? STYLE.line.bold, cap: 'butt', join: 'miter', part: 'frame' });
  if (t !== null) g.node.insertBefore(fr, t);
  return { node: g.node, title: t };
}

export type OutlineOpts = Loose<{ width: number; head: number; headWidth: number; stroke: string; lw: number; fill: string }>;

export function outlineArrow(p: Parent, from: Point, to: Point, o: OutlineOpts = {}): SVGPolygonElement {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const width = o.width ?? 6;
  const head = o.head ?? 8;
  const hw = (o.headWidth ?? width * 1.9) / 2;
  const w = width / 2;
  const [ux, uy] = unit(x1 - x0, y1 - y0);
  const nx = -uy;
  const ny = ux;
  const bx = x1 - ux * head;
  const by = y1 - uy * head;
  const pts: Point[] = [[x0 + nx * w, y0 + ny * w], [bx + nx * w, by + ny * w], [bx + nx * hw, by + ny * hw], [x1, y1],
    [bx - nx * hw, by - ny * hw], [bx - nx * w, by - ny * w], [x0 - nx * w, y0 - ny * w]];
  return polygon(p, pts, { fill: o.fill ?? C.paper, stroke: o.stroke ?? INK, width: o.lw ?? STYLE.line.normal, join: 'miter', part: 'outline-arrow' });
}

export type RingOpts = Loose<{
  label: string;
  labelColor: string;
  weight: string | number;
  size: number;
  bond: number;
  dir: number;
  spread: number;
  depth: number;
  lw: number;
  color: string;
  dash: Dash;
  F: Figure;
  name: string;
}>;

export interface RingResult {
  node: SVGGElement;
  apex: Point;
  ends: [Point, Point];
  pos: Point[];
}

function ringFrame(d: Point, n: Point, u: number, v: number): Point {
  return [u * d[0] + v * n[0], u * d[1] + v * n[1]];
}

export function partialRing(p: Parent, x: number, y: number, o: RingOpts = {}): RingResult {
  const size = o.size ?? STYLE.text.label;
  const b = o.bond ?? size * 1.75;
  const dir = o.dir ?? 90;
  const sp = o.spread ?? 45;
  const d: Point = [Math.cos(rad(dir)), Math.sin(rad(dir))];
  const n: Point = [-d[1], d[0]];
  const cs = Math.cos(rad(sp));
  const sn = Math.sin(rad(sp));
  const e1 = ringFrame(d, n, cs, -sn);
  const e2 = ringFrame(d, n, cs, sn);
  const g = gOf(p, 'partial-ring');
  const labelled = o.label !== undefined && o.label !== '';
  const atoms: AtomTuple[] = [[labelled ? 'X' : 'C', 0, 0], ['C', e1[0], e1[1]], ['C', e2[0], e2[1]]];
  const bonds: BondTuple[] = [[0, 1, 1], [0, 2, 1]];
  const m: MolResult = molecule(g.node, { atoms, bonds }, { at: [x, y], anchor: 0, bond: b, size, lw: o.lw, color: o.color, F: o.F, name: o.name,
    labels: labelled ? { 0: { t: o.label ?? '', color: o.labelColor, weight: o.weight } } : undefined });
  const Dp = o.depth ?? cs + 0.68;
  const um = (cs + Dp) / 2 + 0.12;
  const vm = sn * 0.85;
  const raw: readonly (readonly [number, number])[] = [[cs, -sn], [um, -vm], [Dp, 0], [um, vm], [cs, sn]];
  const pts: Point[] = [];
  for (const [u, v] of raw) {
    const q = ringFrame(d, n, u, v);
    pts.push([x + q[0] * b, y + q[1] * b]);
  }
  path(g.node, smooth(pts, false, 0.5), { stroke: o.color ?? INK, width: o.lw ?? STYLE.line.normal, dash: o.dash ?? [f3(b * 0.11), f3(b * 0.09)], cap: 'butt', part: 'dashed-ring' });
  return { node: g.node, apex: [x, y], ends: [at(pts, 0), at(pts, 4)], pos: m.pos };
}
