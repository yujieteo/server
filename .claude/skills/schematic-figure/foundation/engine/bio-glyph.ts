// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Paint, Parent, Point } from './types.ts';
import { el, group, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, linearGradient, path, polygon, rect, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import type { Part, Rand, Reg } from './bio-util.ts';
import { floorOf, frame, fpt, fw, nz, pol, rad, reg, rnd, rng, sortByKey } from './bio-util.ts';

export type ChannelOpts = Reg &
  Loose<{ n: number; center: boolean; r: number; R: number; ry: number; capRy: number; phase: number; view: 'below' | 'above'; fill: string; stroke: string; width: number }>;

interface Cyl {
  r: number;
  nx: number;
  ny: number;
  ax: number;
  ay: number;
  an: number;
  st: string;
  sw: number;
  fill: string;
  cr: number;
}

function cylinder(g: Handle, grad: string, c: Cyl, b: Point): void {
  const [bx, by] = b;
  const tx = bx + c.ax;
  const ty = by + c.ay;
  const { r, nx, ny, an } = c;
  const d =
    `M${f3(bx + nx * r)},${f3(by + ny * r)} L${f3(tx + nx * r)},${f3(ty + ny * r)} A${f3(r)},${f3(r * c.cr)} ${f3(an)} 0,0 ${f3(tx - nx * r)},${f3(ty - ny * r)} ` +
    `L${f3(bx - nx * r)},${f3(by - ny * r)} Z`;
  path(g, d, { fill: grad, stroke: c.st, width: c.sw });
  el(g, 'ellipse', {
    cx: f3(bx), cy: f3(by), rx: f3(r), ry: f3(r * c.cr), transform: `rotate(${f3(an)} ${f3(bx)} ${f3(by)})`, fill: shade(c.fill, 0.15), stroke: c.st, 'stroke-width': c.sw,
  });
}

function ringPts(n: number, phase: number, b: Point, nn: Point, u: Point, R: number, ry: number): Point[] {
  const cyl: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = rad((i * 360) / n + phase);
    cyl.push([b[0] + nn[0] * R * Math.cos(a) + u[0] * R * ry * Math.sin(a), b[1] + nn[1] * R * Math.cos(a) + u[1] * R * ry * Math.sin(a)]);
  }
  return cyl;
}

export function channel(p: Parent, cx: number, cy: number, axis: Point, o: ChannelOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'channel' });
  let ax = axis[0];
  let ay = axis[1];
  const La = nz(Math.hypot(ax, ay));
  const r = o.r ?? 0.15 * La;
  const R = o.R ?? 2.16 * r;
  const ry = o.ry ?? 0.55;
  const fill = o.fill ?? '#f7ee9a';
  const n = o.n ?? 6;
  let bx0 = cx;
  let by0 = cy;
  if (o.view === 'above') {
    bx0 = cx + ax;
    by0 = cy + ay;
    ax = -ax;
    ay = -ay;
  }
  const ux = ax / La;
  const uy = ay / La;
  const nx = -uy;
  const ny = ux;
  const an = (Math.atan2(ny, nx) * 180) / Math.PI;
  const cyl = ringPts(n, o.phase ?? 30, [bx0, by0], [nx, ny], [ux, uy], R, ry);
  if (o.center !== false) cyl.push([bx0, by0]);
  const keys: number[] = [];
  for (const q of cyl) keys.push((q[0] - bx0) * ux + (q[1] - by0) * uy);
  const grad = linearGradient(g, [[0, shade(fill, -0.08)], [0.35, shade(fill, 0.4)], [0.7, fill], [1, shade(fill, -0.15)]], an);
  const c: Cyl = { r, nx, ny, ax, ay, an, st: o.stroke ?? shade(fill, -0.58), sw: fw(K, o.width ?? Math.max(0.09 * r, STYLE.line.thin)), fill, cr: o.capRy ?? 0.42 };
  for (const b of sortByKey(cyl, keys)) cylinder({ node: g }, grad, c, b);
  const ports = reg(o, p, { base: [cx, cy], top: [cx + axis[0], cy + axis[1]], center: [cx + axis[0] / 2, cy + axis[1] / 2] });
  return { node: g, ports };
}

