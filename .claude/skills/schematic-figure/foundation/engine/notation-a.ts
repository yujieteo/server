// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/notation.js
import type { Figure, Loose, Parent, Ports, TextOpts } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { path, rect } from './draw.ts';
import { at, f3 } from './util.ts';

const C = STYLE.color;
const MINUS = '−';

export function regPorts(F: Figure | undefined, name: string | undefined, parent: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y);
  }
  return ports;
}

export type DelimKind = '(' | ')' | '[' | ']' | '|' | '‖' | '||';
export type DelimOpts = Loose<{ w: number; mid: number; end: number; gap: number; color: string; part: string }>;

export interface DelimResult {
  node: SVGGElement;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  inner: number;
}

function ctl(e: number, b: number): number {
  return e + ((b - e) * 4) / 3;
}

function parenD(left: boolean, x0: number, x1: number, y0: number, y1: number, h: number, mid: number, end: number): string {
  const s = left ? 1 : -1;
  const xe = left ? x1 : x0;
  const xb = left ? x0 : x1;
  const k = 0.2 * h;
  const xe2 = xe + s * end;
  const xb2 = xb + s * mid;
  return `M${f3(xe)},${f3(y0)} C${f3(ctl(xe, xb))},${f3(y0 + k)} ${f3(ctl(xe, xb))},${f3(y1 - k)} ${f3(xe)},${f3(y1)}`
    + ` L${f3(xe2)},${f3(y1)} C${f3(ctl(xe2, xb2))},${f3(y1 - k)} ${f3(ctl(xe2, xb2))},${f3(y0 + k)} ${f3(xe2)},${f3(y0)}Z`;
}

function squareD(left: boolean, x0: number, x1: number, y0: number, y1: number, w: number, t: number): string {
  const ta = t * 0.85;
  const xo = left ? x0 : x1;
  const s = left ? 1 : -1;
  return `M${f3(xo)},${f3(y0)} L${f3(xo + s * w)},${f3(y0)} L${f3(xo + s * w)},${f3(y0 + ta)} L${f3(xo + s * t)},${f3(y0 + ta)}`
    + ` L${f3(xo + s * t)},${f3(y1 - ta)} L${f3(xo + s * w)},${f3(y1 - ta)} L${f3(xo + s * w)},${f3(y1)} L${f3(xo)},${f3(y1)}Z`;
}

function barsD(x: number, y0: number, y1: number, n: number, t: number, gap: number): string {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = x + i * (t + gap);
    d += `M${f3(a)},${f3(y0)} L${f3(a + t)},${f3(y0)} L${f3(a + t)},${f3(y1)} L${f3(a)},${f3(y1)}Z`;
  }
  return d;
}

export function delim(p: Parent, kind: DelimKind, x: number, y0: number, y1: number, o: DelimOpts = {}): DelimResult {
  const h = y1 - y0;
  const w = o.w ?? Math.min(6, Math.max(2, 0.12 * h));
  const mid = o.mid ?? 0.5 + 0.0095 * h;
  const g = el(p, 'g', { 'data-part': o.part ?? 'delim' });
  const x0 = x;
  let x1 = x + w;
  let d = '';
  if (kind === '(' || kind === ')') d = parenD(kind === '(', x0, x1, y0, y1, h, mid, o.end ?? 0.22);
  else if (kind === '[' || kind === ']') d = squareD(kind === '[', x0, x1, y0, y1, w, o.mid ?? mid * 0.8);
  else {
    const t = o.mid ?? mid * 0.6;
    const n = kind === '|' ? 1 : 2;
    const gap = o.gap ?? t * 2.2;
    x1 = x + t * n + gap * (n - 1);
    d = barsD(x, y0, y1, n, t, gap);
  }
  path(g, d, { fill: o.color ?? C.text });
  return { node: g, x0, x1, y0, y1, inner: kind === ')' || kind === ']' ? x0 : x1 };
}

export type MatrixCell = number | string | null | undefined;
export type MatrixKind = DelimKind | 'none';
export type TexMatrixOpts = Loose<{
  size: number; family: string; math: boolean; color: string; cellColors: readonly (readonly (string | undefined)[])[];
  colGap: number; colXs: readonly number[]; uniform: boolean; rowPitch: number; hangMinus: boolean; delim: MatrixKind; delimGap: number;
  vPad: number; delimW: number; delimMid: number; delimColor: string; rowTint: readonly (string | null | undefined)[]; tintPad: number;
  anchor: 'start' | 'middle' | 'end'; valign: 'middle' | 'top'; capHeight: number; part: string; F: Figure; name: string;
}>;

export interface MatrixPos {
  x: number;
  y: number;
  cy: number;
}

export interface TexMatrixResult {
  node: SVGGElement;
  cells: MatrixPos[][];
  colXs: number[];
  rowYs: number[];
  rowCenters: number[];
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  w: number;
  h: number;
  ports: Ports;
  delims: [DelimResult | null, DelimResult | null];
}

