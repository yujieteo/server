// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, clipPath, ellipse, path, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import type { Part, Reg, Sampled } from './bio-util.ts';
import { centroid, ellD, floorOf, fw, nz, pol, reg, sampleCurve } from './bio-util.ts';

export type BilayerOpts = Reg &
  Loose<{
    closed: boolean;
    half: number;
    r: number;
    step: number;
    head: string;
    headStroke: string;
    headWidth: number;
    tail: string;
    tailWidth: number;
    tailOff: readonly number[];
    wave: number;
    waves: number;
    midGap: number;
    band: string | false;
    leaflets: readonly number[];
  }>;
export interface BilayerResult extends Part {
  d: string;
  length: number;
}

interface Slot {
  x: number;
  y: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
}

function leafletRow(D: Sampled['pts'], side: number, half: number, step: number): Slot[] {
  const off: Slot[] = [];
  for (const q of D) off.push({ x: q.x - q.ty * side * half, y: q.y + q.tx * side * half, nx: -q.ty * side, ny: q.tx * side, tx: q.tx, ty: q.ty });
  const row: Slot[] = [];
  let acc = step;
  for (let i = 0; i < off.length; i++) {
    const cur = at(off, i);
    if (i > 0) {
      const prev = at(off, i - 1);
      acc += Math.hypot(cur.x - prev.x, cur.y - prev.y);
    }
    if (acc >= step) {
      row.push(cur);
      acc = 0;
    }
  }
  return row;
}

function tailPath(rows: readonly Slot[][], o: BilayerOpts, half: number, r: number): string {
  const wave = o.wave ?? 0.045 * half;
  const waves = o.waves ?? 3.2;
  const nseg = Math.max(6, Math.round(waves * 4));
  const len = half - r * 0.6 - (o.midGap ?? 0.025 * half);
  let td = '';
  for (const row of rows) {
    for (const q of row) {
      for (const off of o.tailOff ?? [-0.11 * half, 0.11 * half]) {
        const x0 = q.x - q.nx * r * 0.6 + q.tx * off;
        const y0 = q.y - q.ny * r * 0.6 + q.ty * off;
        td += `M${f3(x0)},${f3(y0)}`;
        for (let i = 1; i <= nseg; i++) {
          const t = i / nseg;
          const w = Math.sin(t * Math.PI * 2 * waves) * wave;
          td += ` L${f3(x0 - q.nx * len * t + q.tx * w)},${f3(y0 - q.ny * len * t + q.ty * w)}`;
        }
      }
    }
  }
  return td;
}

export function bilayer(p: Parent, pts: readonly Point[], o: BilayerOpts = {}): BilayerResult {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'membrane' });
  const half = o.half ?? 3;
  const r = o.r ?? 0.27 * half;
  const step = o.step ?? 0.54 * half;
  const head = o.head ?? '#a4a9d9';
  const { d, pts: D, length } = sampleCurve(g, pts, half / 12, o.closed);
  if (o.band !== false) path(g, d, { stroke: o.band ?? '#fff', width: 2 * half, cap: 'butt' });
  const rows: Slot[][] = [];
  for (const side of o.leaflets ?? [1, -1]) rows.push(leafletRow(D, side, half, step));
  path(g, tailPath(rows, o, half, r), { stroke: o.tail ?? shade(head, -0.08), width: fw(K, o.tailWidth ?? 0.057 * half), part: 'membrane-tails' });
  const hs = o.headStroke ?? shade(head, -0.25);
  const hw = fw(K, o.headWidth ?? 0.06 * half);
  for (const row of rows) for (const q of row) circle(g, q.x, q.y, r, { fill: head, stroke: hs, width: hw, part: 'lipid-head' });
  const m = at(D, Math.floor(D.length / 2));
  const first = at(D, 0);
  const last = at(D, D.length - 1);
  const ports = reg(o, p, { start: [first.x, first.y], mid: [m.x, m.y], end: [last.x, last.y] });
  return { node: g, d, length, ports };
}

export type CellRegionOpts = Reg &
  Loose<{
    closed: boolean;
    fill: string;
    nucleus: { cx: number; cy: number; r: number; fill?: string | undefined; stroke?: string | undefined; width?: number | undefined };
    membrane: BilayerOpts | 'line' | false;
    stroke: string;
    width: number;
  }>;
export interface CellRegionResult extends Part {
  inner: Handle;
  d: string;
  membrane: BilayerResult | undefined;
}

