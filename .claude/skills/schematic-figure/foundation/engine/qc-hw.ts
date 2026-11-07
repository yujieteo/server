// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { arrow, blur, line, path, polygon } from './draw.ts';
import { at, unit } from './util.ts';
import { polyD } from './cs-base.ts';
import { C, segGradient } from './qc-base.ts';

export type WellOpts = Loose<{
  part: string;
  hw: number;
  kind: 'harmonic' | 'double';
  power: number;
  barrier: number;
  ghosts: readonly number[];
  ghostColors: readonly string[];
  color: string;
  width: number;
  n: number;
}>;

export interface WellOut {
  node: SVGGElement;
  cx: number;
  hw: number;
  yBot: number;
  depth: number;
  kind: 'harmonic' | 'double';
  power: number;
  m2: number;
  s1: number;
}

function wellShape(w: Pick<WellOut, 'kind' | 'power' | 'm2' | 's1'>, u: number): number {
  if (w.kind === 'double') return (u * u - w.m2) ** 2 / w.s1;
  return Math.abs(u) ** w.power;
}

export function wellY(w: WellOut, x: number): number {
  return w.yBot - w.depth * wellShape(w, (x - w.cx) / w.hw);
}

function wellCurve(g: SVGGElement, w: WellOut, n: number, c0: number, col: string, width: number): void {
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n;
    pts.push([c0 + u * w.hw, w.yBot - w.depth * wellShape(w, u)]);
  }
  path(g, polyD(pts), { stroke: col, width });
}

export function potentialWell(p: Parent, cx: number, yTop: number, yBot: number, o: WellOpts = {}): WellOut {
  const kind = o.kind ?? 'harmonic';
  const q = Math.sqrt(o.barrier ?? 0.3);
  const m2 = q / (1 + q);
  const s1 = (1 - m2) ** 2;
  const g = el(p, 'g', { 'data-part': o.part ?? 'potential' });
  const w: WellOut = { node: g, cx, hw: o.hw ?? 12, yBot, depth: yBot - yTop, kind, power: o.power ?? 2, m2, s1 };
  const gh = o.ghosts ?? [];
  const width = o.width ?? STYLE.line.normal * 1.2;
  for (let i = 0; i < gh.length; i++) {
    const col = o.ghostColors !== undefined ? at(o.ghostColors, i) : shade(C.ink, 0.8 - 0.45 * (gh.length > 1 ? i / (gh.length - 1) : 1));
    wellCurve(g, w, o.n ?? 90, cx + at(gh, i), col, width);
  }
  wellCurve(g, w, o.n ?? 90, cx, o.color ?? C.ink, width);
  return w;
}

export type BeamOpts = Loose<{
  part: string;
  w0: number;
  wIn: number;
  wOut: number;
  color: string;
  opacity: number;
  fade: boolean;
  head: boolean;
  headWidth: number;
  headLength: number;
  tailColor: string;
}>;

function edgePair(pt: Point, nx: number, ny: number, w: number): [Point, Point] {
  return [[pt[0] + (nx * w) / 2, pt[1] + (ny * w) / 2], [pt[0] - (nx * w) / 2, pt[1] - (ny * w) / 2]];
}

export function laserBeam(p: Parent, from: Point, focus: Point, to: Point, o: BeamOpts = {}): SVGGElement {
  const w0 = o.w0 ?? 3;
  const wIn = o.wIn ?? w0 * 4;
  const wOut = o.wOut ?? w0 * 1.6;
  const col = o.color ?? '#9A5CC8';
  const op = o.opacity ?? 0.75;
  const g = el(p, 'g', { 'data-part': o.part ?? 'beam' });
  const [ux, uy] = unit(focus[0] - from[0], focus[1] - from[1]);
  const [vx, vy] = unit(to[0] - focus[0], to[1] - focus[1]);
  const [a1, a2] = edgePair(from, -uy, ux, wIn);
  const [f1, f2] = edgePair(focus, -uy, ux, w0);
  const tc = o.tailColor ?? col;
  const tail = o.fade === false ? col : segGradient(p, from, focus, [[0, tc, 0], [0.45, tc, op * 0.35], [1, col, op]]);
  polygon(g, [a1, f1, f2, a2], { fill: tail, fillOpacity: o.fade === false ? op : undefined });
  const hl = o.head === false ? 0 : (o.headLength ?? wOut * 1.5);
  const hw = o.headWidth ?? wOut * 2.3;
  const se: Point = [to[0] - vx * hl, to[1] - vy * hl];
  const [g1, g2] = edgePair(focus, -vy, vx, w0);
  const [s1, s2] = edgePair(se, -vy, vx, wOut);
  const [h1, h2] = edgePair(se, -vy, vx, hw);
  const body = segGradient(p, focus, to, [[0, col, op], [1, col, op * 0.8]]);
  polygon(g, hl !== 0 ? [g1, s1, h1, to, h2, s2, g2] : [g1, s1, s2, g2], { fill: body });
  return g;
}

export type CouplingOpts = Loose<{ part: string; n: number; h: number; inset: number; color: string; color2: string; width: number; blur: number }>;

export function coupling(p: Parent, a: Point, b: Point, o: CouplingOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'coupling' });
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
  const nx = -uy;
  const ny = ux;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = o.n ?? 6;
  const h = o.h ?? len * 0.45;
  const ins = o.inset ?? len * 0.3;
  const flt = o.blur !== undefined && o.blur !== 0 ? blur(p, o.blur) : undefined;
  for (let i = 0; i < n; i++) {
    const s = -h / 2 + (h * i) / Math.max(1, n - 1);
    const c = i % 2 !== 0 ? (o.color2 ?? '#f2e6fa') : (o.color ?? '#9a5cd0');
    line(g, [a[0] + ux * ins + nx * s, a[1] + uy * ins + ny * s], [b[0] - ux * ins + nx * s, b[1] - uy * ins + ny * s], { stroke: c, width: o.width ?? STYLE.line.thin, filter: flt });
  }
  return g;
}

export type SwapOpts = Loose<{ part: string; r: number; bend: number; stroke: string; width: number; head: number }>;

export function swapArrows(p: Parent, a: Point, b: Point, o: SwapOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'swap-arrows' });
  const [ux, uy] = unit(b[0] - a[0], b[1] - a[1]);
  const nx = uy;
  const ny = -ux;
  const r = o.r ?? 3;
  const st = { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, head: o.head ?? 2.4, bend: o.bend ?? 0.45 };
  arrow(g, [b[0] + nx * r, b[1] + ny * r], [a[0] + nx * r, a[1] + ny * r], st);
  arrow(g, [a[0] - nx * r, a[1] - ny * r], [b[0] - nx * r, b[1] - ny * r], st);
  return g;
}
