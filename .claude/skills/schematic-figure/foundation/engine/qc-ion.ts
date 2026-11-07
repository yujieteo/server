// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Loose, Parent } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, polygon, radialGradient, rect } from './draw.ts';
import { at, f3 } from './util.ts';
import { C } from './qc-base.ts';

export type BoxColors = Loose<{ front: string; top: string; side: string }>;
export interface FaceColors {
  front: string;
  top: string;
  side: string;
}

export type ObliqueOpts = Loose<{
  part: string;
  dx: number;
  dy: number;
  depth: 'left' | 'right';
  color: string;
  colors: BoxColors;
  opacity: number;
  stroke: string;
  width: number;
}>;

export function boxColors(color: string | undefined, colors: BoxColors | undefined, fallback: string): FaceColors {
  const c = color ?? fallback;
  return { front: colors?.front ?? c, top: colors?.top ?? shade(c, 0.42), side: colors?.side ?? shade(c, -0.36) };
}

function faceStyle(o: ObliqueOpts, fill: string): { fill: string; stroke: string; width: number; join: string } {
  return { fill, stroke: o.stroke ?? 'none', width: o.width ?? STYLE.line.thin, join: 'round' };
}

export function obliqueBox(p: Parent, x: number, y: number, w: number, h: number, o: ObliqueOpts = {}): SVGGElement {
  const dx = o.dx ?? Math.min(w, h) * 0.25;
  const dy = o.dy ?? dx * 0.66;
  const col = boxColors(o.color, o.colors, C.gold);
  const right = o.depth === 'right';
  const g = el(p, 'g', { 'data-part': o.part ?? 'oblique-box', opacity: o.opacity });
  const s = right ? 1 : -1;
  polygon(g, [[x, y], [x + w, y], [x + w + s * dx, y - dy], [x + s * dx, y - dy]], faceStyle(o, col.top));
  const xe = right ? x + w : x;
  polygon(g, [[xe, y], [xe + s * dx, y - dy], [xe + s * dx, y + h - dy], [xe, y + h]], faceStyle(o, col.side));
  rect(g, x, y, w, h, faceStyle(o, col.front));
  return g;
}

export type SegmentRowOpts = Loose<{
  part: string;
  n: number;
  pitch: number;
  w: number;
  h: number;
  dx: number;
  dy: number;
  depth: 'left' | 'right';
  color: string;
  colors: BoxColors;
  highlight: Record<number, string | BoxColors>;
  fade: readonly number[];
  fadeEnds: number;
  labels: Record<number, string>;
  labelSize: number;
  labelColor: string;
}>;

export interface SegmentRowOut {
  node: SVGGElement;
  x: number;
  pitch: number;
  w: number;
  yMid: number;
}

export function segmentX(r: SegmentRowOut, k: number): number {
  return r.x + k * r.pitch + r.w / 2;
}

function segOpacity(o: SegmentRowOpts, n: number, m: number, k: number): number {
  if (o.fade !== undefined) return o.fade[k] ?? 1;
  const e = Math.min(k, n - 1 - k);
  if (e >= m) return 1;
  return m > 1 ? 0.22 + (0.53 * e) / (m - 1) : 0.3;
}

export function segmentRow(p: Parent, x: number, y: number, o: SegmentRowOpts = {}): SegmentRowOut {
  const n = o.n ?? 8;
  const pitch = o.pitch ?? 14;
  const w = o.w ?? pitch * 0.87;
  const h = o.h ?? pitch;
  const dx = o.dx ?? w * 0.27;
  const dy = o.dy ?? dx * 0.66;
  const m = o.fadeEnds ?? 0;
  const g = el(p, 'g', { 'data-part': o.part ?? 'segment-row' });
  const order: number[] = [];
  for (let k = 0; k < n; k++) order.push(k);
  if (o.depth !== 'right') order.reverse();
  for (const k of order) {
    const hl = o.highlight?.[k];
    const a = segOpacity(o, n, m, k);
    const color = typeof hl === 'string' ? hl : hl === undefined ? o.color : hl.front;
    const colors = typeof hl === 'string' ? undefined : (hl ?? o.colors);
    obliqueBox(g, x + k * pitch, y, w, h, { dx, dy, depth: o.depth, color, colors, opacity: a < 1 ? a : undefined, part: 'electrode' });
  }
  for (const [k, s] of Object.entries(o.labels ?? {})) {
    text(g, x + Number(k) * pitch + w / 2, y + h / 2, s, { anchor: 'middle', valign: 'middle', size: o.labelSize ?? STYLE.text.label, color: o.labelColor });
  }
  return { node: g, x, pitch, w, yMid: y + h / 2 };
}

export type TrapRailOpts = Loose<{
  part: string;
  dx: number;
  dy: number;
  depth: 'left' | 'right';
  color: string;
  colors: BoxColors;
  notches: Loose<{ x0: number; pitch: number; n: number; w: number; h: number; edge: 'bottom' | 'top'; fill: string }>;
}>;

