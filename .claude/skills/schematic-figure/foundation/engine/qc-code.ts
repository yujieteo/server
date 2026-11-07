// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Figure, Loose, Paint, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, path, polygon, rect } from './draw.ts';
import { at, unit } from './util.ts';
import { p2 } from './cs-base.ts';
import type { Affine } from './qc-base.ts';
import { affineAt, C, shadowOf, w0 } from './qc-base.ts';
import { badge } from './qc-ket.ts';

export type QubitOpts = Loose<{
  part: string;
  stroke: string;
  width: number;
  fill: string;
  filter: boolean | string;
  shadow: boolean | string;
  label: string;
  labelColor: string;
  size: number;
}>;

export function qubit(p: Parent, cx: number, cy: number, r: number, color: string = C.orange, o: QubitOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'qubit' });
  circle(g, cx, cy, r, { fill: o.fill ?? color, stroke: o.stroke, width: o.width ?? STYLE.line.thin, filter: shadowOf(p, o.filter ?? o.shadow) });
  if (o.label !== undefined && o.label !== '') {
    text(g, cx, cy, o.label, { anchor: 'middle', valign: 'middle', size: o.size ?? Math.max(STYLE.text.min, r * 1.1), color: o.labelColor ?? '#fff' });
  }
  return g;
}

export type SurfaceOpts = Loose<{
  part: string;
  d: number;
  pitch: number;
  style: 'tanner' | 'plaquette';
  xColor: string;
  zColor: string;
  dataR: number;
  checkS: number;
  letters: boolean;
  dataFill: string;
  dataStroke: string;
  width: number;
  edgeColor: string;
  flip: boolean;
  opacity: number;
  size: number;
}>;

export type CheckSide = 'top' | 'bottom' | 'left' | 'right';
export interface SurfaceCheck {
  type: 'X' | 'Z';
  i: number;
  j: number;
  x: number;
  y: number;
  nb: Point[];
  side: CheckSide | null;
}

export interface SurfaceOut {
  node: SVGGElement;
  data: Point[];
  checks: SurfaceCheck[];
  X: Affine;
  Y: Affine;
}

function neighbours(i: number, j: number, d: number): Point[] {
  const all: Point[] = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
  const nb: Point[] = [];
  for (const [u, v] of all) {
    if (u >= 0 && v >= 0 && u < d && v < d) nb.push([u, v]);
  }
  return nb;
}

function sideOf(nb: number, i: number, j: number, d: number): CheckSide | null {
  if (nb === 4) return null;
  if (j === -1) return 'top';
  if (j === d - 1) return 'bottom';
  return i === -1 ? 'left' : 'right';
}

function surfaceChecks(d: number, flip: boolean, X: Affine, Y: Affine): SurfaceCheck[] {
  const checks: SurfaceCheck[] = [];
  for (let i = -1; i < d; i++) {
    for (let j = -1; j < d; j++) {
      const nb = neighbours(i, j, d);
      let t: 'X' | 'Z' = (i + j) % 2 === 0 ? 'Z' : 'X';
      if (flip) t = t === 'Z' ? 'X' : 'Z';
      const tb = j === -1 || j === d - 1;
      const lr = i === -1 || i === d - 1;
      const keep = nb.length === 4 || (nb.length === 2 && ((tb && t === (flip ? 'Z' : 'X')) || (lr && t === (flip ? 'X' : 'Z'))));
      if (keep) checks.push({ type: t, i, j, x: affineAt(X, i + 0.5), y: affineAt(Y, j + 0.5), nb, side: sideOf(nb.length, i, j, d) });
    }
  }
  return checks;
}

