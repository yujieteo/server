// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, line, path } from './draw.ts';
import { at, f3 } from './util.ts';
import type { Frame, Part, Reg } from './bio-util.ts';
import { floorOf, fpt, frame, fw, lineD, nz, pol, rad, reg, sortByKey } from './bio-util.ts';

const C = STYLE.color;

export type MicrotubuleOpts = Reg & Loose<{ d: number; monomer: number; rows: number; stagger: number; alpha: string; beta: string; stroke: string; width: number; angle: number }>;

interface MtRow {
  k: number;
  th: number;
  yc: number;
  ry: number;
}

function mtRows(n: number, R: number): MtRow[] {
  const rows: MtRow[] = [];
  for (let k = 0; k < n; k++) {
    const th = n === 1 ? 0 : -Math.PI / 2 + ((k + 0.5) * Math.PI) / n;
    rows.push({ k, th, yc: R * Math.sin(th), ry: n === 1 ? R : (((0.5 * R * Math.cos(th) * Math.PI) / n) * 1.08) });
  }
  return rows;
}

interface MtCtx {
  g: Handle;
  T: Frame;
  x0: number;
  y: number;
  sg: number;
  Lx: number;
  m: number;
  st: number;
  ca: string;
  cb: string;
  sw: number;
  stroke: string | undefined;
  n: number;
}

function mtRow(c: MtCtx, r: MtRow, sites: Point[]): void {
  const { g, T, x0, y, sg, Lx, m } = c;
  const shift = c.n === 1 ? 0 : r.k * c.st * m;
  const dark = 0.2 * Math.abs(Math.sin(r.th));
  for (let i = -2; i * m + shift <= Lx + m; i++) {
    const cc = i * m + shift + m / 2;
    if (cc < m / 2 - 1e-6 || cc > Lx - m / 2 + 1e-6) continue;
    const alpha = ((i % 2) + 2) % 2 === 0;
    ellipse(g, x0 + sg * cc, y + r.yc, (m / 2) * 0.97, r.ry, {
      fill: shade(alpha ? c.ca : c.cb, -dark), stroke: c.stroke ?? shade(c.cb, -0.35 - dark), width: c.sw, part: alpha ? 'alpha-tubulin' : 'beta-tubulin',
    });
    if (r.k === 0 && !alpha && cc - m >= m / 2 - 1e-6) sites.push(fpt(T, sg * (cc - m / 2), r.yc - r.ry));
  }
}

export function microtubule(p: Parent, x0: number, x1: number, y: number, o: MicrotubuleOpts = {}): Part & { sites: Point[] } {
  const K = floorOf(p);
  const ang = o.angle ?? 0;
  const T = frame(x0, y, ang);
  const len = x1 - x0;
  const sg = Math.sign(len) === 0 ? 1 : Math.sign(len);
  const Lx = Math.abs(len);
  const d = o.d ?? 14;
  const R = d / 2;
  const m = o.monomer ?? d / 3.2;
  const n = Math.max(1, Math.round(o.rows ?? 5));
  const st = o.stagger ?? 0.23;
  const ca = o.alpha ?? '#cfe0d2';
  const cb = o.beta ?? '#94bd9f';
  const sw = fw(K, o.width ?? Math.max(0.02 * d, STYLE.line.hair));
  const g = el(p, 'g', { 'data-part': o.part ?? 'microtubule', transform: ang !== 0 ? `rotate(${f3(ang)} ${f3(x0)} ${f3(y)})` : undefined });
  const rows = mtRows(n, R);
  const keys: number[] = [];
  for (const r of rows) keys.push(-Math.abs(r.th));
  const sites: Point[] = [];
  const mc: MtCtx = { g: { node: g }, T, x0, y, sg, Lx, m, st, ca, cb, sw, stroke: o.stroke, n };
  for (const r of sortByKey(rows, keys)) mtRow(mc, r, sites);
  const first = at(rows, 0);
  const yTop = first.yc - first.ry;
  const ports = reg(o, p, { minus: fpt(T, 0, 0), plus: fpt(T, len, 0), center: fpt(T, len / 2, 0), top: fpt(T, len / 2, yTop), bottom: fpt(T, len / 2, -yTop) });
  return { node: g, ports, sites };
}

export type ActinOpts = Reg & Loose<{ r: number; crossover: number; colors: readonly [string, string]; stroke: string; width: number; angle: number }>;

interface Bead {
  c: number;
  j: number;
  yy: number;
  z: number;
}

function actinBeads(r: number, s: number, P: number, A: number, Lx: number): Bead[] {
  const beads: Bead[] = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; r + i * s + (j * s) / 2 <= Lx - r + 1e-6; i++) {
      const c = r + i * s + (j * s) / 2;
      const ph = (2 * Math.PI * c) / P + j * Math.PI;
      beads.push({ c, j, yy: A * Math.cos(ph), z: Math.sin(ph) });
    }
  }
  return beads;
}

