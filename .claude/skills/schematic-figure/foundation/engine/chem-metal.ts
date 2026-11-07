// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Figure, Loose, Parent, Point } from './types.ts';
import { STYLE } from './style.ts';
import { el } from './core.ts';
import { circle, line, path, rect } from './draw.ts';
import { at, f3 } from './util.ts';
import { C, INK, chemText, gOf, measure, plainOf, rad, reg } from './chem-text.ts';
import type { Mol, MolOpts, MolResult } from './chem-mol-types.ts';
import { normMol } from './chem-mol-types.ts';
import { molecule } from './chem-mol.ts';

export type LigandSpec = MolOpts & { mol: Mol; attach: number; dir: number; gap?: number | undefined };
export interface ExtraSpec {
  t: string;
  dir: number;
  len?: number | undefined;
  formula?: boolean | undefined;
}
export type MetalOpts = Loose<{
  metal: string;
  size: number;
  color: string;
  weight: string | number;
  gap: number;
  formula: boolean;
  ligands: readonly LigandSpec[];
  extras: readonly ExtraSpec[];
  bondWidth: number;
  F: Figure;
  name: string;
}>;

export interface AttachGeom {
  x: number;
  y: number;
  kw: number;
  fullW: number;
  capH: number;
  gap0: number;
}
export interface MetalResult {
  node: SVGGElement;
  geom: AttachGeom;
  box: { x: number; y: number; w: number; h: number };
  ligands: MolResult[];
}

function rayHit(ux: number, uy: number, hx: number, hy: number): number {
  return Math.min(Math.abs(ux) > 1e-9 ? hx / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hy / Math.abs(uy) : Infinity);
}

export function metalAttach(m: MetalResult, dir: number, gap: number = m.geom.gap0): Point {
  const { x, y, kw, fullW, capH } = m.geom;
  const ux = Math.cos(rad(dir));
  const uy = Math.sin(rad(dir));
  const t = rayHit(ux, uy, (ux > 0 ? fullW - kw / 2 : kw / 2) + gap, capH / 2 + gap);
  return [x + ux * t, y + uy * t];
}

function symbolOf(s: string): string {
  return s.match(/^[A-Z][a-z]?/)?.[0] ?? s;
}

function drawExtra(g: SVGGElement, m: MetalResult, ex: ExtraSpec, o: MetalOpts, size: number): void {
  const { capH, gap0 } = m.geom;
  const s = metalAttach(m, ex.dir);
  const len = ex.len ?? size * 1.75;
  const ux = Math.cos(rad(ex.dir));
  const uy = Math.sin(rad(ex.dir));
  const ew = measure(g, symbolOf(ex.t), size);
  const rr = rayHit(ux, uy, ew / 2 + gap0, capH / 2 + gap0);
  const c: Point = [s[0] + ux * (len + rr), s[1] + uy * (len + rr)];
  line(g, s, [s[0] + ux * len, s[1] + uy * len], { stroke: o.color ?? INK, width: o.bondWidth ?? STYLE.line.normal });
  const anchor = ux < -0.5 ? 'end' : ux > 0.5 ? 'start' : 'middle';
  const ax = anchor === 'end' ? c[0] + ew / 2 : anchor === 'start' ? c[0] - ew / 2 : c[0];
  chemText(g, ax, c[1] + capH / 2, ex.t, { size, color: o.color ?? INK, anchor, formula: ex.formula });
}

export function metalCenter(p: Parent, x: number, y: number, label: string, o: MetalOpts = {}): MetalResult {
  const g = gOf(p, 'metal-center');
  const size = o.size ?? STYLE.text.label;
  const capH = size * 0.716;
  const metal = o.metal ?? symbolOf(plainOf(label));
  const kw = measure(g.node, metal, size, o.weight);
  const lt = chemText(g.node, x - kw / 2, y + capH / 2, label, { size, color: o.color ?? INK, weight: o.weight, anchor: 'start', formula: o.formula });
  const fullW = lt.getBBox().width;
  const geom: AttachGeom = { x, y, kw, fullW, capH, gap0: o.gap ?? size * 0.2 };
  const m: MetalResult = { node: g.node, geom, box: { x: x - kw / 2, y: y - capH / 2, w: fullW, h: capH }, ligands: [] };
  for (const lg of o.ligands ?? []) {
    const nbr = at(at(normMol(lg.mol).nb, lg.attach), 0);
    m.ligands.push(molecule(g.node, lg.mol, { size, lw: o.bondWidth, color: o.color, ...lg, at: metalAttach(m, lg.dir, lg.gap), anchor: lg.attach, orient: [lg.attach, nbr, lg.dir] }));
  }
  for (const ex of o.extras ?? []) drawExtra(g.node, m, ex, o, size);
  reg(o.F, o.name, p, { center: [x, y] });
  return m;
}

