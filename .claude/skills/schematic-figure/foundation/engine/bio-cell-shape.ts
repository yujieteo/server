// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { IllustrateSetting, Loose, Parent, Point } from './types.ts';
import { circle } from './draw.ts';
import type { LineageName, Lineage, Part, Rand, Reg } from './bio-util.ts';
import { pol, rad, rnd } from './bio-util.ts';
import { receptor } from './bio-receptor.ts';
import type { ReceptorKind } from './bio-receptor.ts';

export type NucleusOpts = Loose<{ r: number; dx: number; dy: number; color: string; stroke: string }>;
export type ReceptorSpec = Loose<{
  angles: readonly number[];
  n: number;
  kind: ReceptorKind;
  size: number;
  color: string;
  opacity: number;
  style: 'flat';
  stalk: number;
}>;
export type CellOpts = Reg &
  Loose<{
    fill: string;
    stroke: string;
    width: number;
    palette: LineageName | Lineage;
    flat: boolean;
    nucleus: false | NucleusOpts;
    highlight: false | number;
    rim: false | number;
    lobes: number;
    jitter: number;
    ruffle: number;
    bumps: number;
    seed: number;
    vesicles: boolean | number;
    receptors: ReceptorSpec;
    illustrate: IllustrateSetting;
    wobble: number;
    vary: boolean;
    contrast: number;
    shadow: boolean | 'drop' | 'ground' | 'offset';
    mottle: number;
  }>;

export interface Harm {
  k: number;
  a: number;
  ph: number;
}
export interface CellShape {
  cx: number;
  cy: number;
  r: number;
  lobes: number;
  ruf: number;
  bumps: number;
  wob: number;
  harm: Harm[];
  bph: number[];
  wh: Harm[];
  wn: number;
  aspect: number;
  cr: number;
  sr: number;
  ill: boolean;
}
export interface CellResult extends Part {
  shape: CellShape;
}

export function cellR(s: CellShape, a: number): number {
  if (!s.ill && s.lobes === 0 && s.ruf === 0) return s.r;
  let k = 1;
  const t = rad(a);
  if (s.lobes !== 0) for (const h of s.harm) k += h.a * Math.cos(h.k * t + h.ph);
  if (s.ruf !== 0) {
    const u = ((((a % 360) + 360) % 360) / 360) * s.bumps;
    const i = Math.floor(u);
    const f = u - i;
    k += s.ruf * (s.bph[i % s.bumps] ?? Number.NaN) * Math.sin(Math.PI * f) ** 2;
  }
  if (s.wob !== 0) {
    let q = 0;
    for (const h of s.wh) q += h.a * Math.cos(h.k * t + h.ph);
    k += (s.wob * q) / s.wn;
  }
  return s.r * k;
}

export function cellPt(s: CellShape, a: number, dr: number = 0): Point {
  if (!s.ill) return pol(s.cx, s.cy, cellR(s, a) + dr, a);
  const t = rad(a);
  const rr = cellR(s, a) + dr;
  const x = rr * Math.cos(t) * Math.sqrt(s.aspect);
  const y = (rr * Math.sin(t)) / Math.sqrt(s.aspect);
  return [s.cx + x * s.cr - y * s.sr, s.cy + x * s.sr + y * s.cr];
}

export function cellAt(c: CellResult, angle: number, dr: number = 0): Point {
  return cellPt(c.shape, angle, dr);
}

export function cellHarm(o: CellOpts, R: Rand): { lobes: number; ruf: number; bumps: number; harm: Harm[]; bph: number[] } {
  const lobes = o.lobes ?? 0;
  const jit = o.jitter ?? (lobes !== 0 ? 0.08 : 0);
  const bumps = o.bumps ?? 24;
  const harm: Harm[] = [];
  for (let i = 0; i < 3; i++) {
    const a = jit * (i > 0 ? 0.35 * rnd(R) : 1) * (0.6 + 0.4 * rnd(R));
    harm.push({ k: lobes + i, a, ph: rnd(R) * 6.283 });
  }
  const bph: number[] = [];
  for (let i = 0; i < bumps; i++) bph.push(0.5 + rnd(R));
  return { lobes, ruf: o.ruffle ?? 0, bumps, harm, bph };
}

export function portsOf(s: CellShape): Record<string, Point> {
  return { center: [s.cx, s.cy], left: cellPt(s, 180), right: cellPt(s, 0), top: cellPt(s, -90), bottom: cellPt(s, 90) };
}

export function placeReceptors(g: Parent, s: CellShape, rc: ReceptorSpec): void {
  const n = rc.n ?? 6;
  const angles: number[] = [];
  if (rc.angles !== undefined) angles.push(...rc.angles);
  else for (let i = 0; i < n; i++) angles.push(-90 + (i * 360) / n);
  for (const a of angles) {
    const [x, y] = cellPt(s, a, -0.04 * s.r);
    const am = ((a % 360) + 360) % 360;
    receptor(g, x, y, a, rc.size ?? 0.7 * s.r, { kind: rc.kind, color: rc.color, opacity: rc.opacity, style: rc.style, stalk: rc.stalk, flip: am > 90 && am < 270 });
  }
}

export function vesicleDots(g: Parent, cx: number, cy: number, r: number, n: boolean | number, col: string, R: Rand): void {
  const count = n === true ? 16 : n === false ? 0 : n;
  for (let i = 0; i < count; i++) {
    const [x, y] = pol(cx, cy, r * (0.45 + 0.4 * rnd(R)), rnd(R) * 360);
    circle(g, x, y, r * (0.03 + 0.03 * rnd(R)), { fill: col, opacity: 0.9, part: 'vesicle' });
  }
}
