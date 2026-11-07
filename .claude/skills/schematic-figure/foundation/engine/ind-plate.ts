// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, GradientStop, Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { blur, ellipse, line, path, polygon } from './draw.ts';
import { at, f3 } from './util.ts';
import { reg, userGradient } from './ind-base.ts';
import type { Part } from './ind-base.ts';

export type Quad = readonly [Point, Point, Point, Point];

export type FlowFieldPlateOpts = Loose<{
  recess: Quad; inset: readonly [number, number]; channels: number; holes: 'top' | 'bottom' | 'both' | 'none'; r: number; color: string;
  rim: string; rimWidth: number; shadow: boolean; part: string; F: Figure; name: string;
}>;

export interface FlowFieldPlateResult extends Part {
  recess: Quad;
  front: Quad;
}

export function quadAt(Q: Quad, u: number, v: number): Point {
  const a: Point = [Q[0][0] + (Q[1][0] - Q[0][0]) * u, Q[0][1] + (Q[1][1] - Q[0][1]) * u];
  const b: Point = [Q[3][0] + (Q[2][0] - Q[3][0]) * u, Q[3][1] + (Q[2][1] - Q[3][1]) * u];
  return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v];
}

function roundD(pts: readonly Point[], r: number): string {
  const n = pts.length;
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = at(pts, (i - 1 + n) % n);
    const b = at(pts, i);
    const c = at(pts, (i + 1) % n);
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const rr = Math.min(r, la / 2, lc / 2);
    const p1: Point = [b[0] + ((a[0] - b[0]) / la) * rr, b[1] + ((a[1] - b[1]) / la) * rr];
    const p2: Point = [b[0] + ((c[0] - b[0]) / lc) * rr, b[1] + ((c[1] - b[1]) / lc) * rr];
    s += `${i !== 0 ? ' L' : 'M'}${f3(p1[0])},${f3(p1[1])} Q${f3(b[0])},${f3(b[1])} ${f3(p2[0])},${f3(p2[1])}`;
  }
  return s + 'Z';
}

function sortPoints(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) {
    let j = out.length;
    while (j > 0) {
      const prev = at(out, j - 1);
      const diff = prev[0] - q[0] || prev[1] - q[1];
      if (diff <= 0) break;
      j -= 1;
    }
    out.splice(j, 0, q);
  }
  return out;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function halfHull(pts: readonly Point[]): Point[] {
  const h: Point[] = [];
  for (const q of pts) {
    while (h.length >= 2 && cross(at(h, h.length - 2), at(h, h.length - 1), q) <= 0) h.pop();
    h.push(q);
  }
  return h;
}

