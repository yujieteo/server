// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, smooth, toLocal } from './draw.ts';
import { at, unit } from './util.ts';
import { INK, PAPER, along, lengthOf, offsetPoints, rounded, tri, userGradient } from './ind-base.ts';

export interface PipeStyle {
  w: number;
  dash?: readonly number[];
  cap?: string;
  mark?: string;
}

export type PipeStyleName =
  | 'process' | 'secondary' | 'reverse' | 'signal' | 'electric' | 'pneumatic' | 'capillary' | 'data'
  | 'wire' | 'dotted' | 'dashed';

export const PIPE_STYLES: Record<PipeStyleName, PipeStyle> = {
  process: { w: 1.6 },
  secondary: { w: 1 },
  reverse: { w: 1.6, dash: [3.2, 1.8] },
  signal: { w: 0.8, dash: [0.01, 1.3], cap: 'round' },
  electric: { w: 0.7, dash: [2.4, 1.2] },
  pneumatic: { w: 0.7, mark: 'slash2' },
  capillary: { w: 0.7, mark: 'cross' },
  data: { w: 0.7, mark: 'circle' },
  wire: { w: 1 },
  dotted: { w: 1.4, dash: [0.01, 2], cap: 'round' },
  dashed: { w: 1, dash: [2.6, 1.6] },
};

export type PipeArrow = 'end' | 'start' | 'both' | 'mid' | readonly number[];

export type PipeOpts = Loose<{
  style: PipeStyleName;
  width: number;
  color: string;
  dash: readonly number[];
  radius: number;
  smooth: boolean;
  arrow: PipeArrow;
  head: number;
  headWidth: number;
  fade: boolean | number;
  fadeLen: number;
  offset: number;
  mark: string;
  markStep: number;
  markSize: number;
  gapAt: readonly Point[];
  gapLen: number;
  gapWidth: number;
  gapColor: string;
  F: Figure;
  from: string;
  to: string;
  kind: string;
}>;

export interface PipeResult {
  node: SVGGElement;
  pts: Point[];
  length: number;
}

function resolvePoints(p: Parent, pts: readonly (Point | string)[], o: PipeOpts): Point[] {
  const out: Point[] = [];
  for (const q of pts) {
    if (typeof q !== 'string') out.push(q);
    else if (o.F === undefined) throw new Error('named pipe point needs F');
    else out.push(toLocal(o.F, p, o.F.at(q)));
  }
  return out;
}

function pipeDash(S: PipeStyle, o: PipeOpts, width: number, w0: number): readonly number[] | undefined {
  if (o.dash !== undefined) return o.dash;
  if (S.dash === undefined || o.width === undefined || o.width === 0) return S.dash;
  const out: number[] = [];
  for (const v of S.dash) out.push((v * width) / w0);
  return out;
}

function shaftPoints(P: readonly Point[], a: PipeArrow | undefined, H: number, len: number): Point[] {
  const Q: Point[] = [];
  for (const q of P) Q.push([q[0], q[1]]);
  const trim = Math.min(H * 0.7, len / 3);
  const n = Q.length;
  if (a === 'end' || a === 'both') {
    const last = at(P, n - 1);
    const prev = at(P, n - 2);
    const [ux, uy] = unit(last[0] - prev[0], last[1] - prev[1]);
    Q[n - 1] = [last[0] - ux * trim, last[1] - uy * trim];
  }
  if (a === 'start' || a === 'both') {
    const first = at(P, 0);
    const next = at(P, 1);
    const [ux, uy] = unit(next[0] - first[0], next[1] - first[1]);
    Q[0] = [first[0] + ux * trim, first[1] + uy * trim];
  }
  return Q;
}

function pipeFade(p: Parent, P: readonly Point[], color: string, fade: boolean | number, fadeLen: number, len: number): string {
  const t0 = fade === true ? 0.05 : +fade;
  const end = along(P, len * fadeLen).p;
  return userGradient(p, at(P, 0), end, [[0, color, t0], [0.6, color, (1 + t0) / 2], [1, color, 1]]);
}

function crossingDir(P: readonly Point[], gx: number, gy: number): Point | undefined {
  let best: { dd: number; u: Point } | undefined;
  for (let i = 0; i + 1 < P.length; i++) {
    const [ax, ay] = at(P, i);
    const [bx, by] = at(P, i + 1);
    const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gy - ay) * (by - ay)) / L2));
    const dd = Math.hypot(ax + t * (bx - ax) - gx, ay + t * (by - ay) - gy);
    if (best === undefined || dd < best.dd) best = { dd, u: unit(bx - ax, by - ay) };
  }
  return best?.u;
}

