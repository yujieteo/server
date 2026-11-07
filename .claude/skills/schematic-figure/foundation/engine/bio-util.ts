// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Figure, IllustrateSetting, Loose, Parent, Point, Ports } from './types.ts';
import { ctm, node } from './core.ts';
import { STYLE } from './style.ts';
import { path, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import { illustrating } from './illustrate.ts';

export interface Lineage {
  fill: string;
  stroke: string;
  nucleus: string;
  nstroke: string;
}
export type LineageName = 't' | 'b' | 'myeloid' | 'nk' | 'tumour' | 'grey' | 'red';
export interface Tissue {
  fill: string;
  light: string;
  stroke: string;
  nucleus: string;
  nstroke: string;
}
export type TissueName = 'epi' | 'endo';

export const LINEAGE: Record<LineageName, Lineage> = {
  t: { fill: '#aad5b5', stroke: '#74a983', nucleus: '#6cae84', nstroke: '#579d70' },
  b: { fill: '#a0cfdc', stroke: '#7fa9bd', nucleus: '#78aabf', nstroke: '#6897ac' },
  myeloid: { fill: '#bdbbea', stroke: '#8f8bcf', nucleus: '#8a84c4', nstroke: '#6f69ae' },
  nk: { fill: '#f3cfa6', stroke: '#d29c68', nucleus: '#dfab78', nstroke: '#bf8a55' },
  tumour: { fill: '#e2dfc6', stroke: '#b8b28c', nucleus: '#c8c3a0', nstroke: '#a39c74' },
  grey: { fill: '#c6cbd8', stroke: '#8e96ac', nucleus: '#9ea5b9', nstroke: '#7d859c' },
  red: { fill: '#e6a1a1', stroke: '#c66f73', nucleus: '#c97a80', nstroke: '#ad5d63' },
};

export const TISSUE: Record<TissueName, Tissue> = {
  epi: { fill: '#4d92d4', light: '#79b1e3', stroke: '#2d6db2', nucleus: '#3f82c6', nstroke: '#6aa3dc' },
  endo: { fill: '#f7e6ad', light: '#fbf1cf', stroke: '#e2c56a', nucleus: '#efd07d', nstroke: '#e2c56a' },
};

export interface BioPalette {
  cell: string;
  tumour: string;
  receptor: string;
  virus: string;
  capsid: string;
  rna: string;
  lipid: string;
  body: string;
  outline: string;
  paper: string;
  liquid: string;
  lineage: Record<LineageName, Lineage>;
  tissue: Record<TissueName, Tissue>;
}

export const BIO: BioPalette = {
  cell: '#b7bdcf', tumour: '#d8d4b6', receptor: '#8b93aa', virus: '#8a94ad', capsid: '#dde2eb', rna: '#5f6986',
  lipid: '#8e97b0', body: '#bcc2d3', outline: '#7f89a6', paper: '#f4f6fa', liquid: '#c9d6ea',
  lineage: LINEAGE, tissue: TISSUE,
};

export type Reg = Loose<{ F: Figure; name: string; part: string }>;
export interface Part {
  node: Element;
  ports: Ports;
}

export function palOf(v: LineageName | Lineage | undefined): Lineage | undefined {
  return typeof v === 'string' ? LINEAGE[v] : v;
}

export function rad(d: number): number {
  return (d * Math.PI) / 180;
}

export function pol(cx: number, cy: number, r: number, a: number): Point {
  return [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
}

export function nz(v: number): number {
  return v === 0 || Number.isNaN(v) ? 1 : v;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function mid(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export interface Rand {
  s: number;
}

export function rng(seed: number = 1): Rand {
  const v = Math.abs(seed * 2654435761) >>> 0;
  return { s: v === 0 ? 1 : v };
}

export function rnd(r: Rand): number {
  let s = r.s;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  r.s = s;
  return s / 4294967296;
}

export { vary, varyTint } from './illustrate.ts';
export type { VaryOpts, VaryResult as Vary } from './illustrate.ts';

export function unitScale(p: Parent): number {
  const n = node(p);
  const svg = n instanceof SVGElement && n.ownerSVGElement !== null ? n.ownerSVGElement : n;
  try {
    const m = ctm(svg).inverse().multiply(ctm(n));
    return nz(Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)));
  } catch {
    return 1;
  }
}

export function floorOf(p: Parent): number {
  return (STYLE.line.min * 1.04) / unitScale(p);
}

export function fw(k: number, w: number): number {
  return Math.max(w, k);
}

export function reg(o: Reg, p: Parent, ports: Ports): Ports {
  const F = o.F;
  const name = o.name;
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, q] of Object.entries(ports)) F.anchor(`${name}.${k}`, p, q[0], q[1]);
  }
  return ports;
}

