// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/blocks.js
import type { CurveSpec, Dash, Figure, IsoProj, Loose, Parent, Point, Ports, Scale } from './types.ts';
import { el, text } from './core.ts';
import { PALETTES, STYLE, ramp, shade } from './style.ts';
import { arrow, circle, isoBox, isoPt, line, path, rect, sample, smooth } from './draw.ts';
import { at } from './util.ts';

const C = STYLE.color;

function reg(F: Figure | undefined, name: string | undefined, parent: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y);
  }
  return ports;
}

export function scaleAt(s: Scale, v: number): number {
  return s.base + s.sign * (((v - s.lo) / s.range) * s.size);
}

export type BoxOpts = Loose<{
  part: string; r: number; fill: string; stroke: string; width: number; dash: Dash;
  size: number; weight: string | number; color: string; F: Figure; name: string;
}>;

export function box(p: Parent, x: number, y: number, w: number, h: number, label: string, o: BoxOpts = {}): { node: SVGGElement; ports: Ports } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'box' });
  rect(g, x, y, w, h, {
    r: o.r ?? 1.6, fill: o.fill ?? C.tintBlue, stroke: o.stroke ?? shade(o.fill ?? C.tintBlue, -0.45),
    width: o.width ?? STYLE.line.thin, dash: o.dash,
  });
  if (label !== '') text(g, x + w / 2, y + h / 2, label, { anchor: 'middle', valign: 'middle', size: o.size, weight: o.weight, color: o.color });
  const ports = reg(o.F, o.name, p, {
    left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], center: [x + w / 2, y + h / 2],
  });
  return { node: g, ports };
}

export type NetworkOpts = Loose<{
  layers: readonly number[]; w: number; h: number; r: number; colors: readonly string[];
  edges: 'full' | 'none'; edgeColor: string; edgeWidth: number; F: Figure; name: string;
}>;

function layerPositions(layers: readonly number[], x: number, y: number, w: number, h: number, r: number): Point[][] {
  const pos: Point[][] = [];
  for (let i = 0; i < layers.length; i++) {
    const n = at(layers, i);
    const col: Point[] = [];
    for (let j = 0; j < n; j++) {
      col.push([
        x + (layers.length === 1 ? w / 2 : (i * w) / (layers.length - 1)),
        y + h / 2 + (j - (n - 1) / 2) * Math.min(h / Math.max(1, n - 1), r * 4.2),
      ]);
    }
    pos.push(col);
  }
  return pos;
}

function layerColors(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(i === 0 ? C.sky : i === n - 1 ? C.orange : C.blue);
  return out;
}

export function network(p: Parent, x: number, y: number, o: NetworkOpts = {}): { node: SVGGElement; ports: Ports; nodes: Point[][] } {
  const layers = o.layers ?? [3, 4, 4, 2];
  const w = o.w ?? 40;
  const h = o.h ?? 24;
  const r = o.r ?? 1.6;
  const g = el(p, 'g', { 'data-part': 'network' });
  const cols = o.colors ?? layerColors(layers.length);
  const pos = layerPositions(layers, x, y, w, h, r);
  if ((o.edges ?? 'full') === 'full') {
    for (let i = 0; i + 1 < pos.length; i++) {
      for (const a of at(pos, i)) {
        for (const b of at(pos, i + 1)) line(g, a, b, { stroke: o.edgeColor ?? C.light, width: o.edgeWidth ?? STYLE.line.hair, cap: 'butt' });
      }
    }
  }
  for (let i = 0; i < pos.length; i++) {
    const fill = at(cols, i);
    for (const [cx, cy] of at(pos, i)) circle(g, cx, cy, r, { fill, stroke: shade(fill, -0.4), width: STYLE.line.hair * 1.4 });
  }
  const ports = reg(o.F, o.name, p, { left: [x - r, y + h / 2], right: [x + w + r, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] });
  return { node: g, ports, nodes: pos };
}

