// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Paint, Parent, Point } from './types.ts';
import { path, smooth } from './draw.ts';
import { at } from './util.ts';
import { sampleCurve } from './bio-util.ts';
import type { TailPose } from './bio-mouse-data.ts';

export interface MouseM {
  x: number;
  y: number;
  u: number;
  f: number;
  ca: number;
  sa: number;
}

export function mpt(m: MouseM, q: Point): Point {
  const dx = m.f * (q[0] - 50) * m.u;
  const dy = q[1] * m.u;
  return [m.x + dx * m.ca - dy * m.sa, m.y + dx * m.sa + dy * m.ca];
}

export function mapAll(m: MouseM, pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) out.push(mpt(m, q));
  return out;
}

const RAISED: readonly Point[] = [[0, 0], [-0.12, -0.12], [-0.16, -0.35], [-0.1, -0.6], [-0.05, -0.8], [-0.14, -0.93], [-0.3, -0.97], [-0.44, -0.9], [-0.5, -0.76]];

export function mouseTail(b: Point, T: number, kind: TailPose): Point[] {
  const [a, c] = b;
  if (kind === 'raised') {
    const out: Point[] = [];
    for (const [u, v] of RAISED) out.push([a + u * T * 0.62, c + v * T * 0.62]);
    return out;
  }
  if (kind === 'straight') return [b, [a - 0.3 * T, c - 3], [a - 0.65 * T, c - 4], [a - T, c - 1.5]];
  if (kind === 'curl') return [b, [a - 0.25 * T, c + 0.07 * T], [a - 0.5 * T, c - 0.06 * T], [a - 0.75 * T, c + 0.07 * T], [a - T, c]];
  return [b, [a - 0.28 * T, c + 4], [a - 0.58 * T, -1.8], [a - 0.84 * T, -1.2], [a - T, -3]];
}

export function taperAlong(g: Parent, pts: readonly Point[], w0: number, w1: number, s: Paint = {}): SVGPathElement {
  let L0 = 0;
  for (let i = 1; i < pts.length; i++) L0 += Math.hypot(at(pts, i)[0] - at(pts, i - 1)[0], at(pts, i)[1] - at(pts, i - 1)[1]);
  const S = sampleCurve(g, pts, Math.max(L0 / 48, 1e-3)).pts;
  const n = S.length - 1;
  const up: Point[] = [];
  const dn: Point[] = [];
  for (let i = 0; i < S.length; i++) {
    const q = at(S, i);
    const w = (w0 + ((w1 - w0) * i) / n) / 2;
    up.push([q.x - q.ty * w, q.y + q.tx * w]);
    dn.push([q.x + q.ty * w, q.y - q.tx * w]);
  }
  return path(g, smooth([...up, ...dn.toReversed()], true, 0.3), s);
}
