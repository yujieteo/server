// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/signals.js
import type { CurveSpec, Figure, GradientStop, Loose, Paint, Parent, Point, Ports } from './types.ts';
import { el, paint, text } from './core.ts';
import { STYLE, ramp, shade } from './style.ts';
import { arrow, circle, clipPath, evalCurve, linearGradient, line, path, polygon, rect, smooth } from './draw.ts';
import { at, f3, linspace } from './util.ts';
import { dPts, orOne, reg } from './geo-vec.ts';

const C = STYLE.color;

function fixed2(a: readonly Point[]): string {
  let d = 'M';
  for (let i = 0; i < a.length; i++) {
    const q = at(a, i);
    d += `${i > 0 ? ' L' : ''}${q[0].toFixed(2)},${q[1].toFixed(2)}`;
  }
  return d;
}

export type StepHistOpts = Loose<{ color: string; fill: string; width: number; drop: number; opacity: number; floor: boolean }>;

export function stepHist(
  p: Parent, x0: number, base: number, bw: number | readonly number[], hs: readonly number[], o: StepHistOpts = {},
): { node: SVGGElement; edges: number[] } {
  const color = o.color ?? C.blue;
  const width = o.width ?? STYLE.line.normal;
  const edges: number[] = [];
  if (typeof bw === 'number') {
    for (let i = 0; i < hs.length; i++) edges.push(x0 + i * bw);
    edges.push(x0 + hs.length * bw);
  } else edges.push(...bw);
  const top: Point[] = [];
  for (let i = 0; i < hs.length; i++) {
    const h = at(hs, i);
    top.push([at(edges, i), base - h], [at(edges, i + 1), base - h]);
  }
  const first = at(edges, 0);
  const last = at(edges, edges.length - 1);
  const g = el(p, 'g', { 'data-part': 'histogram' });
  polygon(g, [[first, base], ...top, [last, base]], { fill: o.fill ?? shade(color, 0.78), opacity: o.opacity ?? 1 });
  const d = o.drop ?? 0;
  path(g, fixed2([[first, base + d], ...top, [last, base + d]]), { stroke: color, width, join: 'miter', cap: 'butt', opacity: o.opacity ?? 1 });
  if (o.floor === true) line(g, [first, base], [last, base], { stroke: color, width });
  return { node: g, edges };
}

export type BinLabelOpts = Loose<{ size: number; color: string; highlight: number }>;

export function binLabels(p: Parent, edges: readonly number[], y: number, labels: readonly (string | number)[], o: BinLabelOpts = {}): void {
  const highlight = o.highlight ?? -1;
  for (let k = 0; k < labels.length; k++) {
    const on = k === highlight;
    text(p, (at(edges, k) + at(edges, k + 1)) / 2, y, String(at(labels, k)), {
      anchor: 'middle', valign: 'middle', size: o.size ?? STYLE.text.label, color: on ? C.text : (o.color ?? C.text), weight: on ? 'bold' : 'normal',
    });
  }
}

export type WaveOpts = Loose<{
  amp: number; period: number; color: string; band: string; width: number; head: boolean; env: number;
  shape: 'sine' | 'noise'; seed: number; headLen: number;
}>;

function waveValue(noise: boolean, s: number, len: number, period: number, seed: number): number {
  if (!noise) return Math.sin((2 * Math.PI * s * len) / period);
  const ph0 = seed * 1.7;
  const ph1 = seed * 2.9;
  const ph2 = seed * 0.6;
  return (
    (Math.sin((2 * Math.PI * s * len) / period + ph0) +
      0.6 * Math.sin(((2 * Math.PI * s * len) / period) * 1.73 + ph1) +
      0.4 * Math.sin(((2 * Math.PI * s * len) / period) * 0.47 + ph2)) / 2
  );
}