export function pt(q: Point): string {
  return `${f3(q[0])},${f3(q[1])}`;
}

export function lineD(pts: readonly Point[], close: boolean = false): string {
  let d = 'M';
  for (let i = 0; i < pts.length; i++) d += (i > 0 ? ' L' : '') + pt(at(pts, i));
  return close ? d + 'Z' : d;
}

export function rounded(P: readonly Point[], r: number): string {
  const first = at(P, 0);
  let d = `M${pt(first)}`;
  for (let i = 1; i < P.length - 1; i++) {
    const prev = at(P, i - 1);
    const cur = at(P, i);
    const next = at(P, i + 1);
    const la = nz(Math.hypot(cur[0] - prev[0], cur[1] - prev[1]));
    const lb = nz(Math.hypot(next[0] - cur[0], next[1] - cur[1]));
    const rr = Math.min(r, la / 2, lb / 2);
    const ua: Point = [(cur[0] - prev[0]) / la, (cur[1] - prev[1]) / la];
    const ub: Point = [(next[0] - cur[0]) / lb, (next[1] - cur[1]) / lb];
    d += ` L${f3(cur[0] - ua[0] * rr)},${f3(cur[1] - ua[1] * rr)} Q${pt(cur)} ${f3(cur[0] + ub[0] * rr)},${f3(cur[1] + ub[1] * rr)}`;
  }
  return d + ` L${pt(at(P, P.length - 1))}`;
}