export type MatrixOpts = Loose<{
  rows: number; cols: number; s: number; values: readonly (readonly number[])[]; stops: readonly string[];
  stroke: string; gap: number; F: Figure; name: string;
}>;

function matrixValue(o: MatrixOpts, i: number, j: number): number {
  if (o.values !== undefined) return at(at(o.values, i), j);
  return ((i * 7 + j * 3) % 10) / 9;
}

export function matrix(p: Parent, x: number, y: number, o: MatrixOpts = {}): { node: SVGGElement; ports: Ports; w: number; h: number } {
  const rows = o.rows ?? 5;
  const cols = o.cols ?? 5;
  const s = o.s ?? 2.4;
  const gap = o.gap ?? 0.2;
  const stops = o.stops ?? PALETTES.diverging;
  const g = el(p, 'g', { 'data-part': 'matrix' });
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      rect(g, x + j * s + gap / 2, y + i * s + gap / 2, s - gap, s - gap, { fill: ramp(stops, matrixValue(o, i, j)) });
    }
  }
  rect(g, x, y, cols * s, rows * s, { stroke: o.stroke ?? C.ink, width: STYLE.line.thin });
  const W = cols * s;
  const H = rows * s;
  const ports = reg(o.F, o.name, p, { left: [x, y + H / 2], right: [x + W, y + H / 2], top: [x + W / 2, y], bottom: [x + W / 2, y + H] });
  return { node: g, ports, w: W, h: H };
}

export type TileStackOpts = Loose<{
  n: number; w: number; h: number; dx: number; dy: number; fill: string; stroke: string; F: Figure; name: string;
}>;

export function tileStack(p: Parent, x: number, y: number, o: TileStackOpts = {}): { node: SVGGElement; ports: Ports } {
  const n = o.n ?? 4;
  const w = o.w ?? 10;
  const h = o.h ?? 10;
  const dx = o.dx ?? 1.6;
  const dy = o.dy ?? -1.2;
  const fill = o.fill ?? '#dfe9f5';
  const g = el(p, 'g', { 'data-part': 'tile-stack' });
  for (let k = n - 1; k >= 0; k--) rect(g, x + k * dx, y + k * dy, w, h, { fill: shade(fill, -0.06 * k), stroke: o.stroke ?? C.ink, width: STYLE.line.thin });
  const ports = reg(o.F, o.name, p, {
    left: [x, y + h / 2], right: [x + w + (n - 1) * dx, y + h / 2 + (n - 1) * dy], center: [x + w / 2, y + h / 2],
  });
  return { node: g, ports };
}

export type PlotSeries = Loose<{
  curve: CurveSpec; pts: readonly Point[]; n: number; bars: number; dots: number; color: string; width: number; dash: Dash;
}>;
export type PlotOpts = Loose<{
  xr: Point; yr: Point; axes: boolean; series: readonly PlotSeries[]; xlabel: string; ylabel: string; labelSize: number;
}>;

function seriesPoints(s: PlotSeries, x0: number, x1: number): readonly Point[] {
  if (s.pts !== undefined) return s.pts;
  if (s.curve === undefined) throw new Error('a plot series needs pts or curve');
  return sample(s.curve, x0, x1, s.n ?? 100);
}

function drawSeries(g: SVGGElement, s: PlotSeries, P: readonly Point[], X: Scale, Y: Scale, y0: number): void {
  const color = s.color ?? C.blue;
  if (s.bars !== undefined && s.bars !== 0) {
    for (const [a, b] of P) rect(g, scaleAt(X, a) - s.bars / 2, scaleAt(Y, b), s.bars, scaleAt(Y, y0) - scaleAt(Y, b), { fill: color });
  } else if (s.dots !== undefined && s.dots !== 0) {
    for (const [a, b] of P) circle(g, scaleAt(X, a), scaleAt(Y, b), s.dots, { fill: color });
  } else {
    let d = 'M';
    for (let i = 0; i < P.length; i++) {
      const [a, b] = at(P, i);
      d += `${i > 0 ? ' L' : ''}${scaleAt(X, a).toFixed(2)},${scaleAt(Y, b).toFixed(2)}`;
    }
    path(g, d, { stroke: color, width: s.width ?? STYLE.line.normal, dash: s.dash });
  }
}