function plaquette(g: SVGGElement, c: SurfaceCheck, o: SurfaceOpts, X: Affine, Y: Affine, a: number, lw: number): void {
  const col = c.type === 'X' ? (o.xColor ?? C.vermillion) : (o.zColor ?? C.green);
  const fill = o.opacity !== undefined ? col : shade(col, 0.35);
  const st: Paint = { fill, fillOpacity: o.opacity, stroke: o.edgeColor ?? C.ink, width: lw * 0.7, join: 'round' };
  if (c.side === null) {
    const pts: Point[] = [];
    for (const [u, v] of c.nb) pts.push([affineAt(X, u), affineAt(Y, v)]);
    polygon(g, pts, st);
    return;
  }
  const [u1, v1] = at(c.nb, 0);
  const [u2, v2] = at(c.nb, 1);
  const sweep = c.side === 'top' || c.side === 'right' ? 1 : 0;
  const A: Point = [affineAt(X, Math.min(u1, u2)), affineAt(Y, Math.min(v1, v2))];
  const B: Point = [affineAt(X, Math.max(u1, u2)), affineAt(Y, Math.max(v1, v2))];
  path(g, `M${p2(A)} A${a / 2},${a / 2} 0 0 ${sweep} ${p2(B)} Z`, st);
}

export function surfaceCode(p: Parent, x: number, y: number, o: SurfaceOpts = {}): SurfaceOut {
  const d = o.d ?? 3;
  const a = o.pitch ?? 10;
  const lw = o.width ?? w0();
  const xc = o.xColor ?? C.vermillion;
  const zc = o.zColor ?? C.green;
  const ink = o.edgeColor ?? C.ink;
  const X: Affine = { base: x, step: a };
  const Y: Affine = { base: y, step: a };
  const g = el(p, 'g', { 'data-part': o.part ?? 'surface-code' });
  const checks = surfaceChecks(d, o.flip === true, X, Y);
  const data: Point[] = [];
  for (let j = 0; j < d; j++) {
    for (let i = 0; i < d; i++) data.push([affineAt(X, i), affineAt(Y, j)]);
  }
  if ((o.style ?? 'tanner') === 'plaquette') {
    for (const c of checks) plaquette(g, c, o, X, Y, a, lw);
    for (const [u, v] of data) circle(g, u, v, o.dataR ?? a * 0.12, { fill: o.dataFill ?? C.ink, stroke: o.dataStroke, width: lw * 0.7 });
  } else {
    for (const c of checks) {
      for (const [u, v] of c.nb) line(g, [c.x, c.y], [affineAt(X, u), affineAt(Y, v)], { stroke: ink, width: lw });
    }
    for (const [u, v] of data) circle(g, u, v, o.dataR ?? a * 0.15, { fill: o.dataFill ?? '#fff', stroke: o.dataStroke ?? ink, width: lw });
    const s = o.checkS ?? a * 0.3;
    for (const c of checks) badge(g, c.x, c.y, o.letters === false ? '' : c.type, c.type === 'X' ? xc : zc, { s, width: lw, fill: '#fff', size: o.size });
  }
  return { node: g, data, checks, X, Y };
}

export type TannerNode = Loose<{ shape: 'circle' | 'square' | 'round'; color: string; s: number; letter: string; outline: boolean; fill: string; width: number; size: number }>;
export type TannerGrid<T> = readonly (readonly (T | null | undefined)[])[];

export type TannerOpts = Loose<{
  part: string;
  x: number;
  y: number;
  cols: number;
  rows: number;
  dx: number;
  dy: number;
  overhang: number;
  nodes: TannerGrid<TannerNode>;
  hEdges: TannerGrid<Paint>;
  vEdges: TannerGrid<Paint>;
  F: Figure;
  name: string;
}>;

function entry<T extends object>(m: TannerGrid<T>, r: number, c: number): T | null | undefined {
  const row = m[r];
  return row === undefined ? undefined : row[c];
}

function nodeAt(o: TannerOpts, r: number, c: number): TannerNode | null | undefined {
  return o.nodes === undefined ? {} : entry(o.nodes, r, c);
}

function edgeAt(m: TannerGrid<Paint> | undefined, r: number, c: number): Paint | null | undefined {
  return m === undefined ? {} : entry(m, r, c);
}

function edgeStyle(s: Paint): Paint {
  return { stroke: C.ink, width: STYLE.line.hair, cap: 'butt', ...s };
}

