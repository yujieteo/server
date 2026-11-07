// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { Figure, Loose, Parent, Point, Ports, TextOpts } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { line, toLocal } from './draw.ts';
import { at, f3, unit } from './util.ts';

const C = STYLE.color;

export interface NodeOut {
  node: SVGGElement;
}

export function reg(F: Figure | undefined, name: string | undefined, parent: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y);
  }
  return ports;
}

export function res(F: Figure | undefined, p: Parent, q: Point | string): Point {
  if (typeof q !== 'string') return q;
  if (F === undefined) throw new Error(`cs: anchor "${q}" given without {F}`);
  return toLocal(F, p, F.at(q));
}

export type RecOpts = Loose<{ kind: string; relate: boolean; relFrom: string; relTo: string }>;

export function record(F: Figure | undefined, from: Point | string, to: Point | string, o: RecOpts): void {
  if (F === undefined) return;
  const a = o.relFrom ?? (typeof from === 'string' ? from : null);
  const b = o.relTo ?? (typeof to === 'string' ? to : null);
  if (a === null || a === '' || b === null || b === '') return;
  const kind = o.kind ?? 'flow';
  if (o.relate === true) F.relate(a, b, kind);
  F.drawn.push({ from: a, to: b, kind });
}

export function tw(t: SVGTextElement): number {
  try {
    return t.getBBox().width;
  } catch {
    return 0;
  }
}

export function polyD(P: readonly Point[]): string {
  let out = 'M';
  for (let i = 0; i < P.length; i++) {
    const q = at(P, i);
    out += `${i > 0 ? ' L' : ''}${f3(q[0])},${f3(q[1])}`;
  }
  return out;
}

export function p2(q: Point): string {
  return `${f3(q[0])},${f3(q[1])}`;
}

function corner(a: Point, b: Point, c: Point, r: number): string {
  const la = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lb = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ua = unit(b[0] - a[0], b[1] - a[1]);
  const ub = unit(c[0] - b[0], c[1] - b[1]);
  const rr = Math.min(r, la / 2, lb / 2);
  if (rr <= 0) return ` L${f3(b[0])},${f3(b[1])}`;
  return ` L${f3(b[0] - ua[0] * rr)},${f3(b[1] - ua[1] * rr)} Q${f3(b[0])},${f3(b[1])} ${f3(b[0] + ub[0] * rr)},${f3(b[1] + ub[1] * rr)}`;
}

export function routeD(P: readonly Point[], r: number = 3): string {
  const first = at(P, 0);
  let d = `M${f3(first[0])},${f3(first[1])}`;
  for (let i = 1; i < P.length - 1; i++) d += corner(at(P, i - 1), at(P, i), at(P, i + 1), r);
  const last = at(P, P.length - 1);
  return `${d} L${f3(last[0])},${f3(last[1])}`;
}

export interface Units {
  k: number;
  x0: number;
  y0: number;
}

export function units(k: number, o: Loose<{ x0: number; y0: number }> = {}): Units {
  return { k, x0: o.x0 ?? 0, y0: o.y0 ?? 0 };
}

export function unitX(u: Units, v: number): number {
  return v * u.k;
}

export function unitP(u: Units, q: Point): Point {
  return [(q[0] - u.x0) * u.k, (q[1] - u.y0) * u.k];
}

export function unitPts(u: Units, a: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of a) out.push(unitP(u, q));
  return out;
}

export type FitOpts = TextOpts & Loose<{ minSize: number }>;

export function fitText(p: Parent, x: number, y: number, str: string, maxW: number, o: FitOpts = {}): SVGTextElement {
  const size = o.size ?? STYLE.text.label;
  let t = text(p, x, y, str, { ...o, size });
  const w = tw(t);
  if (maxW > 0 && w > maxW) {
    t.remove();
    t = text(p, x, y, str, { ...o, size: Math.max(Math.min(size, o.minSize ?? STYLE.text.min), (size * maxW) / w) });
  }
  return t;
}