export type ProteinShape = 'ellipse' | 'blob' | 'octagon' | 'hexagon' | 'capsule' | 'star' | 'lumpy';
export type ProteinOpts = Reg &
  Loose<{ shape: ProteinShape; fill: string; stroke: string; width: number; rot: number; label: string; size: number; color: string; seed: number; points: number; r: number }>;

function octagonPts(R: Rand, w: number, h: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 8; i++) {
    const a = rad(i * 45 + 22.5 + (rnd(R) - 0.5) * 10);
    const q = 0.94 + rnd(R) * 0.08;
    out.push([((Math.cos(a) * w) / 2) * q, ((Math.sin(a) * h) / 2) * q]);
  }
  return out;
}

function starPts(R: Rand, w: number, h: number, m: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 2 * m; i++) {
    const q = i % 2 !== 0 ? 0.45 : 1;
    const a = rad(-90 + (i * 180) / m + (rnd(R) - 0.5) * 8);
    out.push([((Math.cos(a) * w) / 2) * q, ((Math.sin(a) * h) / 2) * q]);
  }
  return out;
}

function lumpyD(R: Rand, w: number, h: number, m: number): string {
  const pts: Point[] = [];
  for (let i = 0; i < m; i++) {
    const a = ((i / m) * 2) * Math.PI;
    const q = 0.82 + 0.3 * rnd(R);
    pts.push([((Math.cos(a) * w) / 2) * q, ((Math.sin(a) * h) / 2) * q]);
  }
  return smooth(pts, true, 0.5);
}

function proteinShape(g: Handle, shape: ProteinShape, w: number, h: number, sty: Paint, o: ProteinOpts): void {
  const R = rng(o.seed ?? 1);
  if (shape === 'ellipse') ellipse(g, 0, 0, w / 2, h / 2, sty);
  else if (shape === 'blob') rect(g, -w / 2, -h / 2, w, h, { r: o.r ?? Math.min(w, h) * 0.38, ...sty });
  else if (shape === 'capsule') rect(g, -w / 2, -h / 2, w, h, { r: Math.min(w, h) / 2, ...sty });
  else if (shape === 'octagon') polygon(g, octagonPts(R, w, h), sty);
  else if (shape === 'hexagon') {
    const pts: Point[] = [];
    for (let i = 0; i < 6; i++) pts.push([(Math.cos(rad(30 + i * 60)) * w) / 2, (Math.sin(rad(30 + i * 60)) * h) / 2]);
    polygon(g, pts, sty);
  } else if (shape === 'star') polygon(g, starPts(R, w, h, o.points ?? 8), { ...sty, join: 'miter' });
  else path(g, lumpyD(R, w, h, o.points ?? 9), sty);
}

export function protein(p: Parent, cx: number, cy: number, w: number, h: number, o: ProteinOpts = {}): Part {
  const K = floorOf(p);
  const g = group(p, { x: cx, y: cy, rotate: o.rot, part: o.part ?? 'molecule' });
  const sty: Paint = { fill: o.fill ?? '#7fd3cf', stroke: o.stroke ?? '#111', width: fw(K, o.width ?? Math.max(0.03 * Math.min(w, h), STYLE.line.thin)), join: 'round' };
  proteinShape(g, o.shape ?? 'ellipse', w, h, sty, o);
  if (o.label !== undefined && o.label !== '') text(g, 0, 0, o.label, { anchor: 'middle', valign: 'middle', size: o.size, color: o.color });
  const T = frame(cx, cy, o.rot ?? 0);
  const ports = reg(o, p, { center: [cx, cy], left: fpt(T, -w / 2, 0), right: fpt(T, w / 2, 0), top: fpt(T, 0, -h / 2), bottom: fpt(T, 0, h / 2) });
  return { node: g.node, ports };
}

export type LipidOpts = Loose<{ head: boolean; r: number; halfWidth: number; fill: string; stroke: string; headFill: string; width: number; part: string }>;

function lipP(a: Point, u: Point, n: Point, s0: number, len: number, t: number, q: number): Point {
  return [a[0] + u[0] * (s0 + t * (len - s0)) + n[0] * q, a[1] + u[1] * (s0 + t * (len - s0)) + n[1] * q];
}