function tannerEdges(eg: SVGGElement, o: TannerOpts, cols: number, rows: number, X: Affine, Y: Affine): void {
  const ov = o.overhang ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = edgeAt(o.hEdges, r, c);
      const v = edgeAt(o.vEdges, r, c);
      const x = affineAt(X, c);
      const y = affineAt(Y, r);
      if (h !== null && h !== undefined) {
        const st = edgeStyle(h);
        if (c < cols - 1) line(eg, [x, y], [affineAt(X, c + 1), y], st);
        else if (ov !== 0) {
          line(eg, [x, y], [x + ov, y], st);
          line(eg, [affineAt(X, 0) - ov, y], [affineAt(X, 0), y], st);
        }
      }
      if (v !== null && v !== undefined) {
        const st = edgeStyle(v);
        if (r < rows - 1) line(eg, [x, y], [x, affineAt(Y, r + 1)], st);
        else if (ov !== 0) {
          line(eg, [x, y], [x, y + ov], st);
          line(eg, [x, affineAt(Y, 0) - ov], [x, affineAt(Y, 0)], st);
        }
      }
    }
  }
}

function tannerNodes(ng: SVGGElement, p: Parent, o: TannerOpts, cols: number, rows: number, X: Affine, Y: Affine): void {
  const dx = o.dx ?? 8;
  const dy = o.dy ?? o.dx ?? 8;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const n = nodeAt(o, r, c);
      if (n === null || n === undefined) continue;
      const x = affineAt(X, c);
      const y = affineAt(Y, r);
      const s = n.s ?? Math.min(dx, dy) * 0.42;
      const col = n.color ?? C.blue;
      const shape = n.shape ?? 'circle';
      if (n.outline === true || (n.letter !== undefined && n.letter !== '')) {
        badge(ng, x, y, n.letter ?? '', col, { shape, s, fill: n.fill ?? '#fff', width: n.width, size: n.size });
      } else if (shape === 'circle') circle(ng, x, y, s / 2, { fill: col });
      else rect(ng, x - s / 2, y - s / 2, s, s, { fill: col, r: shape === 'round' ? s * 0.25 : undefined });
      if (o.F !== undefined && o.name !== undefined && o.name !== '') o.F.anchor(`${o.name}.${c}.${r}`, p, x, y);
    }
  }
}

export function tannerLattice(p: Parent, o: TannerOpts = {}): { node: SVGGElement; X: Affine; Y: Affine } {
  const dx = o.dx ?? 8;
  const dy = o.dy ?? o.dx ?? 8;
  const X: Affine = { base: o.x ?? 0, step: dx };
  const Y: Affine = { base: o.y ?? 0, step: dy };
  const g = el(p, 'g', { 'data-part': o.part ?? 'tanner-lattice' });
  const eg = el(g, 'g', { 'data-part': 'tanner-edges' });
  const ng = el(g, 'g', { 'data-part': 'tanner-nodes' });
  tannerEdges(eg, o, o.cols ?? 6, o.rows ?? 4, X, Y);
  tannerNodes(ng, p, o, o.cols ?? 6, o.rows ?? 4, X, Y);
  return { node: g, X, Y };
}

export type TorusOpts = Loose<{ part: string; marks: readonly [number, number]; size: number; at: number; stroke: string; width: number; fill: string; r: number }>;

function torusMark(g: SVGGElement, s: number, c: string, tx: number, ty: number, ux: number, uy: number): void {
  polygon(g, [[tx, ty], [tx - ux * s - uy * s * 0.55, ty - uy * s + ux * s * 0.55], [tx - ux * s + uy * s * 0.55, ty - uy * s - ux * s * 0.55]], { fill: c });
}

export function torusFrame(p: Parent, x: number, y: number, w: number, h: number, o: TorusOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'torus-frame' });
  const [nh, nv] = o.marks ?? [2, 1];
  const s = o.size ?? 3.2;
  const c = o.stroke ?? C.ink;
  const pos = o.at ?? 0.5;
  rect(g, x, y, w, h, { stroke: c, width: o.width ?? STYLE.line.normal * 1.4, fill: o.fill ?? 'none', join: 'miter', r: o.r });
  for (const yy of [y, y + h]) {
    for (let k = 0; k < nh; k++) torusMark(g, s, c, x + w * pos + (k - (nh - 1) / 2) * s * 0.9 + s / 2, yy, 1, 0);
  }
  for (const xx of [x, x + w]) {
    for (let k = 0; k < nv; k++) torusMark(g, s, c, xx, y + h * pos + (k - (nv - 1) / 2) * s * 0.9 + s / 2, 0, 1);
  }
  return g;
}

