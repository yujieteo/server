// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/optics.js
import type { Loose, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { path, polygon } from './draw.ts';
import { at, unit } from './util.ts';
import { finish } from './optics-a.ts';
import type { OpticOpts, OpticResult } from './optics-a.ts';

const C = STYLE.color;

export type BeamPathOpts = Loose<{
  width: number; color: string; opacity: number; hollow: boolean; inner: number; from: number; bends: readonly number[];
  edge: boolean; edgeColor: string; edgeWidth: number; core: boolean; coreColor: string; coreWidth: number;
  arrows: boolean | readonly number[]; arrowSize: number; arrowColor: string; part: string;
}> & OpticOpts;

export interface BeamMirror {
  i: number;
  at: Point;
  normal: number;
  surface: number;
  rot: number;
}

export interface BeamPathResult extends OpticResult {
  mirrors: BeamMirror[];
  edges: [Point[], Point[]];
  centre: Point[];
  cum: number[];
}

interface Geom {
  pts: readonly Point[];
  n: number;
  D: Point[];
  cut: Point[];
  rays: Map<string, Point[]>;
}

function x3(v: number): string {
  return v.toFixed(3);
}

function nrm(d: Point): Point {
  return [-d[1], d[0]];
}

function directions(pts: readonly Point[]): Point[] {
  const D: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = at(pts, i);
    const b = at(pts, i + 1);
    D.push(unit(b[0] - a[0], b[1] - a[1]));
  }
  return D;
}

function cutNormals(n: number, D: readonly Point[], bends: ReadonlySet<number>): Point[] {
  const cut: Point[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      cut.push(at(D, 0));
    } else if (i === n - 1) {
      cut.push(at(D, n - 2));
    } else {
      const a = at(D, i - 1);
      const b = at(D, i);
      const c: Point = bends.has(i) ? [a[0] + b[0], a[1] + b[1]] : [b[0] - a[0], b[1] - a[1]];
      cut.push(Math.hypot(c[0], c[1]) < 1e-6 ? a : unit(c[0], c[1]));
    }
  }
  return cut;
}

function trace(G: Geom, s: number): Point[] {
  const p0 = at(G.pts, 0);
  const n0 = nrm(at(G.D, 0));
  let q: Point = [p0[0] + n0[0] * s, p0[1] + n0[1] * s];
  const out: Point[] = [q];
  for (let i = 1; i < G.n; i++) {
    const d = at(G.D, i - 1);
    const c = at(G.cut, i);
    const pi = at(G.pts, i);
    const den = d[0] * c[0] + d[1] * c[1];
    const t = Math.abs(den) < 1e-9 ? Math.hypot(pi[0] - q[0], pi[1] - q[1]) : ((pi[0] - q[0]) * c[0] + (pi[1] - q[1]) * c[1]) / den;
    q = [q[0] + d[0] * t, q[1] + d[1] * t];
    out.push(q);
  }
  return out;
}

function ray(G: Geom, s: number): Point[] {
  const k = s.toFixed(4);
  const hit = G.rays.get(k);
  if (hit !== undefined) return hit;
  const r = trace(G, s);
  G.rays.set(k, r);
  return r;
}

function area(Q: readonly Point[]): number {
  let s = 0;
  for (let k = 0; k < Q.length; k++) {
    const q = at(Q, k);
    const r = at(Q, (k + 1) % Q.length);
    s = s + q[0] * r[1] - r[0] * q[1];
  }
  return s;
}

function xy3(q: Point): string {
  return `${x3(q[0])},${x3(q[1])}`;
}

function segPath(R: readonly Point[], i0: number, i1: number): string {
  let d = 'M';
  for (let k = i0; k <= i1 && k < R.length; k++) d += `${k > i0 ? ' L' : ''}${xy3(at(R, k))}`;
  return d;
}

function bandPath(G: Geom, hw: number, ri: number, from: number): string {
  let d = '';
  for (let i = 0; i < G.n - 1; i++) {
    const strips: [number, number][] = i < from ? [[-hw, hw]] : [[-hw, -ri], [ri, hw]];
    for (const [sa, sb] of strips) {
      const A = ray(G, sa);
      const B = ray(G, sb);
      let Q: Point[] = [at(A, i), at(A, i + 1), at(B, i + 1), at(B, i)];
      if (area(Q) < 0) Q = Q.toReversed();
      d += `${segPath(Q, 0, Q.length - 1)}Z`;
    }
  }
  return d;
}