export function wave(p: Parent, x0: number, x1: number, y: number, o: WaveOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'wave' });
  const head = o.head ?? true;
  const headLen = o.headLen ?? 3;
  const env = o.env ?? 0.25;
  const amp = o.amp ?? 2.2;
  const color = o.color ?? C.blue;
  const width = o.width ?? STYLE.line.normal;
  const dir = orOne(Math.sign(x1 - x0));
  const n = 200;
  const len = Math.abs(x1 - x0) - (head ? headLen * 0.9 : 0);
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const e = 1 - env + env * Math.sin(Math.PI * s);
    pts.push([x0 + dir * s * len, y - amp * e * waveValue(o.shape === 'noise', s, len, o.period ?? 7, o.seed ?? 1)]);
  }
  const end = at(pts, n);
  if (o.band !== undefined && o.band !== '') polygon(g, [[x0, y], ...pts, [end[0], y]], { fill: o.band, opacity: 0.55 });
  path(g, smooth(pts, false, 0.5), { stroke: color, width });
  if (head) arrow(g, end, [x1, y], { stroke: color, width, head: headLen, headWidth: headLen * 0.42 });
  return g;
}

export interface SlopeAxis {
  base: number;
  from: number;
  slope: number;
}

export type SpectrumOpts = Loose<{ color: string; fill: string; sigma: number; width: number }>;

function axisY(axis: number | SlopeAxis, x: number): number {
  return typeof axis === 'number' ? axis : axis.base - (x - axis.from) * axis.slope;
}

function peaksAt(peaks: readonly Point[], sigma: number, x: number): number {
  let s = 0;
  for (const [c, h] of peaks) s += h * Math.exp(-((x - c) ** 2) / (2 * sigma * sigma));
  return s;
}

export function spectrum(
  p: Parent, x0: number, x1: number, axis: number | SlopeAxis, peaks: readonly Point[], o: SpectrumOpts = {},
): SVGGElement {
  const color = o.color ?? C.vermillion;
  const g = el(p, 'g', { 'data-part': 'spectrum' });
  const pts: Point[] = [];
  for (const x of linspace(x0, x1, 160)) pts.push([x, axisY(axis, x) - peaksAt(peaks, o.sigma ?? 2.5, x)]);
  polygon(g, [[x0, axisY(axis, x0)], ...pts, [x1, axisY(axis, x1)]], { fill: o.fill ?? shade(color, 0.75) });
  path(g, smooth(pts, false, 0.4), { stroke: color, width: o.width ?? STYLE.line.normal });
  return g;
}

export function dots(p: Parent, x0: number, x1: number, y: number, o: Loose<{ color: string; r: number }> = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'ellipsis' });
  for (let i = 0; i < 3; i++) circle(g, x0 + ((x1 - x0) * i) / 2, y, o.r ?? 0.55, { fill: o.color ?? C.ink });
  return g;
}

export type SplitNodeOpts = Loose<{ a: string; b: string; vertical: boolean; stroke: string; width: number }>;

export function splitNode(p: Parent, cx: number, cy: number, r: number, o: SplitNodeOpts = {}): SVGGElement {
  const a = o.a ?? C.sky;
  const b = o.b ?? C.blue;
  const g = el(p, 'g', { 'data-part': 'node' });
  if (o.vertical ?? true) {
    path(g, `M${cx},${cy - r} A${r},${r} 0 0 0 ${cx},${cy + r} Z`, { fill: a });
    path(g, `M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} Z`, { fill: b });
  } else {
    path(g, `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy} Z`, { fill: a });
    path(g, `M${cx - r},${cy} A${r},${r} 0 0 0 ${cx + r},${cy} Z`, { fill: b });
  }
  if (o.stroke !== undefined && o.stroke !== '') circle(g, cx, cy, r, { stroke: o.stroke, width: o.width ?? STYLE.line.hair });
  return g;
}

export type NodeFill = string | SplitNodeOpts;

export type LayerCardOpts = Loose<{
  nIn: number; nOut: number; r: number; card: string; cardR: number; edge: string; edgeW: number;
  nodeIn: NodeFill; nodeOut: NodeFill; pad: number; F: Figure; name: string;
}>;

function columnYs(y: number, h: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(y + h * (0.16 + 0.68 * (n === 1 ? 0.5 : i / (n - 1))));
  return out;
}

function drawNodes(g: SVGGElement, x: number, ys: readonly number[], r: number, fill: NodeFill): void {
  for (const yy of ys) {
    if (typeof fill === 'string') circle(g, x, yy, r, { fill });
    else splitNode(g, x, yy, r, fill);
  }
}