export function plot(p: Parent, x: number, y: number, w: number, h: number, o: PlotOpts = {}): { node: SVGGElement; X: Scale; Y: Scale } {
  const g = el(p, 'g', { 'data-part': 'plot' });
  const [x0, x1] = o.xr ?? [0, 1];
  const [y0, y1] = o.yr ?? [0, 1];
  const X: Scale = { base: x, sign: 1, lo: x0, range: x1 - x0, size: w };
  const Y: Scale = { base: y + h, sign: -1, lo: y0, range: y1 - y0, size: h };
  if (o.axes !== false) {
    arrow(g, [x, y + h], [x + w + 2, y + h], { width: STYLE.line.thin, head: 2.2 });
    arrow(g, [x, y + h], [x, y - 2], { width: STYLE.line.thin, head: 2.2 });
  }
  for (const s of o.series ?? []) drawSeries(g, s, seriesPoints(s, x0, x1), X, Y, y0);
  const ls = o.labelSize ?? STYLE.text.small;
  if (o.xlabel !== undefined && o.xlabel !== '') text(g, x + w / 2, y + h + 2, o.xlabel, { anchor: 'middle', valign: 'top', size: ls });
  if (o.ylabel !== undefined && o.ylabel !== '') {
    const t = text(g, 0, 0, o.ylabel, { anchor: 'middle', valign: 'bottom', size: ls });
    t.setAttribute('transform', `translate(${x - 1.5} ${y + h / 2}) rotate(-90) ${t.getAttribute('transform') ?? ''}`);
  }
  return { node: g, X, Y };
}

export type ChipOpts = Loose<{
  w: number; d: number; t: number; top: string; part: string; substrate: boolean; waveguides: readonly (readonly Point[])[];
  wgColor: string; wgWidth: number; ports: Ports; F: Figure; name: string;
}> & { proj: IsoProj };

export interface ChipResult {
  node: SVGGElement;
  ports: Ports;
  frame: { x: number; y: number; w: number; d: number; t: number; proj: IsoProj };
}

export function chipPoint(c: ChipResult, u: number, v: number): Point {
  const f = c.frame;
  const [a, b] = isoPt(f.proj, u * f.w, v * f.d, f.t * 0.2);
  return [f.x + a, f.y + b];
}

export function chip(p: Parent, x: number, y: number, o: ChipOpts): ChipResult {
  const w = o.w ?? 60;
  const d = o.d ?? 36;
  const t = o.t ?? 4;
  const proj = o.proj;
  const g = el(p, 'g', { transform: `translate(${x} ${y})`, 'data-part': o.part ?? 'chip' });
  if (o.substrate !== false) isoBox(g, proj, [0, 0, -t * 0.8], [w, d, t * 0.8], { top: shade(C.substrate, -0.05), part: 'substrate' });
  isoBox(g, proj, [0, 0, 0], [w, d, t * 0.2], { top: o.top ?? '#eef1f5', part: 'chip-top' });
  for (const wg of o.waveguides ?? []) {
    const P: Point[] = [];
    for (const [u, v] of wg) P.push(isoPt(proj, u * w, v * d, t * 0.2));
    const dd = smooth(P, false, 0.3);
    path(g, dd, { stroke: shade(o.wgColor ?? C.blue, -0.3), width: (o.wgWidth ?? 0.9) + 0.4 });
    path(g, dd, { stroke: o.wgColor ?? C.blue, width: o.wgWidth ?? 0.9 });
  }
  const result: ChipResult = { node: g, ports: {}, frame: { x, y, w, d, t, proj } };
  for (const [k, [u, v]] of Object.entries(o.ports ?? {})) result.ports[k] = chipPoint(result, u, v);
  reg(o.F, o.name, p, result.ports);
  return result;
}

