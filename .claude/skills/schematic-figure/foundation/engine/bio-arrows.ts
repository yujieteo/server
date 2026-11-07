// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Dash, Figure, Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { arrow, line, linearGradient, path, polygon } from './draw.ts';
import { at } from './util.ts';
import { bez, curveD, floorOf, fw, nz, sideNormals } from './bio-util.ts';

export type CurveArrowOpts = Loose<{
  end: 'arrow' | 'bar' | 'none';
  head: number;
  headWidth: number;
  bar: number;
  width: number;
  color: string;
  dash: Dash;
  F: Figure;
  from: string;
  to: string;
  kind: string;
  part: string;
}>;

export function curveArrow(p: Parent, pts: readonly Point[], o: CurveArrowOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'arrow' });
  const col = o.color ?? STYLE.color.ink;
  const lw = fw(K, o.width ?? STYLE.line.normal);
  const end = o.end ?? 'arrow';
  const n = pts.length;
  const e = at(pts, n - 1);
  const q = n > 4 ? at(pts, n - 2) : bez(pts, 0.97);
  const dl = nz(Math.hypot(e[0] - q[0], e[1] - q[1]));
  const u: Point = [(e[0] - q[0]) / dl, (e[1] - q[1]) / dl];
  const nn: Point = [-u[1], u[0]];
  const hl = o.head ?? STYLE.arrow.head;
  const hw = o.headWidth ?? hl * 0.76;
  const P: Point[] = [...pts];
  if (end === 'arrow') P[n - 1] = [e[0] - u[0] * hl * 0.85, e[1] - u[1] * hl * 0.85];
  path(g, curveD(P), { stroke: col, width: lw, dash: o.dash, cap: end === 'arrow' ? 'butt' : 'round', part: 'arrow-shaft' });
  if (end === 'arrow') {
    const bb: Point = [e[0] - u[0] * hl, e[1] - u[1] * hl];
    polygon(g, [e, [bb[0] + (nn[0] * hw) / 2, bb[1] + (nn[1] * hw) / 2], [bb[0] - (nn[0] * hw) / 2, bb[1] - (nn[1] * hw) / 2]], { fill: col, part: 'arrowhead' });
  } else if (end === 'bar') {
    const b = o.bar ?? hl * 1.4;
    line(g, [e[0] + (nn[0] * b) / 2, e[1] + (nn[1] * b) / 2], [e[0] - (nn[0] * b) / 2, e[1] - (nn[1] * b) / 2], { stroke: col, width: fw(K, lw * 1.5), cap: 'butt', part: 'arrowhead' });
  }
  if (o.F !== undefined && o.from !== undefined && o.to !== undefined) o.F.drawn.push({ from: o.from, to: o.to, kind: o.kind ?? (end === 'bar' ? 'inhibits' : 'flow') });
  return { node: g };
}

export type TaperArrowOpts = Loose<{
  w0: number;
  w1: number;
  head: number;
  headWidth: number;
  color: string;
  fade: boolean | number;
  F: Figure;
  from: string;
  to: string;
  kind: string;
  part: string;
}>;

function taperPoly(S: readonly Point[], cum: readonly number[], ib: number, w0: number, w1: number, hw: number): Point[] {
  const N = S.length - 1;
  const up: Point[] = [];
  const dn: Point[] = [];
  for (let i = 0; i <= ib; i++) {
    const a = at(S, Math.max(0, i - 1));
    const b = at(S, Math.min(N, i + 1));
    const l = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const w = (w0 + (w1 - w0) * Math.sqrt(at(cum, i) / at(cum, ib))) / 2;
    const s = at(S, i);
    up.push([s[0] + nx * w, s[1] + ny * w]);
    dn.push([s[0] - nx * w, s[1] - ny * w]);
  }
  const e = at(S, N);
  const bpt = at(S, ib);
  const l = nz(Math.hypot(e[0] - bpt[0], e[1] - bpt[1]));
  const nx = -(e[1] - bpt[1]) / l;
  const ny = (e[0] - bpt[0]) / l;
  return [...up, [bpt[0] + (nx * hw) / 2, bpt[1] + (ny * hw) / 2], e, [bpt[0] - (nx * hw) / 2, bpt[1] - (ny * hw) / 2], ...dn.toReversed()];
}