export function layerCard(p: Parent, x: number, y: number, w: number, h: number, o: LayerCardOpts = {}): { node: SVGGElement; ports: Ports } {
  const g = el(p, 'g', { 'data-part': 'layer-card' });
  const pad = o.pad ?? 0.22;
  const r = o.r ?? 2.2;
  rect(g, x, y, w, h, { r: o.cardR ?? 3, fill: o.card ?? C.tintGrey });
  const xi = x + w * pad;
  const xo = x + w * (1 - pad);
  const A = columnYs(y, h, o.nIn ?? 4);
  const B = columnYs(y, h, o.nOut ?? 4);
  for (const a of A) for (const b of B) line(g, [xi, a], [xo, b], { stroke: o.edge ?? C.orange, width: o.edgeW ?? STYLE.line.thin, cap: 'butt' });
  drawNodes(g, xi, A, r, o.nodeIn ?? C.vermillion);
  drawNodes(g, xo, B, r, o.nodeOut ?? { a: C.sky, b: C.blue });
  const ports: Ports = { left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] };
  reg(o.F, o.name, p, ports);
  return { node: g, ports };
}

export type PixelImageOpts = Loose<{
  palette: readonly string[]; skipBelow: number; frame: boolean; gap: number; overlap: number;
}>;

export function pixelImage(
  p: Parent, x: number, y: number, w: number, data: readonly (readonly number[])[], o: PixelImageOpts = {},
): { node: SVGGElement; w: number; h: number } {
  const g = el(p, 'g', { 'data-part': 'pixel-image' });
  const R = data.length;
  const Cc = at(data, 0).length;
  const s = w / Cc;
  const overlap = o.overlap ?? 0;
  const gap = o.gap ?? 0;
  const cg = overlap !== 0 ? el(g, 'g', { 'clip-path': clipPath(p, `M${f3(x)},${f3(y)} h${f3(w)} v${f3(R * s)} h${f3(-w)} Z`) }) : g;
  const ov = overlap !== 0 ? overlap * s : gap !== 0 ? -gap * s : s * 0.04;
  for (let i = 0; i < R; i++) {
    for (let j = 0; j < Cc; j++) {
      const v = at(at(data, i), j);
      if (v < (o.skipBelow ?? 0.03)) continue;
      rect(cg, x + j * s, y + i * s, s + ov, s + ov, { fill: ramp(o.palette ?? ['#ffffff', '#000000'], v) });
    }
  }
  if (o.frame === true) rect(g, x, y, w, R * s, { stroke: C.ink, width: STYLE.line.thin });
  return { node: g, w, h: R * s };
}

export function fadeCard(
  p: Parent, x: number, y: number, w: number, h: number, side: 'left' | 'right' | 'top' | 'bottom' = 'right', o: Loose<{ fill: string; r: number }> = {},
): SVGRectElement {
  const fill = o.fill ?? C.tintGrey;
  const ang = side === 'left' || side === 'right' ? 0 : 90;
  const st: GradientStop[] = side === 'left' || side === 'top' ? [[0, fill, 0], [1, fill, 1]] : [[0, fill, 1], [1, fill, 0]];
  return rect(p, x, y, w, h, { r: o.r ?? 3, fill: linearGradient(p, st, ang), part: 'fade-card' });
}

export type Funnel = readonly [number, number, number];

export function flare(p: Parent, a: Funnel, b: Funnel, o: Loose<{ fill: string; k: number; fade: boolean }> = {}): SVGPathElement {
  const [ax0, ax1, ay] = a;
  const [bx0, bx1, by] = b;
  const fill = o.fill ?? '#efefef';
  const k = o.k ?? 0.6;
  const gr = (o.fade ?? true) ? linearGradient(p, [[0, fill, 1], [1, fill, 0.55]], 90) : fill;
  const d =
    `M${ax0},${ay} L${ax1},${ay} C${ax1},${ay + (by - ay) * k} ${bx1},${ay + (by - ay) * (1 - k) * 0.4} ${bx1},${by}` +
    ` L${bx0},${by} C${bx0},${ay + (by - ay) * (1 - k) * 0.4} ${ax0},${ay + (by - ay) * k} ${ax0},${ay} Z`;
  return path(p, d, { fill: gr, part: 'zoom' });
}

export type GlassSlabOpts = Loose<{ color: string; opacity: number; end: number }>;

function shifted(q: Point, dx: number, dy: number): Point {
  return [q[0] + dx, q[1] + dy];
}