export function actin(p: Parent, x0: number, x1: number, y: number, o: ActinOpts = {}): Part & { beads: Point[] } {
  const K = floorOf(p);
  const ang = o.angle ?? 0;
  const T = frame(x0, y, ang);
  const len = x1 - x0;
  const sg = Math.sign(len) === 0 ? 1 : Math.sign(len);
  const Lx = Math.abs(len);
  const r = o.r ?? 2.2;
  const s = 1.9 * r;
  const P = 2 * (o.crossover ?? 6.5) * s;
  const A = r;
  const [c1, c2] = o.colors ?? ['#eab3a9', '#bb6c62'];
  const g = el(p, 'g', { 'data-part': o.part ?? 'actin', transform: ang !== 0 ? `rotate(${f3(ang)} ${f3(x0)} ${f3(y)})` : undefined });
  const beads = actinBeads(r, s, P, A, Lx);
  const keys: number[] = [];
  for (const b of beads) keys.push(b.z);
  const sorted = sortByKey(beads, keys);
  const pts: Point[] = [];
  for (const b of sorted) {
    const k = 0.5 * (1 - b.z);
    const base = b.j !== 0 ? c2 : c1;
    circle(g, x0 + sg * b.c, y + b.yy, r * (0.98 - 0.12 * k), {
      fill: shade(base, 0.42 * k), stroke: o.stroke ?? shade(base, -0.35), width: fw(K, o.width ?? Math.max(0.08 * r, STYLE.line.hair)), part: 'actin-subunit',
    });
    pts.push(fpt(T, sg * b.c, b.yy));
  }
  const ports = reg(o, p, { minus: fpt(T, 0, 0), plus: fpt(T, len, 0), center: fpt(T, len / 2, 0), top: fpt(T, len / 2, -A - r), bottom: fpt(T, len / 2, A + r) });
  return { node: g, ports, beads: pts };
}

export type CoilOpts = Loose<{ turns: number; amp: number; colors: readonly [string, string]; width: number; back: number; part: string }>;

interface Piece {
  j: number;
  t0: number;
  t1: number;
  front: boolean;
}

function coilPieces(turns: number): Piece[] {
  const pieces: Piece[] = [];
  for (let j = 0; j < 2; j++) {
    const cuts: number[] = [0];
    let k = 0;
    let t = ((k + 0.5) * Math.PI - j * Math.PI) / (2 * Math.PI * turns);
    while (t < 1) {
      if (t > 0) cuts.push(t);
      k++;
      t = ((k + 0.5) * Math.PI - j * Math.PI) / (2 * Math.PI * turns);
    }
    cuts.push(1);
    for (let i = 0; i < cuts.length - 1; i++) {
      const t0 = at(cuts, i);
      const t1 = at(cuts, i + 1);
      const tm = (t0 + t1) / 2;
      pieces.push({ j, t0, t1, front: Math.cos(2 * Math.PI * turns * tm + j * Math.PI) >= 0 });
    }
  }
  return pieces;
}

export function coiledCoil(p: Parent, a: Point, b: Point, o: CoilOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'coiled-coil' });
  const len = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const nv: Point = [-u[1], u[0]];
  const lw = fw(K, o.width ?? STYLE.line.normal);
  const amp = o.amp ?? 2.2 * lw;
  const turns = o.turns ?? Math.max(1, len / (12 * amp));
  const [c1, c2] = o.colors ?? [C.ink, '#6d6d6d'];
  const bk = o.back ?? 0.45;
  const pieces = coilPieces(turns);
  for (const front of [false, true]) {
    for (const q of pieces) {
      if (q.front !== front) continue;
      const pts: Point[] = [];
      for (let i = 0; i < 13; i++) {
        const t = q.t0 + ((q.t1 - q.t0) * i) / 12;
        const ph = 2 * Math.PI * turns * t + q.j * Math.PI;
        const w = amp * Math.sin(ph);
        pts.push([a[0] + u[0] * len * t + nv[0] * w, a[1] + u[1] * len * t + nv[1] * w]);
      }
      const col = q.j !== 0 ? c2 : c1;
      path(g, lineD(pts), { stroke: front ? col : shade(col, bk), width: lw, part: 'helix' });
    }
  }
  return { node: g };
}

export type MotorKind = 'kinesin' | 'myosin' | 'dynein';
export type MotorOpts = Reg &
  Loose<{
    kind: MotorKind;
    r: number;
    bound: readonly boolean[];
    fill: string | readonly string[];
    boundFill: string;
    stroke: string;
    width: number;
    linker: number;
    stalkWidth: number;
    stalkAngle: number;
    labels: readonly (string | number | null | undefined)[];
    size: number;
    turns: number;
    colors: readonly [string, string];
  }>;

interface MotorCtx {
  g: Handle;
  K: number;
  r: number;
  st: string;
  sw: number;
  lk: number;
  J: Point;
}