export type OrbitalOpts = Loose<{
  len: number;
  wid: number;
  widFilled: number;
  tilt: number;
  skew: number;
  filled: 'lower' | 'upper' | 'both' | 'none';
  dot: 'upper' | 'lower' | 'none';
  dotR: number;
  color: string;
  fill: string;
  width: number;
}>;

function lobe(s: number, W: number, len: number): string {
  return `M0,0 C${f3(W * 1.45)},${f3(s * len * 0.28)} ${f3(W * 1.2)},${f3(s * len)} 0,${f3(s * len)} C${f3(-W * 1.2)},${f3(s * len)} ${f3(-W * 1.45)},${f3(s * len * 0.28)} 0,0 Z`;
}

export function radicalOrbital(p: Parent, x: number, y: number, o: OrbitalOpts = {}): { node: SVGGElement } {
  const len = o.len ?? 9;
  const wid = o.wid ?? len * 0.33;
  const wf = o.widFilled ?? wid * 1.15;
  const col = o.color ?? INK;
  const w = o.width ?? STYLE.line.normal;
  const g = el(p, 'g', { transform: `translate(${f3(x)} ${f3(y)}) rotate(${o.tilt ?? 0})`, 'data-part': 'orbital' });
  const filled = o.filled ?? 'lower';
  const fillU = filled === 'upper' || filled === 'both';
  const fillL = filled === 'lower' || filled === 'both';
  const up = path(g, lobe(-1, fillU ? wf : wid, len), { fill: fillU ? (o.fill ?? col) : C.paper, stroke: col, width: w });
  const lo = path(g, lobe(1, fillL ? wf : wid, len), { fill: fillL ? (o.fill ?? col) : C.paper, stroke: col, width: w });
  if (o.skew !== undefined && o.skew !== 0) (fillL ? lo : up).setAttribute('transform', `rotate(${o.skew})`);
  const dot = o.dot ?? (fillL ? 'upper' : 'lower');
  if (dot !== 'none') circle(g, 0, (dot === 'upper' ? -1 : 1) * len * 0.6, o.dotR ?? Math.max(0.6, len * 0.075), { fill: (dot === 'upper' ? fillU : fillL) ? C.paper : col });
  return { node: g };
}

export type TagOpts = Loose<{
  size: number;
  fill: string;
  color: string;
  weight: string | number;
  padX: number;
  padY: number;
  r: number;
  rot: number;
  alongArc: { cx: number; cy: number; r: number; angle: number; offset?: number | undefined };
  upright: boolean;
  formula: boolean;
  stroke: string;
  strokeWidth: number;
}>;

function uprightRotation(angle: number): number {
  let rot = ((((angle + 90) % 360) + 540) % 360) - 180;
  if (rot > 90) rot -= 180;
  if (rot < -90) rot += 180;
  return rot;
}

export function tag(p: Parent, x0: number, y0: number, str: string, o: TagOpts = {}): { node: SVGGElement; w: number; h: number } {
  const size = o.size ?? STYLE.text.label;
  const fill = o.fill ?? INK;
  const color = o.color ?? C.paper;
  let x = x0;
  let y = y0;
  let rot = o.rot ?? 0;
  if (o.alongArc !== undefined) {
    const { cx, cy, r, angle, offset = 0 } = o.alongArc;
    x = cx + (r + offset) * Math.cos(rad(angle));
    y = cy + (r + offset) * Math.sin(rad(angle));
    rot = o.upright !== false ? uprightRotation(angle) : angle + 90;
  }
  const g = el(p, 'g', { transform: `translate(${f3(x)} ${f3(y)})${rot !== 0 ? ` rotate(${f3(rot)})` : ''}`, 'data-part': 'tag' });
  const t = chemText(g, 0, 0, str, { size, color, weight: o.weight ?? 'bold', anchor: 'middle', valign: 'middle', halo: fill, haloWidth: 0.3, formula: o.formula });
  const b = t.getBBox();
  const px = o.padX ?? size * 0.45;
  const py = o.padY ?? size * 0.22;
  const w = b.width + 2 * px;
  const h = size * 0.716 + 2 * py + size * 0.25;
  const bg = rect(g, -w / 2, -h / 2, w, h, { fill, r: o.r ?? 0, stroke: o.stroke, width: o.strokeWidth });
  g.insertBefore(bg, t);
  return { node: g, w, h };
}