export function glassSlab(p: Parent, E: readonly Point[], dx: number, dy: number, o: GlassSlabOpts = {}): SVGGElement {
  const color = o.color ?? '#BFE6F6';
  const opacity = o.opacity ?? 0.55;
  const g = el(p, 'g', { 'data-part': 'glass-slab' });
  const side = linearGradient(p, [[0, shade(color, -0.1)], [0.5, shade(color, 0.35)], [1, color]], 0);
  const far: Point[] = [];
  for (const q of E) far.push(shifted(q, dx, dy));
  polygon(g, far, { fill: color, opacity });
  for (let i = 0; i < 4; i++) {
    const a = at(E, i);
    const b = at(E, (i + 1) % 4);
    polygon(g, [a, b, shifted(b, dx, dy), shifted(a, dx, dy)], { fill: side, opacity });
  }
  polygon(g, E, { fill: shade(color, -0.12), opacity: o.end ?? 0.8 });
  return g;
}

export interface StateRun {
  state: string | number;
  pts: Point[];
}

function stateRuns(pts: readonly Point[], states: readonly (string | number)[]): StateRun[] {
  const runs: StateRun[] = [];
  let k0 = 0;
  for (let k = 1; k <= pts.length - 1; k++) {
    if (k === pts.length - 1 || states[k] !== states[k0]) {
      runs.push({ state: at(states, k0), pts: pts.slice(k0, k + 1) });
      k0 = k;
    }
  }
  return runs;
}

function pointList(a: readonly Point[]): string {
  let s = '';
  for (let i = 0; i < a.length; i++) {
    const q = at(a, i);
    s += `${i > 0 ? ' ' : ''}${f3(q[0])},${f3(q[1])}`;
  }
  return s;
}

export function statePolyline(
  p: Parent, pts: readonly Point[], states: readonly (string | number)[], styles: Record<string, Paint>, o: Loose<{ part: string }> = {},
): { node: SVGGElement; runs: StateRun[] } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'state-polyline' });
  const runs = stateRuns(pts, states);
  for (const r of runs) {
    const s = styles[String(r.state)];
    if (s !== undefined && r.pts.length > 1) {
      el(g, 'polyline', { points: pointList(r.pts), ...paint({ stroke: C.ink, ...s }), 'data-part': 'state-run' });
    }
  }
  return { node: g, runs };
}

export type Interval = readonly [number, number];

export type DensityOpts = Loose<{
  n: number; color: string; fill: string; width: number; shade: Interval | readonly Interval[]; shadeFill: string;
  baseline: boolean; opacity: number;
}>;

function isInterval(sh: Interval | readonly Interval[]): sh is Interval {
  return typeof sh[0] === 'number';
}

function densityPts(curve: CurveSpec, base: number, a: number, b: number, n: number): Point[] {
  const out: Point[] = [];
  for (const x of linspace(a, b, n)) out.push([x, base - evalCurve(curve, x)]);
  return out;
}

export function density(
  p: Parent, curve: CurveSpec, x0: number, x1: number, base: number, o: DensityOpts = {},
): { node: SVGGElement; pts: Point[] } {
  const n = o.n ?? 120;
  const color = o.color ?? C.blue;
  const opacity = o.opacity ?? 1;
  const g = el(p, 'g', { 'data-part': 'density', opacity: opacity === 1 ? undefined : opacity });
  const pts = densityPts(curve, base, x0, x1, n);
  polygon(g, [[x0, base], ...pts, [x1, base]], { fill: o.fill ?? shade(color, 0.85), part: 'density-fill' });
  const sh = o.shade;
  const ivs: readonly Interval[] = sh === undefined ? [] : isInterval(sh) ? [sh] : sh;
  for (const [a0, b0] of ivs) {
    const a = Math.max(x0, a0);
    const b = Math.min(x1, b0);
    const q = densityPts(curve, base, a, b, Math.max(8, Math.round((n * (b - a)) / (x1 - x0))));
    polygon(g, [[a, base], ...q, [b, base]], { fill: o.shadeFill ?? shade(color, 0.45), part: 'density-shade' });
  }
  path(g, dPts(pts, false), { stroke: color, width: o.width ?? STYLE.line.normal, part: 'density-curve' });
  if (o.baseline ?? true) line(g, [x0, base], [x1, base], { stroke: C.ink, width: STYLE.line.thin, cap: 'butt' });
  return { node: g, pts };
}
