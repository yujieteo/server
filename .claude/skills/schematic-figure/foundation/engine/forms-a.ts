// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/forms.js
import type { Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, ramp, shade } from './style.ts';
import { blur, ellipse, line, linearGradient, path, polygon, radialGradient, smooth } from './draw.ts';
import { at, linspace } from './util.ts';

const C = STYLE.color;

export function f2(v: number): string {
  return v.toFixed(2);
}

export function fp(q: Point): string {
  return `${f2(q[0])},${f2(q[1])}`;
}

export function pointsD(pts: readonly Point[]): string {
  let d = 'M';
  for (let i = 0; i < pts.length; i++) d += `${i > 0 ? ' L' : ''}${fp(at(pts, i))}`;
  return d;
}

export interface Affine {
  o: Point;
  eu: Point;
  ev: Point;
}

export function affinePoint(a: Affine, u: number, v: number): Point {
  return [a.o[0] + a.eu[0] * u + a.ev[0] * v, a.o[1] + a.eu[1] * u + a.ev[1] * v];
}

export type BraceOpts = Loose<{ depth: number; side: number; stroke: string; width: number; label: string; labelGap: number; size: number }>;

function bracePoints(frame: Affine, L: number, depth: number): Point[] {
  const q = depth / 2;
  const m = L / 2;
  const spec: Point[] = [
    [0, 0], [0, q], [q, q], [m - q, q], [m - q * 0.2, q * 1.2], [m, depth], [m + q * 0.2, q * 1.2], [m + q, q], [L - q, q], [L, q], [L, 0],
  ];
  const pts: Point[] = [];
  for (const [s, d] of spec) pts.push(affinePoint(frame, s, d));
  return pts;
}

function bracePathD(pts: readonly Point[]): string {
  const cut = [[0, 'M'], [1, ' Q'], [2, ' '], [3, ' L'], [4, ' Q'], [5, ' '], [6, ' Q'], [7, ' '], [8, ' L'], [9, ' Q'], [10, ' ']] as const;
  let d = '';
  for (const [i, lead] of cut) d += lead + fp(at(pts, i));
  return d;
}

export function brace(p: Parent, a: Point, b: Point, o: BraceOpts = {}): SVGGElement {
  const depth = o.depth ?? 3;
  const side = o.side ?? 1;
  const g = el(p, 'g', { 'data-part': 'brace' });
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy);
  const ux = dx / L;
  const uy = dy / L;
  const frame: Affine = { o: a, eu: [ux, uy], ev: [-uy * side, ux * side] };
  path(g, bracePathD(bracePoints(frame, L, depth)), { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.thin });
  if (o.label !== undefined && o.label !== '') {
    const [tx, ty] = affinePoint(frame, L / 2, depth + (o.labelGap ?? 1.5));
    const nx = frame.ev[0];
    const ny = frame.ev[1];
    text(g, tx, ty, o.label, {
      anchor: Math.abs(nx) > 0.5 ? (nx > 0 ? 'start' : 'end') : 'middle',
      valign: Math.abs(ny) > 0.5 ? (ny > 0 ? 'top' : 'bottom') : 'middle',
      size: o.size,
    });
  }
  return g;
}

export type PlaneOpts = Loose<{ fill: string; stroke: string; width: number; opacity: number; r: number }>;

export interface PlaneResult extends Affine {
  node: SVGGElement;
  inner: SVGGElement;
  scale: number;
  corners: Point[];
}

export function roundedPoly(pts: readonly Point[], r: number = 0): string {
  if (r === 0) return `${pointsD(pts)}Z`;
  const n = pts.length;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = at(pts, (i - 1 + n) % n);
    const b = at(pts, i);
    const c = at(pts, (i + 1) % n);
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, la / 2, lc / 2);
    const p1: Point = [b[0] + ((a[0] - b[0]) / la) * rr, b[1] + ((a[1] - b[1]) / la) * rr];
    const p2: Point = [b[0] + ((c[0] - b[0]) / lc) * rr, b[1] + ((c[1] - b[1]) / lc) * rr];
    d += `${i > 0 ? ' L' : 'M'}${fp(p1)} Q${fp(b)} ${fp(p2)}`;
  }
  return `${d}Z`;
}