export function taperArrow(p: Parent, pts: readonly Point[], o: TaperArrowOpts = {}): { node: SVGPolygonElement } {
  const N = 64;
  const S: Point[] = [];
  for (let i = 0; i <= N; i++) S.push(bez(pts, i / N));
  const cum: number[] = [0];
  for (let i = 1; i <= N; i++) cum.push(at(cum, i - 1) + Math.hypot(at(S, i)[0] - at(S, i - 1)[0], at(S, i)[1] - at(S, i - 1)[1]));
  const Lt = at(cum, N);
  const w1 = o.w1 ?? 0.06 * Lt;
  const w0 = o.w0 ?? 0.35 * w1;
  const hl = o.head ?? 1.9 * w1;
  const hw = o.headWidth ?? 2.3 * w1;
  const col = o.color ?? '#1f1f1f';
  let ib = N;
  while (ib > 1 && Lt - at(cum, ib) < hl) ib--;
  const poly = taperPoly(S, cum, ib, w0, w1, hw);
  const e = at(S, N);
  const s0 = at(S, 0);
  const ang = (Math.atan2(e[1] - s0[1], e[0] - s0[0]) * 180) / Math.PI;
  const fd = o.fade === true ? 0.6 : typeof o.fade === 'number' ? o.fade : undefined;
  const fill = fd !== undefined && fd !== 0 ? linearGradient(p, [[0, col, 0], [fd, col, 1], [1, col, 1]], ang) : col;
  const node = polygon(p, poly, { fill, part: o.part ?? 'arrow' });
  if (o.F !== undefined && o.from !== undefined && o.to !== undefined) o.F.drawn.push({ from: o.from, to: o.to, kind: o.kind ?? 'flow' });
  return { node };
}

export type MergeArrowOpts = Loose<{ color: string; width: number; head: number; F: Figure; fromNames: readonly string[]; toName: string; kind: string; part: string }>;

export function mergeArrow(p: Parent, froms: readonly Point[], join: Point, to: Point, o: MergeArrowOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'merge' });
  const col = o.color ?? STYLE.color.ink;
  const lw = fw(K, o.width ?? STYLE.line.normal);
  const dl = nz(Math.hypot(to[0] - join[0], to[1] - join[1]));
  const u: Point = [(to[0] - join[0]) / dl, (to[1] - join[1]) / dl];
  for (const f of froms) {
    const d = Math.hypot(join[0] - f[0], join[1] - f[1]);
    path(g, curveD([f, [f[0] + (join[0] - f[0]) * 0.5, f[1]], [join[0] - u[0] * d * 0.4, join[1] - u[1] * d * 0.4], join]), { stroke: col, width: lw });
  }
  arrow(g, join, to, { stroke: col, width: lw, head: o.head });
  if (o.F !== undefined && o.fromNames !== undefined && o.toName !== undefined) {
    for (const fn of o.fromNames) o.F.drawn.push({ from: fn, to: o.toName, kind: o.kind ?? 'flow' });
  }
  return { node: g };
}

export function taperCurve(g: Parent, P: readonly Point[], w0: number, w1: number, s: Parameters<typeof polygon>[2] = {}): SVGPolygonElement {
  const N = 18;
  const S: Point[] = [];
  for (let i = 0; i <= N; i++) S.push(bez(P, i / N));
  const up: Point[] = [];
  const dn: Point[] = [];
  for (let i = 0; i <= N; i++) {
    const [nx, ny] = sideNormals(S, i);
    const w = (w0 + ((w1 - w0) * i) / N) / 2;
    const q = at(S, i);
    up.push([q[0] + nx * w, q[1] + ny * w]);
    dn.push([q[0] - nx * w, q[1] - ny * w]);
  }
  return polygon(g, [...up, ...dn.toReversed()], s);
}