interface Entry {
  s: string;
  neg: boolean;
  w: number;
}

function measureText(g: Element, s: string, ts: TextOpts): number {
  const t = text(g, 0, 0, s, ts);
  const w = t.getBBox().width;
  t.remove();
  return w;
}

function toEntry(g: Element, v: MatrixCell, hang: boolean, ts: TextOpts): Entry | null {
  if (v === null || v === undefined || v === '') return null;
  let s = String(v);
  let neg = false;
  const first = s.charAt(0);
  if (hang && (first === '-' || first === MINUS)) {
    neg = true;
    s = s.slice(1);
  } else if (first === '-') s = MINUS + s.slice(1);
  return { s, neg, w: measureText(g, s, ts) };
}

function columnWidth(ent: readonly (readonly (Entry | null | undefined)[])[], c: number): number {
  let m = 0;
  for (const r of ent) m = Math.max(m, r[c]?.w ?? 0);
  return m;
}

function columnHasNeg(ent: readonly (readonly (Entry | null | undefined)[])[], c: number): boolean {
  for (const r of ent) if (r[c]?.neg === true) return true;
  return false;
}

function maxOf(a: readonly number[]): number {
  let m = -Infinity;
  for (const v of a) m = Math.max(m, v);
  return m;
}

function columnOffsets(o: TexMatrixOpts, size: number, colW: readonly number[], colNeg: readonly boolean[], minusW: number): number[] {
  const nc = colW.length;
  if (o.colXs !== undefined) {
    const x0 = o.colXs[0] ?? 0;
    const out: number[] = [];
    for (const v of o.colXs) out.push(v - x0);
    return out;
  }
  const baseGap = o.colGap ?? size * 0.9;
  const uni = o.uniform ?? true;
  const Wmax = maxOf(colW);
  const gaps: number[] = [];
  for (let c = 0; c < nc; c++) gaps.push(Math.max(baseGap, at(colNeg, c) ? minusW + size * 0.15 : 0));
  const G = uni ? maxOf(gaps) : 0;
  const xs = [0];
  for (let c = 1; c < nc; c++) {
    const prev = at(xs, c - 1);
    xs.push(uni ? prev + Wmax + G : prev + at(colW, c - 1) / 2 + at(gaps, c) + at(colW, c) / 2);
  }
  return xs;
}

interface MatrixGeom {
  xs: number[];
  rc: number[];
  colW: number[];
  colNeg: boolean[];
  minusW: number;
  capH: number;
  pitch: number;
  innerL: number;
  innerR: number;
  dy0: number;
  dy1: number;
  barW: number;
  totalW: number;
  kind: MatrixKind;
}

function matrixGeom(o: TexMatrixOpts, size: number, capH: number, nr: number, colW: number[], colNeg: boolean[], minusW: number, xs: number[]): MatrixGeom {
  const nc = colW.length;
  const pitch = o.rowPitch ?? size * 1.3;
  const rc: number[] = [];
  for (let r = 0; r < nr; r++) rc.push(r * pitch);
  const dGap = o.delimGap ?? size * 0.35;
  const vPad = o.vPad ?? size * 0.35;
  const innerL = at(xs, 0) - at(colW, 0) / 2 - (at(colNeg, 0) ? minusW : 0) - dGap;
  const innerR = at(xs, nc - 1) + at(colW, nc - 1) / 2 + dGap;
  const dy0 = at(rc, 0) - capH / 2 - vPad;
  const dy1 = at(rc, nr - 1) + capH / 2 + vPad;
  const dh = dy1 - dy0;
  const kind = o.delim ?? '(';
  const dw = kind === 'none' ? 0 : (o.delimW ?? Math.min(6, Math.max(2, 0.12 * dh)));
  const bars = kind === '|' || kind === '‖' || kind === '||';
  const barW = bars ? (o.delimMid ?? (0.5 + 0.0095 * dh) * 0.6) * (kind === '|' ? 1 : 3.2) : dw;
  return { xs, rc, colW, colNeg, minusW, capH, pitch, innerL, innerR, dy0, dy1, barW, totalW: innerR - innerL + 2 * barW, kind };
}

const CLOSE: Record<DelimKind, DelimKind> = { '(': ')', ')': ')', '[': ']', ']': ']', '|': '|', '‖': '‖', '||': '||' };

function closeKind(kind: DelimKind): DelimKind {
  return CLOSE[kind];
}