function drawGaps(g: Parent, P: readonly Point[], o: PipeOpts, width: number): void {
  for (const [gx, gy] of o.gapAt ?? []) {
    const u = crossingDir(P, gx, gy);
    if (u === undefined) continue;
    const hl = (o.gapLen ?? width * 3 + 3) / 2;
    const [ux, uy] = u;
    line(g, [gx - ux * hl, gy - uy * hl], [gx + ux * hl, gy + uy * hl], { stroke: o.gapColor ?? PAPER, width: width + 2 * (o.gapWidth ?? 1.2), cap: 'butt' });
  }
}

function markAt(g: Parent, at0: Point, u: Point, mark: string, m: number, color: string, width: number): void {
  const [x, y] = at0;
  const [ux, uy] = u;
  const nx = -uy;
  const ny = ux;
  if (mark === 'slash2') {
    for (const k of [-0.6, 0.6]) {
      line(g, [x + ux * k - (nx - ux) * m * 0.6, y + uy * k - (ny - uy) * m * 0.6], [x + ux * k + (nx - ux) * m * 0.6, y + uy * k + (ny - uy) * m * 0.6], { stroke: color, width, cap: 'butt' });
    }
  } else if (mark === 'cross') {
    for (const sg of [-1, 1]) {
      line(g, [x - (ux + sg * nx) * m * 0.5, y - (uy + sg * ny) * m * 0.5], [x + (ux + sg * nx) * m * 0.5, y + (uy + sg * ny) * m * 0.5], { stroke: color, width, cap: 'butt' });
    }
  } else if (mark === 'circle') circle(g, x, y, m * 0.45, { fill: PAPER, stroke: color, width });
}

function drawMarks(g: Parent, P: readonly Point[], mark: string, o: PipeOpts, color: string, width: number, len: number): void {
  const step = o.markStep ?? 9;
  const m = o.markSize ?? 1.6;
  for (let s = step / 2; s < len - 1; s += step) {
    const a = along(P, s);
    markAt(g, a.p, a.u, mark, m, color, width);
  }
}

function drawHeads(g: Parent, P: readonly Point[], a: PipeArrow, H: number, HW: number, color: string, len: number): void {
  let at0: readonly number[] = [];
  if (typeof a !== 'string') at0 = a;
  else if (a === 'mid') at0 = [0.5];
  if (a === 'end' || a === 'both') tri(g, at(P, P.length - 1), along(P, len).u, H, HW, color);
  if (a === 'start' || a === 'both') {
    const { u } = along(P, 0);
    tri(g, at(P, 0), [-u[0], -u[1]], H, HW, color);
  }
  for (const t of at0) {
    const { p: q, u } = along(P, t * len + H / 2);
    tri(g, q, u, H, HW, color);
  }
}

export function pipe(p: Parent, pts: readonly (Point | string)[], o: PipeOpts = {}): PipeResult {
  const S = PIPE_STYLES[o.style ?? 'process'];
  let P = resolvePoints(p, pts, o);
  if (o.offset !== undefined && o.offset !== 0) P = offsetPoints(P, o.offset);
  const g = el(p, 'g', { 'data-part': 'pipe-' + (o.style ?? 'process') });
  const w0 = STYLE.line.normal * S.w;
  const color = o.color ?? INK;
  const width = o.width ?? w0;
  const dash = pipeDash(S, o, width, w0);
  const len = lengthOf(P);
  const mark = o.mark ?? S.mark;
  const a = o.arrow;
  const H = o.head ?? STYLE.arrow.head;
  const HW = o.headWidth ?? H * 0.42;
  const Q = shaftPoints(P, a, H, len);
  let stroke = color;
  if (o.fade !== undefined && o.fade !== false && o.fade !== 0) stroke = pipeFade(p, P, color, o.fade, o.fadeLen ?? 0.7, len);
  drawGaps(g, P, o, width);
  path(g, o.smooth === true ? smooth(Q, false, 0.5) : rounded(Q, o.radius ?? 0), { stroke, width, dash, cap: S.cap ?? 'butt', join: 'miter' });
  if (mark !== undefined) drawMarks(g, P, mark, o, color, width, len);
  if (a !== undefined) drawHeads(g, P, a, H, HW, color, len);
  if (o.F !== undefined && o.from !== undefined && o.to !== undefined) o.F.drew(o.from, o.to, o.kind ?? 'flow');
  return { node: g, pts: P, length: len };
}