export type RichSpan = { s: string } & Loose<{
  size: number;
  family: string;
  italic: boolean;
  weight: string | number;
  color: string;
  math: boolean;
  gap: number;
  dx: number;
}>;
export type RichOpts = Loose<{
  part: string;
  size: number;
  family: string;
  color: string;
  gap: number;
  anchor: 'start' | 'middle' | 'end';
  valign: 'baseline' | 'middle';
}>;
export interface SpanExtent {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface RichRowOut {
  node: SVGGElement;
  width: number;
  texts: SVGTextElement[];
  spans: SpanExtent[];
}

function bboxYH(t: SVGTextElement): { y: number; height: number } {
  try {
    const b = t.getBBox();
    return { y: b.y, height: b.height };
  } catch {
    return { y: 0, height: 0 };
  }
}

function layRich(g: SVGGElement, spans: readonly (string | RichSpan)[], o: RichOpts): { texts: SVGTextElement[]; x0s: number[]; width: number } {
  const baseSize = o.size ?? STYLE.text.label;
  const texts: SVGTextElement[] = [];
  const x0s: number[] = [];
  let cx = 0;
  for (let i = 0; i < spans.length; i++) {
    const raw = at(spans, i);
    const s: RichSpan = typeof raw === 'string' ? { s: raw } : raw;
    const size = s.size ?? baseSize;
    cx += (i > 0 ? (s.gap ?? o.gap ?? size * 0.25) : 0) + (s.dx ?? 0);
    const t = text(g, cx, 0, s.s, { size, family: s.family ?? o.family, italic: s.italic, weight: s.weight, color: s.color ?? o.color, math: s.math });
    texts.push(t);
    x0s.push(cx);
    cx += tw(t);
  }
  return { texts, x0s, width: cx };
}

export function richRow(p: Parent, x: number, y: number, spans: readonly (string | RichSpan)[], o: RichOpts = {}): RichRowOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'rich-row' });
  const lay = layRich(g, spans, o);
  const anchor = o.anchor ?? 'start';
  const shiftX = anchor === 'middle' ? -lay.width / 2 : anchor === 'end' ? -lay.width : 0;
  let dy = 0;
  if ((o.valign ?? 'baseline') === 'middle') {
    const b = g.getBBox();
    dy = -(b.y + b.height / 2);
  }
  g.setAttribute('transform', `translate(${f3(x + shiftX)} ${f3(y + dy)})`);
  const ox = f3(x + shiftX);
  const oy = f3(y + dy);
  const ext: SpanExtent[] = [];
  for (let i = 0; i < lay.texts.length; i++) {
    const t = at(lay.texts, i);
    const b = bboxYH(t);
    const x0 = at(lay.x0s, i);
    ext.push({ x0: ox + x0, x1: ox + x0 + tw(t), y0: oy + b.y, y1: oy + b.y + b.height });
  }
  return { node: g, width: lay.width, texts: lay.texts, spans: ext };
}

export type FractionOpts = Loose<{
  part: string;
  size: number;
  family: string;
  math: boolean;
  italic: boolean;
  color: string;
  anchor: 'start' | 'middle' | 'end';
  rule: number;
  pad: number;
  gap: number;
  ruleColor: string;
}>;

export function fraction(p: Parent, x: number, y: number, num: string, den: string, o: FractionOpts = {}): { node: SVGGElement; w: number; left: number; right: number } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'fraction' });
  const size = o.size ?? STYLE.text.label;
  const gap = o.gap ?? size * 0.12;
  const st: TextOpts = { size, family: o.family, math: o.math, italic: o.italic, color: o.color, anchor: 'middle' };
  const tn = text(g, 0, 0, num, { ...st, valign: 'bottom' });
  const td = text(g, 0, 0, den, { ...st, valign: 'top' });
  const w = Math.max(tw(tn), tw(td)) + 2 * (o.pad ?? size * 0.12);
  const an = o.anchor ?? 'middle';
  const cx = an === 'middle' ? x : an === 'start' ? x + w / 2 : x - w / 2;
  const rows: [SVGTextElement, number][] = [[tn, -1], [td, 1]];
  for (const [t, s] of rows) {
    const prev = t.getAttribute('transform') ?? '';
    t.setAttribute('transform', `translate(${f3(cx)} ${f3(y + s * gap)}) ${prev}`);
  }
  line(g, [cx - w / 2, y], [cx + w / 2, y], { stroke: o.ruleColor ?? o.color ?? C.text, width: o.rule ?? size * 0.06, cap: 'butt', part: 'fraction-rule' });
  return { node: g, w, left: cx - w / 2, right: cx + w / 2 };
}
