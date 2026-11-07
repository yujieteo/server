// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { Figure, Loose, Parent, TextOpts } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, rect } from './draw.ts';
import { at } from './util.ts';
import { fitText, reg, tw } from './cs-base.ts';

const C = STYLE.color;

export type GridRuleSpec = { at: number } & Loose<{ from: number; to: number; ext0: number; ext1: number; stroke: string; width: number; dash: string }>;
export type GridRule = number | GridRuleSpec;
export type GridRules = 'all' | 'inner' | 'none' | readonly GridRule[];
export type GridCellSpec = { s: string } & TextOpts & Loose<{ fit: boolean }>;
export type GridCell = string | null | GridCellSpec;

export type GridOpts = Loose<{
  part: string;
  stroke: string;
  width: number;
  ext: number;
  h: GridRules;
  v: GridRules;
  cells: readonly (readonly (GridCell | undefined)[])[];
  size: number;
  color: string;
  family: string;
  align: 'middle' | 'start' | 'end';
  pad: number;
  fit: boolean;
}>;

export interface CellBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface GridOut {
  node: SVGGElement;
  xs: number[];
  ys: number[];
}

function interp(A: readonly number[], t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  if (i >= A.length - 1) return at(A, A.length - 1);
  return at(A, i) + (at(A, i + 1) - at(A, i)) * f;
}

function ruleList(s: GridRules | undefined, n: number): readonly GridRule[] {
  if (s === 'none') return [];
  const out: GridRule[] = [];
  if (s === 'inner') {
    for (let i = 1; i < n; i++) out.push(i);
    return out;
  }
  if (s === undefined || s === 'all') {
    for (let i = 0; i <= n; i++) out.push(i);
    return out;
  }
  return s;
}

function gridRule(rules: SVGGElement, o: GridOpts, r0: GridRule, along: readonly number[], across: readonly number[], nAcross: number, horiz: boolean): void {
  const r: GridRuleSpec = typeof r0 === 'number' ? { at: r0 } : r0;
  const e0 = r.ext0 ?? o.ext ?? 0;
  const e1 = r.ext1 ?? o.ext ?? 0;
  const c = interp(along, r.at);
  const s0 = interp(across, r.from ?? 0) - e0;
  const s1 = interp(across, r.to ?? nAcross) + e1;
  line(rules, horiz ? [s0, c] : [c, s0], horiz ? [s1, c] : [c, s1], {
    stroke: r.stroke ?? o.stroke ?? C.ink,
    width: r.width ?? o.width ?? STYLE.line.thin,
    cap: 'butt',
    dash: r.dash,
  });
}

export function gridCell(G: GridOut, i: number, j: number): CellBox {
  const x0 = at(G.xs, j);
  const x1 = at(G.xs, j + 1);
  const y0 = at(G.ys, i);
  const y1 = at(G.ys, i + 1);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function gridCells(g: SVGGElement, G: GridOut, o: GridOpts, cells: readonly (readonly (GridCell | undefined)[])[]): void {
  const tg = el(g, 'g', { 'data-part': 'grid-cells' });
  const pad = o.pad ?? 1.5;
  for (let i = 0; i < cells.length; i++) {
    const row = at(cells, i);
    for (let j = 0; j < row.length; j++) {
      const c0 = row[j];
      if (c0 === undefined || c0 === null || c0 === '') continue;
      const c: GridCellSpec = typeof c0 === 'string' ? { s: c0 } : c0;
      const k = gridCell(G, i, j);
      const al = c.anchor ?? o.align ?? 'middle';
      const tx = al === 'start' ? k.x + pad : al === 'end' ? k.x + k.w - pad : k.cx;
      const st: TextOpts = { size: o.size, family: o.family, color: o.color, ...c, anchor: al, valign: 'middle' };
      if ((c.fit ?? o.fit) === true) fitText(tg, tx, k.cy, c.s, k.w - 2 * pad, st);
      else text(tg, tx, k.cy, c.s, st);
    }
  }
}

export function grid(p: Parent, x: number, y: number, cols: readonly number[], rows: readonly number[], o: GridOpts = {}): GridOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'grid' });
  const xs = [x];
  const ys = [y];
  for (const w of cols) xs.push(at(xs, xs.length - 1) + w);
  for (const h of rows) ys.push(at(ys, ys.length - 1) + h);
  const rules = el(g, 'g', { 'data-part': 'grid-rules' });
  for (const r of ruleList(o.h, rows.length)) gridRule(rules, o, r, ys, xs, cols.length, true);
  for (const r of ruleList(o.v, cols.length)) gridRule(rules, o, r, xs, ys, rows.length, false);
  const G: GridOut = { node: g, xs, ys };
  if (o.cells !== undefined) gridCells(g, G, o, o.cells);
  return G;
}