export function plane(p: Parent, o: Point, eu: Point, ev: Point, opts: PlaneOpts = {}): PlaneResult {
  const fill = opts.fill ?? '#e9e9e9';
  const frame: Affine = { o, eu, ev };
  const g = el(p, 'g', { 'data-part': 'plane' });
  const corners: Point[] = [affinePoint(frame, 0, 0), affinePoint(frame, 1, 0), affinePoint(frame, 1, 1), affinePoint(frame, 0, 1)];
  if (fill !== '' || (opts.stroke !== undefined && opts.stroke !== '')) {
    path(g, roundedPoly(corners, opts.r ?? 0), { fill, stroke: opts.stroke, width: opts.width ?? STYLE.line.thin, opacity: opts.opacity ?? 1 });
  }
  const m = [eu[0], eu[1], ev[0], ev[1], o[0], o[1]];
  let mat = '';
  for (let i = 0; i < m.length; i++) mat += `${i > 0 ? ' ' : ''}${f2(at(m, i))}`;
  const inner = el(g, 'g', { transform: `matrix(${mat})` });
  const scale = Math.sqrt(Math.abs(eu[0] * ev[1] - eu[1] * ev[0]));
  return { node: g, inner, o, eu, ev, scale, corners };
}

export function planeWidth(pl: PlaneResult, pt: number): number {
  return pt / pl.scale;
}

export type GlossyOpts = Loose<{ color: string; shadow: boolean; highlight: number }>;

export function glossyNode(p: Parent, cx: number, cy: number, rx: number, ry: number = rx, o: GlossyOpts = {}): SVGGElement {
  const color = o.color ?? C.blue;
  const highlight = o.highlight ?? 0.55;
  const g = el(p, 'g', { 'data-part': 'glossy-node' });
  if (o.shadow ?? true) ellipse(g, cx + rx * 0.08, cy + ry * 0.95, rx * 0.8, ry * 0.18, { fill: '#000', opacity: 0.18, filter: blur(p, rx * 0.12) });
  ellipse(g, cx, cy, rx, ry, {
    fill: radialGradient(p, [[0, shade(color, highlight)], [0.55, color], [1, shade(color, -0.35)]], { cx: 0.35, cy: 0.3, r: 0.75 }),
  });
  ellipse(g, cx - rx * 0.32, cy - ry * 0.4, rx * 0.28, ry * 0.16, { fill: '#fff', opacity: 0.55, filter: blur(p, rx * 0.05) });
  return g;
}

export type ChevronOpts = Loose<{ len: number; spread: number; stroke: string; width: number }>;

export function chevron(p: Parent, tip: Point, dir: Point, o: ChevronOpts = {}): SVGPathElement {
  const len = o.len ?? 2.6;
  const spread = o.spread ?? 0.55;
  const [ux, uy] = dir;
  const nx = -uy;
  const ny = ux;
  const d = `M${f2(tip[0] - ux * len + nx * len * spread)},${f2(tip[1] - uy * len + ny * len * spread)} L${f2(tip[0])},${f2(tip[1])} L${f2(tip[0] - ux * len - nx * len * spread)},${f2(tip[1] - uy * len - ny * len * spread)}`;
  return path(p, d, { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.normal, join: 'miter' });
}

export type DoubleArrowOpts = Loose<{ gap: number; stroke: string; width: number; head: number }>;

export function doubleArrow(p: Parent, a: Point, b: Point, o: DoubleArrowOpts = {}): SVGGElement {
  const gap = o.gap ?? 1.1;
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.thin;
  const head = o.head ?? 2.4;
  const g = el(p, 'g', { 'data-part': 'double-arrow' });
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L;
  const uy = (b[1] - a[1]) / L;
  const nx = -uy;
  const ny = ux;
  for (const s of [-1, 1]) {
    line(g, [a[0] + (nx * gap * s) / 2, a[1] + (ny * gap * s) / 2], [b[0] - ux * head * 0.6 + (nx * gap * s) / 2, b[1] - uy * head * 0.6 + (ny * gap * s) / 2], { stroke, width, cap: 'butt' });
  }
  chevron(g, b, [ux, uy], { len: head, spread: 0.65, stroke, width });
  return g;
}

export type PulseOpts = Loose<{ sigma: number; h: number; span: number; color: string; fill: string | false; width: number; baseline: boolean }>;

export function pulse(p: Parent, cx: number, y: number, o: PulseOpts = {}): SVGGElement {
  const sigma = o.sigma ?? 1.6;
  const h = o.h ?? 6;
  const color = o.color ?? C.beam;
  const g = el(p, 'g', { 'data-part': 'pulse' });
  const pts: Point[] = [];
  for (const x of linspace(cx - (o.span ?? 4) * sigma, cx + (o.span ?? 4) * sigma, 80)) pts.push([x, y - h * Math.exp(-((x - cx) ** 2) / (2 * sigma * sigma))]);
  const first = at(pts, 0);
  const last = at(pts, pts.length - 1);
  if (o.fill !== false) polygon(g, [[first[0], y], ...pts, [last[0], y]], { fill: o.fill ?? shade(color, 0.6) });
  path(g, smooth(pts, false, 0.4), { stroke: color, width: o.width ?? STYLE.line.normal });
  if (o.baseline ?? false) line(g, [first[0], y], [last[0], y], { stroke: C.ink, width: STYLE.line.thin });
  return g;
}