export type DoubleLineOpts = Loose<{
  part: string;
  n: number;
  gap: number;
  stroke: string;
  width: number;
  heads: 'none' | 'end' | 'start' | 'both';
  head: number;
  headWidth: number;
}>;

function dlHead(g: SVGGElement, t: Point, sx: number, u: Point, L: number, HW: number, c: string): void {
  const [ux, uy] = u;
  const nx = -uy;
  const ny = ux;
  polygon(g, [t, [t[0] - sx * ux * L + nx * HW, t[1] - sx * uy * L + ny * HW], [t[0] - sx * ux * L - nx * HW, t[1] - sx * uy * L - ny * HW]], { fill: c });
}

export function doubleLine(p: Parent, a: Point, b: Point, o: DoubleLineOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'double-line' });
  const n = o.n ?? 2;
  const gap = o.gap ?? 1.2;
  const c = o.stroke ?? C.ink;
  const w = o.width ?? STYLE.line.thin;
  const u = unit(b[0] - a[0], b[1] - a[1]);
  const nx = -u[1];
  const ny = u[0];
  const heads = o.heads ?? 'none';
  const L = o.head ?? 3.4;
  const HW = o.headWidth ?? Math.max(gap * (n - 1) * 0.5 + 1.4, L * 0.55);
  const hs = heads === 'start' || heads === 'both';
  const he = heads === 'end' || heads === 'both';
  const a2: Point = hs ? [a[0] + u[0] * L * 0.85, a[1] + u[1] * L * 0.85] : a;
  const b2: Point = he ? [b[0] - u[0] * L * 0.85, b[1] - u[1] * L * 0.85] : b;
  for (let i = 0; i < n; i++) {
    const s = (i - (n - 1) / 2) * gap;
    line(g, [a2[0] + nx * s, a2[1] + ny * s], [b2[0] + nx * s, b2[1] + ny * s], { stroke: c, width: w, cap: 'butt' });
  }
  if (he) dlHead(g, b, 1, u, L, HW, c);
  if (hs) dlHead(g, a, -1, u, L, HW, c);
  return g;
}

export type LeaderOpts = Loose<{ part: string; stroke: string; width: number; head: number; headWidth: number; notch: number; dir: Point }>;

export function curveLeader(p: Parent, pts: readonly Point[], o: LeaderOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'leader' });
  const c = o.stroke ?? C.ink;
  const L = o.head ?? 3.3;
  const hw = o.headWidth ?? L * 0.44;
  const notch = o.notch ?? 0.38;
  const b = at(pts, pts.length - 1);
  const prev = at(pts, pts.length - 2);
  const dir = o.dir ?? [b[0] - prev[0], b[1] - prev[1]];
  const [ux, uy] = unit(dir[0], dir[1]);
  const e: Point = [b[0] - ux * L * (1 - notch) * 0.95, b[1] - uy * L * (1 - notch) * 0.95];
  const d = pts.length === 4 ? `M${p2(at(pts, 0))} C${p2(at(pts, 1))} ${p2(at(pts, 2))} ${p2(e)}` : `M${p2(at(pts, 0))} Q${p2(at(pts, 1))} ${p2(e)}`;
  path(g, d, { stroke: c, width: o.width ?? STYLE.line.thin });
  const bx = b[0] - ux * L;
  const by = b[1] - uy * L;
  const m: Point = [b[0] - ux * L * (1 - notch), b[1] - uy * L * (1 - notch)];
  polygon(g, [b, [bx - uy * hw, by + ux * hw], m, [bx + uy * hw, by - ux * hw]], { fill: c });
  return g;
}