export type CacheCell = string | null | false | Loose<{ fill: string; stroke: string; ghost: boolean }>;

export type CacheGridOpts = Loose<{
  part: string;
  cw: number;
  ch: number;
  gap: number;
  gapX: number;
  gapY: number;
  cells: readonly (readonly (CacheCell | undefined)[])[];
  stroke: string;
  width: number;
  r: number;
  ghostStroke: string;
  F: Figure;
  name: string;
}>;

export interface CacheGridOut {
  node: SVGGElement;
  w: number;
  h: number;
  x: number;
  y: number;
  cw: number;
  ch: number;
  gx: number;
  gy: number;
}

export function cacheCell(G: CacheGridOut, r: number, c: number): CellBox {
  const x0 = G.x + c * (G.cw + G.gx);
  const y0 = G.y + r * (G.ch + G.gy);
  return { x: x0, y: y0, w: G.cw, h: G.ch, cx: x0 + G.cw / 2, cy: y0 + G.ch / 2 };
}

function cacheValue(o: CacheGridOpts, r: number, c: number): CacheCell | undefined {
  if (o.cells === undefined) return C.blue;
  const row = o.cells[r];
  return row === undefined ? undefined : row[c];
}

export function cacheGrid(p: Parent, x: number, y: number, rows: number, cols: number, o: CacheGridOpts = {}): CacheGridOut {
  const cw = o.cw ?? 6;
  const ch = o.ch ?? 6;
  const gx = o.gapX ?? o.gap ?? 1.2;
  const gy = o.gapY ?? o.gap ?? 1.2;
  const g = el(p, 'g', { 'data-part': o.part ?? 'cache-grid' });
  const W = cols * cw + (cols - 1) * gx;
  const H = rows * ch + (rows - 1) * gy;
  const G: CacheGridOut = { node: g, w: W, h: H, x, y, cw, ch, gx, gy };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = cacheValue(o, r, c);
      if (v === false || v === undefined) continue;
      const k = cacheCell(G, r, c);
      const spec: Loose<{ fill: string; stroke: string; ghost: boolean }> | null = typeof v === 'string' ? { fill: v } : v;
      if (spec === null || spec.ghost === true) {
        rect(g, k.x, k.y, k.w, k.h, { fill: 'none', stroke: o.ghostStroke ?? '#b8b8b8', width: STYLE.line.thin, r: o.r ?? 0.6, dash: [1, 0.8] });
      } else {
        rect(g, k.x, k.y, k.w, k.h, { fill: spec.fill, stroke: spec.stroke ?? o.stroke ?? 'none', width: o.width ?? STYLE.line.thin, r: o.r ?? 0.6 });
      }
    }
  }
  reg(o.F, o.name, p, { top: [x + W / 2, y], bottom: [x + W / 2, y + H], left: [x, y + H / 2], right: [x + W, y + H / 2], center: [x + W / 2, y + H / 2] });
  return G;
}

export type AttnOpts = Loose<{
  part: string;
  barW: number;
  maxH: number;
  fill: string | readonly string[];
  stroke: string | readonly string[];
  width: number;
  norm: 'softmax' | 'sum' | 'max' | false;
  temp: number;
}>;

function pick(v: string | readonly string[], i: number): string {
  return typeof v === 'string' ? v : at(v, i % v.length);
}

function maxOf(w: readonly number[]): number {
  let m = -Infinity;
  for (const v of w) m = Math.max(m, v);
  return m;
}

function attnWeights(scores: readonly number[], norm: 'softmax' | 'sum' | 'max' | false, T: number): number[] {
  if (norm === 'softmax') {
    const m = maxOf(scores);
    const e: number[] = [];
    for (const s of scores) e.push(Math.exp((s - m) / T));
    let z = 0;
    for (const v of e) z += v;
    const out: number[] = [];
    for (const v of e) out.push(v / z);
    return out;
  }
  if (norm === 'sum') {
    let z = 0;
    for (const v of scores) z += v;
    if (z === 0 || Number.isNaN(z)) z = 1;
    const out: number[] = [];
    for (const v of scores) out.push(v / z);
    return out;
  }
  return [...scores];
}