function headFill(o: MotorOpts, i: number): string {
  if (o.bound?.[i] === true) return o.boundFill ?? '#6f7a88';
  const f = o.fill ?? '#f3d59a';
  return typeof f === 'string' ? f : at(f, i);
}

function myosinHead(c: MotorCtx, h: Point, u: Point, hf: string): Point {
  const { g, K, r, st, sw, J } = c;
  const [hx, hy] = h;
  const a = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  const e: Point = [hx + u[0] * r * 1.2, hy + u[1] * r * 1.2];
  line(g, e, J, { stroke: shade(st, 0.25), width: fw(K, 0.42 * r), cap: 'round', part: 'lever' });
  el(g, 'ellipse', { cx: f3(hx), cy: f3(hy), rx: f3(r * 1.6), ry: f3(r * 0.82), transform: `rotate(${f3(a)} ${f3(hx)} ${f3(hy)})`, fill: hf, stroke: st, 'stroke-width': sw, 'data-part': 'motor-head' });
  return [hx - u[0] * r * 1.6, hy - u[1] * r * 1.6];
}

function dyneinHead(c: MotorCtx, h: Point, u: Point, hf: string, stalkAngle: number): Point {
  const { g, K, r, st, sw, lk, J } = c;
  const [hx, hy] = h;
  const sa = rad(stalkAngle);
  const sd: Point = [Math.cos(sa), Math.sin(sa)];
  const tip: Point = [hx + sd[0] * r * 2.4, hy + sd[1] * r * 2.4];
  line(g, [hx + sd[0] * r * 0.9, hy + sd[1] * r * 0.9], tip, { stroke: st, width: fw(K, 0.12 * r), part: 'stalk' });
  circle(g, tip[0], tip[1], 0.3 * r, { fill: hf, stroke: st, width: sw, part: 'mtbd' });
  path(g, `M${f3(hx)},${f3(hy)} Q${f3(hx + (J[0] - hx) * 0.2 + u[1] * r)},${f3(hy + (J[1] - hy) * 0.6)} ${f3(J[0])},${f3(J[1])}`, { stroke: st, width: lk, part: 'linker' });
  for (let k = 0; k < 6; k++) {
    const [cx, cy] = pol(hx, hy, 0.6 * r, k * 60 + 30);
    circle(g, cx, cy, 0.42 * r, { fill: hf, stroke: st, width: sw, part: 'aaa' });
  }
  circle(g, hx, hy, 0.24 * r, { fill: '#fff', stroke: st, width: sw });
  return tip;
}

function kinesinHead(c: MotorCtx, h: Point, u: Point, hf: string): Point {
  const { g, r, st, sw, lk, J } = c;
  const [hx, hy] = h;
  const top: Point = [hx + u[0] * r * 0.55, hy - r * 0.62];
  path(g, `M${f3(top[0])},${f3(top[1])} Q${f3(hx + (J[0] - hx) * 0.1)},${f3(J[1] + (hy - J[1]) * 0.35)} ${f3(J[0])},${f3(J[1])}`, { stroke: st, width: lk, part: 'neck-linker' });
  ellipse(g, hx, hy, r * 1.35, r, { fill: hf, stroke: st, width: sw, part: 'motor-head' });
  return [hx, hy + r];
}

export function motor(p: Parent, heads: readonly Point[], junction: Point, tail: Point, o: MotorOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'motor' });
  const kind = o.kind ?? 'kinesin';
  const r = o.r ?? 6;
  const c: MotorCtx = { g: { node: g }, K, r, st: o.stroke ?? C.ink, sw: fw(K, o.width ?? STYLE.line.normal), lk: fw(K, o.linker ?? 0.8), J: junction };
  const feet: Point[] = [];
  coiledCoil(g, junction, tail, { width: fw(K, o.stalkWidth ?? 0.6), turns: o.turns, colors: o.colors });
  for (let i = 0; i < heads.length; i++) {
    const h = at(heads, i);
    const dj = nz(Math.hypot(junction[0] - h[0], junction[1] - h[1]));
    const u: Point = [(junction[0] - h[0]) / dj, (junction[1] - h[1]) / dj];
    const hf = headFill(o, i);
    if (kind === 'myosin') feet.push(myosinHead(c, h, u, hf));
    else if (kind === 'dynein') feet.push(dyneinHead(c, h, u, hf, o.stalkAngle ?? 90));
    else feet.push(kinesinHead(c, h, u, hf));
    const lab = o.labels?.[i];
    if (lab !== undefined && lab !== null) {
      text(g, h[0], h[1], String(lab), { anchor: 'middle', valign: 'middle', size: o.size ?? Math.max(STYLE.text.min, 0.9 * r), weight: 'bold', color: o.bound?.[i] === true ? '#fff' : C.text });
    }
  }
  const ports = reg(o, p, { head0: at(heads, 0), head1: at(heads, 1), foot0: at(feet, 0), foot1: at(feet, 1), junction, tail });
  return { node: g, ports };
}