export type MziOpts = Loose<{
  n: number; cols: number; pitch: number; cell: number; color: string; heater: string; F: Figure; name: string;
}>;

function meshY(y: number, pitch: number, k: number): number {
  return y + k * pitch;
}

interface MeshGeom {
  n: number;
  x: number;
  y: number;
  pitch: number;
  cell: number;
}

function meshCell(k: number, c: number, G: MeshGeom): string {
  const pairTop = c % 2 === 0 ? (k % 2 === 0 ? k : k - 1) : k % 2 === 1 ? k : k - 1;
  const inPair = pairTop >= 0 && pairTop + 1 < G.n;
  const yk = meshY(G.y, G.pitch, k);
  const mid = inPair ? (meshY(G.y, G.pitch, pairTop) + meshY(G.y, G.pitch, pairTop + 1)) / 2 : yk;
  const yc = inPair ? mid + (yk < mid ? -0.9 : 0.9) : yk;
  const x0 = G.x + c * G.cell;
  return ` L${x0 + 1},${yk} C${x0 + 2.5},${yk} ${x0 + 2.5},${yc} ${x0 + 4},${yc} L${x0 + 5},${yc} C${x0 + 6.5},${yc} ${x0 + 6.5},${yk} ${x0 + 8},${yk} L${x0 + G.cell},${yk}`;
}

export function mziMesh(p: Parent, x: number, y: number, o: MziOpts = {}): { node: SVGGElement; ports: Ports; w: number; h: number } {
  const n = o.n ?? 4;
  const cols = o.cols ?? 4;
  const pitch = o.pitch ?? 5;
  const cell = o.cell ?? 12;
  const heater = o.heater ?? C.gold;
  const g = el(p, 'g', { 'data-part': 'mzi-mesh' });
  const W = cols * cell;
  const G: MeshGeom = { n, x, y, pitch, cell };
  for (let k = 0; k < n; k++) {
    let d = `M${x - 4},${meshY(y, pitch, k)}`;
    for (let c = 0; c < cols; c++) d += meshCell(k, c, G);
    d += ` L${x + W + 4},${meshY(y, pitch, k)}`;
    path(g, d, { stroke: o.color ?? C.blue, width: 0.8 });
  }
  for (let c = 0; c < cols; c++) {
    for (let k = c % 2; k + 1 < n; k += 2) {
      rect(g, x + c * cell + 8.4, meshY(y, pitch, k) - 1.1, 3, 2.2, { fill: heater, stroke: shade(heater, -0.4), width: STYLE.line.hair, r: 0.4 });
    }
  }
  const ports: Ports = {};
  for (let k = 0; k < n; k++) {
    ports[`in${k}`] = [x - 4, meshY(y, pitch, k)];
    ports[`out${k}`] = [x + W + 4, meshY(y, pitch, k)];
  }
  reg(o.F, o.name, p, ports);
  return { node: g, ports, w: W + 8, h: (n - 1) * pitch };
}

export function ring(p: Parent, cx: number, cy: number, o: Loose<{ r: number; gap: number; bus: number; color: string; F: Figure; name: string }> = {}): { node: SVGGElement; ports: Ports } {
  const r = o.r ?? 5;
  const gap = o.gap ?? 0.8;
  const bus = o.bus ?? 14;
  const color = o.color ?? C.blue;
  const g = el(p, 'g', { 'data-part': 'ring' });
  circle(g, cx, cy, r, { stroke: color, width: 0.9 });
  const yb = cy + r + gap + 0.9;
  line(g, [cx - bus / 2, yb], [cx + bus / 2, yb], { stroke: color, width: 0.9 });
  const ports = reg(o.F, o.name, p, { in: [cx - bus / 2, yb], out: [cx + bus / 2, yb], center: [cx, cy] });
  return { node: g, ports };
}