export function cellRegion(p: Parent, membrane: readonly Point[], closeVia: readonly Point[] = [], o: CellRegionOpts = {}): CellRegionResult {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cell-region' });
  const closed = o.closed ?? closeVia.length === 0;
  const md = smooth(membrane, closed, 0.5);
  let d = md;
  if (!closed) {
    for (const [x, y] of closeVia) d += ` L${f3(x)},${f3(y)}`;
    d += 'Z';
  }
  const fill = o.fill ?? '#e1e3f0';
  path(g, d, { fill, part: 'cytoplasm' });
  const inner = group(g, { clip: clipPath(g, d) });
  const nu = o.nucleus;
  if (nu !== undefined) {
    const width = nu.stroke !== undefined ? fw(K, nu.width ?? STYLE.line.thin) : undefined;
    circle(inner, nu.cx, nu.cy, nu.r, { fill: nu.fill ?? shade(fill, -0.07), stroke: nu.stroke, width, part: 'nucleus' });
  }
  const mo = o.membrane ?? {};
  let mem: BilayerResult | undefined;
  if (mo === 'line') path(g, md, { stroke: o.stroke ?? shade(fill, -0.35), width: fw(K, o.width ?? STYLE.line.normal), part: 'membrane' });
  else if (mo !== false) mem = bilayer(g, membrane, { closed, head: shade(fill, -0.3), ...mo });
  const ports = reg(o, p, { start: at(membrane, 0), end: at(membrane, membrane.length - 1), center: centroid(membrane) });
  return { node: g, inner, d, membrane: mem, ports };
}

export type VesicleOpts = Reg &
  Loose<{
    ry: number;
    fill: string;
    stroke: string;
    width: number;
    double: boolean | number;
    inner: 'solid' | 'dashed';
    innerFill: string;
    bud: true | Loose<{ angle: number; r: number; d: number }>;
  }>;

export function vesicle(p: Parent, cx: number, cy: number, r: number, o: VesicleOpts = {}): Part & { inner: Handle } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'vesicle' });
  const ry = o.ry ?? r;
  const fill = o.fill ?? '#e8a6cc';
  const st = o.stroke ?? '#1a1a1a';
  const sw = fw(K, o.width ?? Math.max(0.018 * r, STYLE.line.thin));
  const shapes: [number, number, number, number][] = [[cx, cy, r, ry]];
  let budAt: Point | undefined;
  if (o.bud !== undefined) {
    const b = o.bud === true ? {} : o.bud;
    const a = b.angle ?? -90;
    const br = (b.r ?? 0.42) * r;
    const [bx, by] = pol(cx, cy, (b.d ?? 0.95) * Math.min(r, ry), a);
    shapes.push([bx, by, br, br]);
    budAt = pol(bx, by, br, a);
  }
  for (const [x, y, a, b] of shapes) ellipse(g, x, y, a, b, { fill, stroke: st, width: sw * 2 });
  for (const [x, y, a, b] of shapes) ellipse(g, x, y, a, b, { fill, part: 'lumen' });
  let clipD = ellD(cx, cy, r, ry);
  const hasDouble = o.double !== undefined && o.double !== false && o.double !== 0;
  if (hasDouble || o.inner !== undefined) {
    const gap = typeof o.double === 'number' ? o.double : 0.07 * r;
    const ir = r - gap;
    const iry = ry - gap;
    const dash = o.inner === 'dashed' ? `${f3(0.06 * r)} ${f3(0.04 * r)}` : undefined;
    ellipse(g, cx, cy, ir, iry, { fill: o.innerFill ?? fill, stroke: st, width: sw, dash, part: 'inner-membrane' });
    clipD = ellD(cx, cy, ir, iry);
  }
  const inner = group(g, { clip: clipPath(g, clipD) });
  const base: Record<string, Point> = { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy], top: [cx, cy - ry], bottom: [cx, cy + ry] };
  if (budAt !== undefined) base['bud'] = budAt;
  return { node: g, inner, ports: reg(o, p, base) };
}

export type CrescentOpts = Reg & Loose<{ bulge: number; thick: number; fill: string; stroke: string; width: number }>;

export function crescent(p: Parent, a: Point, b: Point, o: CrescentOpts = {}): { node: SVGPathElement; ports: Part['ports'] } {
  const K = floorOf(p);
  const len = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  const nx = uy;
  const ny = -ux;
  const bu = o.bulge ?? 0.22 * len;
  const th = o.thick ?? 0.07 * len;
  const m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const fill = o.fill ?? '#c5d3ec';
  const c1: Point = [m[0] + nx * 2 * bu, m[1] + ny * 2 * bu];
  const c2: Point = [m[0] + nx * 2 * (bu - th), m[1] + ny * 2 * (bu - th)];
  const d = `M${f3(a[0])},${f3(a[1])} Q${f3(c1[0])},${f3(c1[1])} ${f3(b[0])},${f3(b[1])} Q${f3(c2[0])},${f3(c2[1])} ${f3(a[0])},${f3(a[1])}Z`;
  const node = path(p, d, { fill, stroke: o.stroke ?? '#1a1a1a', width: fw(K, o.width ?? Math.max(0.006 * len, STYLE.line.thin)), part: o.part ?? 'crescent' });
  const ports = reg(o, p, { a, b, apex: [m[0] + nx * bu, m[1] + ny * bu], inside: [m[0] + nx * (bu - th), m[1] + ny * (bu - th)] });
  return { node, ports };
}