function lerpAt(R: readonly Point[], i: number, u: number): Point {
  const a = at(R, i);
  const b = at(R, i + 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
}

function locate(cum: readonly number[], n: number, f: number): [number, number] {
  const s = Math.max(0, Math.min(1, f)) * at(cum, n - 1);
  let i = 0;
  while (i < n - 2 && at(cum, i + 1) < s) i++;
  return [i, (s - at(cum, i)) / (at(cum, i + 1) - at(cum, i) || 1)];
}

export function beamPathAt(bp: BeamPathResult, f: number): Point {
  const [i, u] = locate(bp.cum, bp.centre.length, f);
  return lerpAt(bp.centre, i, u);
}

function arcLengths(C0: readonly Point[]): number[] {
  const cum = [0];
  for (let i = 1; i < C0.length; i++) {
    const a = at(C0, i);
    const b = at(C0, i - 1);
    cum.push(at(cum, i - 1) + Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  return cum;
}

function drawEdges(g: SVGGElement, G: Geom, o: BeamPathOpts, hw: number, ri: number, from: number, color: string): void {
  const ec = o.edgeColor ?? shade(color, -0.25);
  const ew = o.edgeWidth ?? STYLE.line.hair * 1.2;
  const style = { stroke: ec, width: ew, cap: 'butt', join: 'miter', part: 'beam-edge' };
  for (const s of [-hw, hw]) path(g, segPath(ray(G, s), 0, G.n - 1), style);
  if ((o.hollow ?? false) && from < G.n - 1) for (const s of [-ri, ri]) path(g, segPath(ray(G, s), from, G.n - 1), style);
}

function arrowHead(g: SVGGElement, x: number, y: number, dd: Point, nn: Point, sz: number, ac: string): void {
  polygon(g, [
    [x + dd[0] * sz, y + dd[1] * sz],
    [x - dd[0] * sz * 0.6 + nn[0] * sz * 0.8, y - dd[1] * sz * 0.6 + nn[1] * sz * 0.8],
    [x - dd[0] * sz * 0.2, y - dd[1] * sz * 0.2],
    [x - dd[0] * sz * 0.6 - nn[0] * sz * 0.8, y - dd[1] * sz * 0.6 - nn[1] * sz * 0.8],
  ], { fill: ac, part: 'beam-arrow' });
}

function drawArrows(g: SVGGElement, G: Geom, o: BeamPathOpts, cum: readonly number[], hw: number, ri: number, from: number, color: string): void {
  const arrows = o.arrows;
  if (arrows === undefined || arrows === false) return;
  const total = at(cum, G.n - 1);
  let fs: readonly number[] = [];
  if (arrows === true) {
    const mids: number[] = [];
    for (let i = 0; i < G.D.length; i++) mids.push((at(cum, i) + at(cum, i + 1)) / 2 / total);
    fs = mids;
  } else fs = arrows;
  const sz = o.arrowSize ?? Math.max(1.4, Math.min(2.6, hw));
  const ac = o.arrowColor ?? shade(color, -0.3);
  for (const f of fs) {
    const [i, u] = locate(cum, G.n, f);
    const dd = at(G.D, i);
    const nn = nrm(dd);
    const offs = i < from ? [0] : [-(ri + hw) / 2, (ri + hw) / 2];
    for (const s of offs) {
      const [x, y] = lerpAt(ray(G, s), i, u);
      arrowHead(g, x, y, dd, nn, sz, ac);
    }
  }
}

function foldMirrors(G: Geom, bends: ReadonlySet<number>): BeamMirror[] {
  const mirrors: BeamMirror[] = [];
  for (let i = 1; i < G.n - 1; i++) {
    const a = at(G.D, i - 1);
    const b = at(G.D, i);
    if (!bends.has(i) && Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-6) {
      const c = at(G.cut, i);
      const nd = (Math.atan2(c[1], c[0]) * 180) / Math.PI;
      const q = at(G.pts, i);
      mirrors.push({ i, at: [q[0], q[1]], normal: nd, surface: nd + 90, rot: nd + 180 });
    }
  }
  return mirrors;
}

function vertexPorts(pts: readonly Point[]): Ports {
  const first = at(pts, 0);
  const last = at(pts, pts.length - 1);
  const ports: Ports = { start: [first[0], first[1]], end: [last[0], last[1]] };
  for (let i = 1; i < pts.length - 1; i++) {
    const q = at(pts, i);
    ports[`v${i}`] = [q[0], q[1]];
  }
  return ports;
}

export function beamPath(p: Parent, pts: readonly Point[], o: BeamPathOpts = {}): BeamPathResult {
  const hw = (o.width ?? 3) / 2;
  const color = o.color ?? C.beam;
  const n = pts.length;
  const bends = new Set(o.bends ?? []);
  const g = el(p, 'g', { 'data-part': o.part ?? 'beam' });
  const D = directions(pts);
  const G: Geom = { pts, n, D, cut: cutNormals(n, D, bends), rays: new Map() };
  const hollow = o.hollow ?? false;
  const from = hollow ? (o.from ?? 0) : n;
  const ri = hw * (o.inner ?? 0.6);
  path(g, bandPath(G, hw, ri, from), { fill: color, opacity: o.opacity ?? 0.5, part: 'beam-band' });
  if (o.edge ?? false) drawEdges(g, G, o, hw, ri, from, color);
  if ((o.core ?? false) && Math.min(from, n - 1) > 0) {
    path(g, segPath(ray(G, 0), 0, Math.min(from, n - 1)), {
      stroke: o.coreColor ?? shade(color, -0.2), width: o.coreWidth ?? Math.max(0.35, hw * 0.25), opacity: 0.9, cap: 'butt', join: 'miter', part: 'beam-core',
    });
  }
  const centre = ray(G, 0);
  const cum = arcLengths(centre);
  drawArrows(g, G, o, cum, hw, ri, from, color);
  const r = finish(o.F, o.name, g, vertexPorts(pts));
  return { ...r, mirrors: foldMirrors(G, bends), edges: [ray(G, -hw), ray(G, hw)], centre, cum };
}