function hullOf(front: Quad, back: readonly Point[]): Point[] {
  const all: Point[] = [];
  for (const q of [...front, ...back]) all.push([q[0], q[1]]);
  const hp = sortPoints(all);
  const lo = halfHull(hp);
  const up = halfHull(hp.toReversed());
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function backFace(front: Quad, side: readonly [Point, Point], sideLeft: boolean): Point[] {
  const f0 = front[0];
  const f1 = front[1];
  const f2 = front[2];
  const f3p = front[3];
  const s0 = side[0];
  const s1 = side[1];
  const vt: Point = sideLeft ? [s0[0] - f0[0], s0[1] - f0[1]] : [s0[0] - f1[0], s0[1] - f1[1]];
  const vb: Point = sideLeft ? [s1[0] - f3p[0], s1[1] - f3p[1]] : [s1[0] - f2[0], s1[1] - f2[1]];
  return [[f0[0] + vt[0], f0[1] + vt[1]], [f1[0] + vt[0], f1[1] + vt[1]], [f2[0] + vb[0], f2[1] + vb[1]], [f3p[0] + vb[0], f3p[1] + vb[1]]];
}

function drawShadow(g: Parent, front: Quad): void {
  const fb = front[3];
  const fbr = front[2];
  const wd = Math.abs(fbr[0] - fb[0]);
  ellipse(g, (fb[0] + fbr[0]) / 2, Math.max(fb[1], fbr[1]) + 0.04 * wd, wd * 0.8 + 0.2 * wd, 0.1 * wd, { fill: '#2f4640', opacity: 0.35, filter: blur(g, 0.07 * wd), part: 'plate-shadow' });
}

function drawHole(g: Parent, recess: Quad, u: number, v: number, dy: number, hw: number): void {
  const h = quadAt(recess, u, v);
  ellipse(g, h[0], h[1] + dy * 0.5 * hw, hw, 1.75 * hw, { fill: '#2a2d31', part: 'plate-hole' });
  ellipse(g, h[0] + 0.3 * hw * dy, h[1] + dy * hw, 0.5 * hw, 0.88 * hw, { fill: '#d4d8db', opacity: 0.9 });
}

function drawChannel(g: Parent, recess: Quad, i: number, n: number, base: string, hw: number, holes: string): void {
  const u0 = (i + 0.2) / n;
  const u1 = (i + 0.8) / n;
  const a = quadAt(recess, u0, 0.04);
  const b = quadAt(recess, u0, 0.96);
  const c = quadAt(recess, u1, 0.96);
  const e = quadAt(recess, u1, 0.04);
  polygon(g, [a, e, c, b], { fill: userGradient(g, a, e, [[0, shade(base, -0.45)], [0.5, shade(base, -0.13)], [1, shade(base, 0.25)]]), part: 'plate-channel' });
  line(g, e, c, { stroke: shade(base, 0.35), width: Math.max(0.3 * hw, STYLE.line.hair), opacity: 0.8, part: 'plate-rib-light' });
  if (holes === 'top' || holes === 'both') drawHole(g, recess, (i + 0.5) / n, 0.03, 1, hw);
  if (holes === 'bottom' || holes === 'both') drawHole(g, recess, (i + 0.5) / n, 0.97, -1, hw);
}

function drawBody(g: Parent, front: Quad, side: readonly [Point, Point], base: string, r: number): void {
  const sideLeft = (side[0][0] + side[1][0]) / 2 < (front[0][0] + front[1][0] + front[2][0] + front[3][0]) / 4;
  const sidePts = hullOf(front, backFace(front, side, sideLeft));
  const leftStops: readonly GradientStop[] = [[0, shade(base, -0.17)], [0.5, shade(base, 0.08)], [0.85, shade(base, 0.35)], [1, shade(base, 0.6)]];
  const rightStops: readonly GradientStop[] = [[0, shade(base, 0.58)], [0.25, shade(base, 0.25)], [0.7, shade(base, 0.03)], [1, shade(base, -0.12)]];
  path(g, roundD(sidePts, r * 0.64), { fill: userGradient(g, sideLeft ? side[0] : front[1], sideLeft ? front[0] : side[0], sideLeft ? leftStops : rightStops), part: 'plate-edge' });
}

export function flowFieldPlate(p: Parent, front: Quad, side: readonly [Point, Point], o: FlowFieldPlateOpts = {}): FlowFieldPlateResult {
  const g = el(p, 'g', { 'data-part': o.part ?? 'flow-plate' });
  const base = o.color ?? '#80858b';
  const r = o.r ?? 0.06 * Math.hypot(front[1][0] - front[0][0], front[1][1] - front[0][1]);
  const [iu, iv] = o.inset ?? [0.12, 0.1];
  const recess: Quad = o.recess ?? [quadAt(front, iu, iv), quadAt(front, 1 - iu, iv), quadAt(front, 1 - iu, 1 - iv), quadAt(front, iu, 1 - iv)];
  if (o.shadow === true) drawShadow(g, front);
  drawBody(g, front, side, base, r);
  path(g, roundD(front, r), { fill: userGradient(g, front[0], front[2], [[0, shade(base, 0.1)], [0.5, base], [1, shade(base, -0.13)]]), part: 'plate-face' });
  path(g, roundD(front, r), { fill: 'none', stroke: o.rim ?? shade(base, 0.45), width: o.rimWidth ?? Math.max(0.12 * r, STYLE.line.thin), opacity: 0.8, part: 'plate-bevel' });
  path(g, roundD(recess, r * 0.27), { fill: shade(base, -0.23), part: 'plate-recess' });
  path(g, roundD(recess, r * 0.27), { fill: 'none', stroke: shade(base, -0.42), width: Math.max(0.1 * r, STYLE.line.thin), part: 'plate-recess-edge' });
  const n = o.channels ?? 10;
  const hw = (0.25 * Math.hypot(recess[1][0] - recess[0][0], recess[1][1] - recess[0][1])) / n;
  for (let i = 0; i < n; i++) drawChannel(g, recess, i, n, base, hw, o.holes ?? 'top');
  const ports = reg(o.F, o.name, g, { center: quadAt(front, 0.5, 0.5), top: quadAt(front, 0.5, 0), bottom: quadAt(front, 0.5, 1), left: quadAt(front, 0, 0.5), right: quadAt(front, 1, 0.5) });
  return { node: g, ports, recess, front };
}