export function lipidAnchor(p: Parent, a: Point, b: Point, o: LipidOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'lipid' });
  const len = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const u: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const n: Point = [-u[1], u[0]];
  const hasHead = o.head === true;
  const r = o.r ?? 0.3 * len;
  const s0 = hasHead ? r * 0.9 : 0;
  const hw = o.halfWidth ?? 0.12 * len;
  const fill = o.fill ?? '#e7a3ca';
  const sw = fw(K, o.width ?? Math.max(0.05 * len, STYLE.line.hair));
  for (const [t0, t1] of [[0, 0.5], [0.5, 1]] as const) {
    const tm = (t0 + t1) / 2;
    polygon(g, [lipP(a, u, n, s0, len, t0, 0), lipP(a, u, n, s0, len, tm, hw), lipP(a, u, n, s0, len, t1, 0), lipP(a, u, n, s0, len, tm, -hw)], {
      fill, stroke: o.stroke ?? shade(fill, -0.4), width: sw,
    });
  }
  if (hasHead) {
    const hex: Point[] = [];
    for (let i = 0; i < 6; i++) hex.push(pol(a[0], a[1], r, 30 + i * 60));
    polygon(g, hex, { fill: o.headFill ?? '#b24f6b', stroke: '#111', width: fw(K, 0.12 * r), join: 'round' });
  }
  return { node: g };
}

export type AggregateOpts = Loose<{ color: string; seed: number; width: number; part: string }>;

interface Comp {
  a: number;
  w: number;
  ph: number;
}

function aggComps(R: Rand): Comp[] {
  const out: Comp[] = [];
  const amps = [0.4, 0.33, 0.27];
  for (let k = 0; k < 3; k++) {
    const r1 = rnd(R);
    const r2 = rnd(R);
    const ws = [1.3, 2.7 + r1 * 1.5, 5.3 + r2 * 3];
    out.push({ a: at(amps, k), w: at(ws, k) * (k === 1 ? -1 : 1), ph: rnd(R) * 6.28 });
  }
  return out;
}

export function aggregate(p: Parent, cx: number, cy: number, w: number, h: number, o: AggregateOpts = {}): { node: SVGPathElement } {
  const K = floorOf(p);
  const comps = aggComps(rng(o.seed ?? 3));
  const raw: Point[] = [];
  let mx = 0;
  let my = 0;
  for (let i = 0; i <= 260; i++) {
    const t = (i / 260) * 6.28 * 3.3;
    let x = 0.12 * Math.sin(0.37 * t);
    let y = 0;
    for (const c of comps) {
      x += c.a * Math.cos(c.w * t + c.ph);
      y += c.a * Math.sin(c.w * t + c.ph * 1.3);
    }
    raw.push([x, y]);
    mx = Math.max(mx, Math.abs(x));
    my = Math.max(my, Math.abs(y));
  }
  const pts: Point[] = [];
  for (const [x, y] of raw) pts.push([cx + ((x / mx) * w) / 2, cy + ((y / my) * h) / 2]);
  const width = fw(K, o.width ?? Math.max(0.03 * Math.min(w, h), STYLE.line.hair));
  return { node: path(p, smooth(pts, false, 0.5), { stroke: o.color ?? '#f0302f', width, part: o.part ?? 'aggregate' }) };
}

export type VatpaseOpts = Loose<{ rod: string; knob: string; stroke: string; part: string }>;

export function vatpase(p: Parent, x: number, y: number, angle: number, len: number, o: VatpaseOpts = {}): { node: Element; tip: Point } {
  const K = floorOf(p);
  const g = group(p, { x, y, rotate: angle, part: o.part ?? 'vatpase' });
  const kr = len * 0.2;
  const cw = len * 0.2;
  const seg = (len - kr * 0.6) / 2;
  const st = o.stroke ?? '#111';
  const sw = fw(K, 0.025 * len);
  for (let i = 0; i < 2; i++) rect(g, kr * 0.6 + i * seg, -cw / 2, seg, cw, { r: cw / 2, fill: o.rod ?? '#6c6b69', stroke: st, width: sw });
  const lobes: Point[] = [[-kr * 0.2, -kr * 0.62], [-kr * 0.2, kr * 0.62], [kr * 0.45, 0]];
  for (const [dx, dy] of lobes) circle(g, dx, dy, kr * 0.62, { fill: o.knob ?? '#9ed091', stroke: st, width: sw * 2 });
  for (const [dx, dy] of lobes) circle(g, dx, dy, kr * 0.62, { fill: o.knob ?? '#9ed091' });
  return { node: g.node, tip: pol(x, y, len, angle) };
}