export function bez(P: readonly Point[], t: number): Point {
  const Q: Point[] = [];
  for (const q of P) Q.push([q[0], q[1]]);
  for (let n = Q.length; n > 1; n--) {
    for (let i = 0; i < n - 1; i++) {
      const a = at(Q, i);
      const b = at(Q, i + 1);
      Q[i] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return at(Q, 0);
}

export function curveD(P: readonly Point[]): string {
  if (P.length === 2) return `M${pt(at(P, 0))} L${pt(at(P, 1))}`;
  if (P.length === 3) return `M${pt(at(P, 0))} Q${pt(at(P, 1))} ${pt(at(P, 2))}`;
  if (P.length === 4) return `M${pt(at(P, 0))} C${pt(at(P, 1))} ${pt(at(P, 2))} ${pt(at(P, 3))}`;
  return smooth(P, false, 0.5);
}

export function ellD(cx: number, cy: number, rx: number, ry: number = rx): string {
  return `M${f3(cx - rx)},${f3(cy)} a${f3(rx)},${f3(ry)} 0 1,0 ${f3(2 * rx)},0 a${f3(rx)},${f3(ry)} 0 1,0 ${f3(-2 * rx)},0Z`;
}

export interface Frame {
  x: number;
  y: number;
  c: number;
  s: number;
}

export function frame(x: number, y: number, angle: number): Frame {
  return { x, y, c: Math.cos(rad(angle)), s: Math.sin(rad(angle)) };
}

export function fpt(f: Frame, a: number, b: number): Point {
  return [f.x + a * f.c - b * f.s, f.y + a * f.s + b * f.c];
}

export interface Affine {
  x0: number;
  y0: number;
  sx: number;
  sy: number;
  ax: number;
  ay: number;
}

export function aff(m: Affine, px: number, py: number): Point {
  return [m.x0 + m.sx * (px - m.ax), m.y0 + m.sy * (py - m.ay)];
}

export function mapD(d: string, m: Affine): string {
  let out = '';
  let last = 0;
  for (const mt of d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)) {
    const start = mt.index;
    const q = aff(m, +at(mt, 1), +at(mt, 2));
    out += d.slice(last, start) + pt(q);
    last = start + at(mt, 0).length;
  }
  return out + d.slice(last);
}

export function sideNormals(S: readonly Point[], i: number): Point {
  const a = at(S, Math.max(0, i - 1));
  const b = at(S, Math.min(S.length - 1, i + 1));
  const l = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
  return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
}

export interface CurveSample {
  x: number;
  y: number;
  tx: number;
  ty: number;
}
export interface Sampled {
  d: string;
  pts: CurveSample[];
  length: number;
}

export function sampleCurve(p: Parent, pts: readonly Point[] | string, step: number = 1, closed: boolean = false): Sampled {
  const d = typeof pts === 'string' ? pts : smooth(pts, closed, 0.5);
  const tmp = path(p, d, {});
  const L = tmp.getTotalLength();
  const n = Math.max(2, Math.ceil(L / step));
  const out: CurveSample[] = [];
  for (let i = 0; i <= n; i++) {
    const s = (L * i) / n;
    const a = tmp.getPointAtLength(Math.max(0, s - 0.3 * step));
    const b = tmp.getPointAtLength(Math.min(L, s + 0.3 * step));
    const q = tmp.getPointAtLength(s);
    const m = nz(Math.hypot(b.x - a.x, b.y - a.y));
    out.push({ x: q.x, y: q.y, tx: (b.x - a.x) / m, ty: (b.y - a.y) / m });
  }
  tmp.remove();
  return { d, pts: out, length: L };
}

export function centroid(pts: readonly Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const q of pts) {
    sx += q[0] / pts.length;
    sy += q[1] / pts.length;
  }
  return [sx, sy];
}

export type ShadowKind = boolean | 'drop' | 'ground' | 'offset';
export interface Ill {
  light: number | undefined;
  contrast: number | undefined;
  shadow: ShadowKind | undefined;
  wobble: number | undefined;
}
export type IllOpts = Loose<{ illustrate: IllustrateSetting }>;

function numField(v: object, key: string): number | undefined {
  const d = Object.getOwnPropertyDescriptor(v, key);
  return typeof d?.value === 'number' ? d.value : undefined;
}

function shadowField(v: object): ShadowKind | undefined {
  const d = Object.getOwnPropertyDescriptor(v, 'shadow');
  const s: unknown = d?.value;
  if (typeof s === 'boolean') return s;
  if (s === 'drop' || s === 'ground' || s === 'offset') return s;
  return undefined;
}

export function illOf(o: IllOpts): Ill | undefined {
  const v: unknown = illustrating(o);
  if (typeof v !== 'object' || v === null) return undefined;
  return { light: numField(v, 'light'), contrast: numField(v, 'contrast'), shadow: shadowField(v), wobble: numField(v, 'wobble') };
}

export function lightVec(il: Ill): Point {
  const a = rad(il.light ?? -135);
  return [Math.cos(a), Math.sin(a)];
}

export function sortByKey<T>(items: readonly T[], keys: readonly number[]): T[] {
  const idx: number[] = [];
  for (let i = 0; i < items.length; i++) idx.push(i);
  for (let i = 1; i < idx.length; i++) {
    const cur = at(idx, i);
    const kc = at(keys, cur);
    let j = i - 1;
    while (j >= 0 && at(keys, at(idx, j)) > kc) {
      idx[j + 1] = at(idx, j);
      j--;
    }
    idx[j + 1] = cur;
  }
  const out: T[] = [];
  for (const i of idx) out.push(at(items, i));
  return out;
}

export function sumPt(pts: readonly Point[]): Point {
  let sx = 0;
  let sy = 0;
  for (const q of pts) {
    sx += q[0];
    sy += q[1];
  }
  return [sx / pts.length, sy / pts.length];
}