export type Axes3Opts = Loose<{ labels: readonly string[]; dashed: readonly boolean[]; stroke: string; width: number; head: number; size: number }>;

function axis3(g: SVGGElement, o: Point, v: Point, i: number, opts: Axes3Opts): void {
  const stroke = opts.stroke ?? C.ink;
  const head = opts.head ?? 2.4;
  const b: Point = [o[0] + v[0], o[1] + v[1]];
  const L = Math.hypot(v[0], v[1]);
  const u: Point = [v[0] / L, v[1] / L];
  line(g, o, [b[0] - u[0] * head * 0.7, b[1] - u[1] * head * 0.7], { stroke, width: opts.width ?? STYLE.line.thin, dash: opts.dashed?.[i] === true ? '1.6 1.2' : undefined });
  polygon(g, [
    b,
    [b[0] - u[0] * head - u[1] * head * 0.4, b[1] - u[1] * head + u[0] * head * 0.4],
    [b[0] - u[0] * head + u[1] * head * 0.4, b[1] - u[1] * head - u[0] * head * 0.4],
  ], { fill: stroke });
  const lab = opts.labels?.[i];
  if (lab !== undefined && lab !== '') {
    const ang = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    const flip = ang > 90 || ang < -90;
    const m = [o[0] + v[0] * 0.55 + u[1] * 2.6, o[1] + v[1] * 0.55 - u[0] * 2.6];
    text(g, at(m, 0), at(m, 1), lab, { anchor: 'middle', valign: 'middle', size: opts.size ?? STYLE.text.label, rotate: flip ? ang + 180 : ang });
  }
}

export function axes3(p: Parent, o: Point, ax: Point | undefined, ay: Point | undefined, az: Point | undefined, opts: Axes3Opts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'axes3' });
  const axes = [ax, ay, az];
  for (let i = 0; i < axes.length; i++) {
    const v = axes[i];
    if (v !== undefined) axis3(g, o, v, i, opts);
  }
  return g;
}

export type SurfaceOpts = Loose<{ hz: number; stops: readonly string[]; line: string; width: number; fillOpacity: number }>;

export function surface(p: Parent, ground: Affine, heights: readonly (readonly number[])[], o: SurfaceOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'surface' });
  const rows = heights.length;
  const hz = o.hz ?? 12;
  const stops = o.stops ?? ['#2c1b6b', '#2f6bd6', '#8fd3f0', '#ffffff'];
  for (let r = rows - 1; r >= 0; r--) {
    const row = at(heights, r);
    const cols = row.length - 1;
    const v = r / (rows - 1);
    const pts: Point[] = [];
    let zmax = 0;
    for (let c = 0; c <= cols; c++) {
      const h = at(row, c);
      zmax = Math.max(zmax, h);
      const [x, y] = affinePoint(ground, c / cols, v);
      pts.push([x, y - h * hz]);
    }
    const col = ramp(stops, Math.min(1, zmax));
    polygon(g, [affinePoint(ground, 0, v), ...pts, affinePoint(ground, 1, v)], {
      fill: linearGradient(p, [[0, col], [1, '#ffffff', 0.2]], 90), opacity: o.fillOpacity ?? 0.95,
    });
    path(g, pointsD(pts), { stroke: o.line ?? shade(col, -0.3), width: o.width ?? 0.25 });
  }
  return g;
}

export type RingGlyphOpts = Loose<{ color: string; width: number; highlight: boolean }>;

export function ringGlyph(p: Parent, cx: number, cy: number, rx: number, ry: number, o: RingGlyphOpts = {}): SVGGElement {
  const color = o.color ?? '#3b4a8f';
  const width = o.width ?? 2.2;
  const g = el(p, 'g', { 'data-part': 'ring-glyph' });
  ellipse(g, cx, cy, rx, ry, { stroke: shade(color, -0.25), width: width + 0.5 });
  ellipse(g, cx, cy, rx, ry, { stroke: color, width });
  if (o.highlight ?? true) {
    path(g, `M${f2(cx - rx * 0.7)},${f2(cy - ry * 0.72)} A${f2(rx)},${f2(ry)} 0 0 1 ${f2(cx + rx * 0.5)},${f2(cy - ry * 0.86)}`, {
      stroke: shade(color, 0.5), width: width * 0.3, opacity: 0.8,
    });
  }
  return g;
}