function drawCells(g: SVGGElement, o: TexMatrixOpts, ent: readonly (readonly (Entry | null | undefined)[])[], q: MatrixGeom, ox: number, oy: number, ts: TextOpts): MatrixPos[][] {
  const cells: MatrixPos[][] = [];
  for (let r = 0; r < ent.length; r++) {
    const row = at(ent, r);
    const out: MatrixPos[] = [];
    for (let c = 0; c < q.xs.length; c++) {
      const cx = ox + at(q.xs, c);
      const cy = oy + at(q.rc, r);
      const base = cy + q.capH / 2;
      const e = row[c];
      if (e !== undefined && e !== null) {
        const s2: TextOpts = { ...ts, color: o.cellColors?.[r]?.[c] ?? ts.color };
        text(g, cx, base, e.s, { ...s2, anchor: 'middle' });
        if (e.neg) text(g, cx - e.w / 2, base, MINUS, { ...s2, anchor: 'end' });
      }
      out.push({ x: cx, y: base, cy });
    }
    cells.push(out);
  }
  return cells;
}

function matrixEntries(g: SVGGElement, rows: readonly (readonly MatrixCell[])[], hang: boolean, ts: TextOpts): (Entry | null)[][] {
  const ent: (Entry | null)[][] = [];
  for (const row of rows) {
    const e: (Entry | null)[] = [];
    for (const v of row) e.push(toEntry(g, v, hang, ts));
    ent.push(e);
  }
  return ent;
}

function drawTints(g: SVGGElement, o: TexMatrixOpts, q: MatrixGeom, ox: number, oy: number, nr: number): void {
  if (o.rowTint === undefined) return;
  const tp = o.tintPad ?? 0;
  for (let r = 0; r < nr; r++) {
    const f = o.rowTint[r];
    if (f !== undefined && f !== null && f !== '') {
      rect(g, ox + q.innerL - tp, oy + at(q.rc, r) - q.pitch / 2, q.innerR - q.innerL + 2 * tp, q.pitch, { fill: f, part: 'matrix-row-tint' });
    }
  }
}

function drawDelims(g: SVGGElement, o: TexMatrixOpts, q: MatrixGeom, left: number, ox: number, y0: number, y1: number): [DelimResult | null, DelimResult | null] {
  if (q.kind === 'none') return [null, null];
  const dopt: DelimOpts = { w: o.delimW, mid: o.delimMid, color: o.delimColor ?? o.color };
  return [delim(g, q.kind, left, y0, y1, dopt), delim(g, closeKind(q.kind), ox + q.innerR, y0, y1, dopt)];
}

function offsetAll(a: readonly number[], d: number): number[] {
  const out: number[] = [];
  for (const v of a) out.push(d + v);
  return out;
}

export function texMatrix(p: Parent, x: number, y: number, rows: readonly (readonly MatrixCell[])[], o: TexMatrixOpts = {}): TexMatrixResult {
  const size = o.size ?? STYLE.text.label;
  const latex = o.family !== undefined && /Latin Modern/.test(o.family);
  const capH = (o.capHeight ?? (latex ? 0.683 : 0.716)) * size;
  const g = el(p, 'g', { 'data-part': o.part ?? 'tex-matrix' });
  const ts: TextOpts = { size, family: o.family, math: o.math, color: o.color };
  const nr = rows.length;
  let nc = 0;
  for (const r of rows) nc = Math.max(nc, r.length);
  const minusW = measureText(g, MINUS, ts);
  const ent = matrixEntries(g, rows, o.hangMinus ?? true, ts);
  const colW: number[] = [];
  const colNeg: boolean[] = [];
  for (let c = 0; c < nc; c++) {
    colW.push(columnWidth(ent, c));
    colNeg.push(columnHasNeg(ent, c));
  }
  const q = matrixGeom(o, size, capH, nr, colW, colNeg, minusW, columnOffsets(o, size, colW, colNeg, minusW));
  const an = o.anchor ?? 'start';
  const left = an === 'start' ? x : an === 'middle' ? x - q.totalW / 2 : x - q.totalW;
  const ox = left + q.barW - q.innerL;
  const oy = (o.valign ?? 'middle') === 'top' ? y - q.dy0 : y - (at(q.rc, 0) + at(q.rc, nr - 1)) / 2;
  drawTints(g, o, q, ox, oy, nr);
  const cells = drawCells(g, o, ent, q, ox, oy, ts);
  const y0 = oy + q.dy0;
  const y1 = oy + q.dy1;
  const delims = drawDelims(g, o, q, left, ox, y0, y1);
  const x1 = left + q.totalW;
  const cx = (left + x1) / 2;
  const cy = (y0 + y1) / 2;
  const ports = regPorts(o.F, o.name, p, { left: [left, cy], right: [x1, cy], top: [cx, y0], bottom: [cx, y1], center: [cx, cy] });
  const rowYs: number[] = [];
  for (const r of cells) rowYs.push(at(r, 0).y);
  return { node: g, cells, colXs: offsetAll(q.xs, ox), rowYs, rowCenters: offsetAll(q.rc, oy), x0: left, x1, y0, y1, w: q.totalW, h: y1 - y0, ports, delims };
}