export function attnStrip(p: Parent, xs: readonly number[], yBase: number, scores: readonly number[], o: AttnOpts = {}): { node: SVGGElement; weights: number[] } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'attn-strip' });
  const norm = o.norm ?? 'softmax';
  const w = attnWeights(scores, norm, o.temp ?? 1);
  const mx = maxOf(w);
  const top = norm === false ? 1 : mx === 0 || Number.isNaN(mx) ? 1 : mx;
  const maxH = o.maxH ?? 8;
  const bw = o.barW ?? 3;
  for (let i = 0; i < w.length; i++) {
    const h = (maxH * at(w, i)) / top;
    if (h <= 0) continue;
    rect(g, at(xs, i) - bw / 2, yBase - h, bw, h, { fill: pick(o.fill ?? '#c9d9ee', i), stroke: pick(o.stroke ?? C.blue, i), width: o.width ?? STYLE.line.thin });
  }
  return { node: g, weights: w };
}

export type BarLayer = Loose<{ h: number; fill: string; stroke: string; span: 'full' | 'shard' | 'none' | readonly [number, number] }>;
export type StackedBarOpts = Loose<{ part: string; shardAt: number; shardW: number; dir: 'down' | 'up'; stroke: string; width: number; gap: number }>;

export function stackedBar(p: Parent, x: number, y: number, w: number, layers: readonly BarLayer[], o: StackedBarOpts = {}): { node: SVGGElement; top: number; bottom: number; shard: [number, number] } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'stacked-bar' });
  const sw = o.shardW ?? w / 16;
  const sx = x + (w - sw) * (o.shardAt ?? 0);
  const up = o.dir === 'up';
  let cur = y;
  for (const L of layers) {
    const h = L.h ?? 4;
    const sp = L.span ?? 'full';
    const ly = up ? cur - h : cur;
    if (sp !== 'none') {
      const x0 = sp === 'full' ? x : sp === 'shard' ? sx : x + w * sp[0];
      const x1 = sp === 'full' ? x + w : sp === 'shard' ? sx + sw : x + w * sp[1];
      rect(g, x0, ly, x1 - x0, h, { fill: L.fill ?? C.light, stroke: L.stroke ?? o.stroke, width: o.width ?? STYLE.line.hair, part: 'bar-layer' });
    }
    cur = up ? ly - (o.gap ?? 0) : ly + h + (o.gap ?? 0);
  }
  return { node: g, top: up ? cur : y, bottom: up ? y : cur, shard: [sx, sx + sw] };
}

export type LegendItem = { label: string } & Loose<{ fill: string; stroke: string; shape: 'rect' | 'line' | 'circle'; width: number }>;
export type LegendOpts = Loose<{
  part: string;
  dir: 'h' | 'v';
  swatch: readonly [number, number];
  gap: number;
  spacing: number | 'auto';
  sep: number;
  size: number;
  color: string;
  family: string;
  r: number;
}>;

export function swatchLegend(p: Parent, x: number, y: number, items: readonly LegendItem[], o: LegendOpts = {}): { node: SVGGElement; width: number; height: number } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'legend' });
  const size = o.size ?? STYLE.text.label;
  const [sw, sh] = o.swatch ?? [size * 1.1, size * 0.6];
  const gap = o.gap ?? size * 0.35;
  const V = o.dir === 'v';
  const sep = o.sep ?? size * 1.2;
  let cx = x;
  let cy = y;
  let maxW = 0;
  for (const it of items) {
    const shape = it.shape ?? 'rect';
    if (shape === 'line') line(g, [cx, cy], [cx + sw, cy], { stroke: it.fill ?? it.stroke ?? C.ink, width: it.width ?? STYLE.line.bold, cap: 'butt' });
    else if (shape === 'circle') circle(g, cx + sw / 2, cy, sh / 2, { fill: it.fill, stroke: it.stroke, width: STYLE.line.thin });
    else rect(g, cx, cy - sh / 2, sw, sh, { fill: it.fill, stroke: it.stroke, width: STYLE.line.thin, r: o.r ?? 0 });
    const t = text(g, cx + sw + gap, cy, it.label, { size, valign: 'middle', color: o.color, family: o.family });
    const itemW = sw + gap + tw(t);
    maxW = Math.max(maxW, itemW);
    if (V) cy += o.spacing === undefined || o.spacing === 'auto' ? size * 1.5 : o.spacing;
    else cx += o.spacing === undefined || o.spacing === 'auto' ? itemW + sep : o.spacing;
  }
  return { node: g, width: V ? maxW : cx - x - sep, height: V ? cy - y : sh };
}