export function trapRail(p: Parent, x: number, y: number, w: number, h: number, o: TrapRailOpts = {}): SVGGElement {
  const dx = o.dx ?? h * 0.24;
  const dy = o.dy ?? dx * 0.66;
  const col = boxColors(o.color, o.colors, C.orange);
  const g = el(p, 'g', { 'data-part': o.part ?? 'trap-rail' });
  obliqueBox(g, x, y, w, h, { dx, dy, depth: o.depth, colors: col, part: 'rail' });
  const N = o.notches;
  if (N === undefined) return g;
  const nw = N.w ?? dx * 0.5;
  const nh = N.h ?? h * 0.13;
  const bg = N.fill ?? '#fff';
  for (let k = 0; k < (N.n ?? 0); k++) {
    const xf = (N.x0 ?? x + (N.pitch ?? 20)) + k * (N.pitch ?? 20);
    if ((N.edge ?? 'bottom') === 'bottom') {
      rect(g, xf, y + h - nh, nw, nh, { fill: bg });
      polygon(g, [[xf, y + h - nh], [xf + nw, y + h - nh], [xf + nw, y + h], [xf, y + h - nh * 0.45]], { fill: col.side });
    } else {
      polygon(g, [[xf - nw - dx, y - dy], [xf - dx, y - dy], [xf - nw, y]], { fill: bg });
      rect(g, xf - nw, y, nw, nh, { fill: col.top });
      polygon(g, [[xf - dx, y - dy], [xf, y], [xf, y + nh], [xf - nw, y + nh * 0.4], [xf - nw, y]], { fill: col.side });
    }
  }
  return g;
}

export type IonOpts = Loose<{ part: string; dark: string; light: string; highlight: boolean; angle: number; stroke: string; width: number }>;

export function ion(p: Parent, cx: number, cy: number, r: number, color: string = '#1d43f2', o: IonOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'ion' });
  const fill = radialGradient(p, [[0, o.light ?? shade(color, 0.35)], [0.45, color], [1, o.dark ?? shade(color, -0.5)]], { cx: 0.42, cy: 0.38, r: 0.62, fx: 0.62, fy: 0.3 });
  circle(g, cx, cy, r, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.hair });
  if (o.highlight !== false) {
    const hl = radialGradient(p, [[0, '#ffffff', 0.95], [1, '#ffffff', 0]]);
    const hg = el(g, 'g', { transform: `translate(${f3(cx + r * 0.32)} ${f3(cy - r * 0.38)}) rotate(${o.angle ?? 35})` });
    el(hg, 'ellipse', { cx: 0, cy: 0, rx: f3(r * 0.3), ry: f3(r * 0.15), fill: hl });
  }
  return g;
}

function pivotRow(M: readonly (readonly number[])[], c: number, n: number): number {
  let best = c;
  for (let r = c + 1; r < n; r++) {
    if (Math.abs(at(at(M, r), c)) > Math.abs(at(at(M, best), c))) best = r;
  }
  return best;
}

function eliminate(M: number[][], c: number, n: number): void {
  const rc = at(M, c);
  for (let r = c + 1; r < n; r++) {
    const rr = at(M, r);
    const f = at(rr, c) / at(rc, c);
    for (let k = c; k <= n; k++) rr[k] = at(rr, k) - f * at(rc, k);
  }
}

function solve(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const M: number[][] = [];
  for (let i = 0; i < n; i++) M.push([...at(A, i), at(b, i)]);
  for (let c = 0; c < n; c++) {
    const pv = pivotRow(M, c, n);
    const tmp = at(M, c);
    M[c] = at(M, pv);
    M[pv] = tmp;
    eliminate(M, c, n);
  }
  const x: number[] = [];
  for (let i = 0; i < n; i++) x.push(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = at(M, r);
    let s = at(row, n);
    for (let k = r + 1; k < n; k++) s -= at(row, k) * at(x, k);
    x[r] = s / at(row, r);
  }
  return x;
}

function newtonStep(u: readonly number[]): number[] {
  const n = u.length;
  const g = [...u];
  const H: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(i === j ? 1 : 0);
    H.push(row);
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = at(u, i) - at(u, j);
      const a = Math.abs(d);
      g[i] = at(g, i) - Math.sign(d) / (a * a);
      const row = at(H, i);
      row[i] = at(row, i) + 2 / a ** 3;
      row[j] = at(row, j) - 2 / a ** 3;
    }
  }
  return solve(H, g);
}

export type IonStringOpts = Loose<{ cx: number; span: number; gap: number }>;

export function ionString(n: number, o: IonStringOpts = {}): number[] {
  let u: number[] = [];
  for (let i = 0; i < n; i++) u.push((i - (n - 1) / 2) * 1.2 * n ** -0.4);
  const iters = n > 1 ? 200 : 0;
  for (let it = 0; it < iters; it++) {
    const s = newtonStep(u);
    let m = 0;
    const next: number[] = [];
    for (let i = 0; i < n; i++) {
      m = Math.max(m, Math.abs(at(s, i)));
      next.push(at(u, i) - at(s, i));
    }
    u = next;
    if (m < 1e-12) break;
  }
  const mid = Math.floor(n / 2);
  const unitGap = n > 1 ? at(u, mid) - at(u, mid - 1) : 1;
  let k = 1;
  if (o.span !== undefined && n > 1) k = o.span / (at(u, n - 1) - at(u, 0));
  else if (o.gap !== undefined) k = o.gap / unitGap;
  const out: number[] = [];
  for (const x of u) out.push((o.cx ?? 0) + k * x);
  return out;
}
