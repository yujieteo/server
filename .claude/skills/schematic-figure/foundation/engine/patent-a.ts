// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/patent.js
import type { Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { PATENT, STYLE } from './style.ts';
import { path } from './draw.ts';
import { defsOf } from './svgdefs.ts';
import { at, f3 } from './util.ts';

const C = STYLE.color;

export type PatentShape = string | readonly Point[] | readonly (readonly Point[])[];

export type FigLabelOpts = Loose<{ size: number; anchor: 'start' | 'middle' | 'end'; weight: string | number; valign: 'baseline' | 'middle' | 'top' | 'bottom'; rotate: number }>;

export function figLabel(p: Parent, x: number, y: number, str: string = 'FIG. 1', o: FigLabelOpts = {}): SVGTextElement {
  return text(p, x, y, str, {
    size: o.size ?? PATENT.text.fig, anchor: o.anchor ?? 'middle', valign: o.valign ?? 'baseline', weight: o.weight ?? 'bold', role: 'figlabel', rotate: o.rotate,
  });
}

function isRings(s: readonly Point[] | readonly (readonly Point[])[]): s is readonly (readonly Point[])[] {
  const first = s[0];
  return first !== undefined && typeof first[0] !== 'number';
}

function ringD(r: readonly Point[]): string {
  let d = 'M';
  for (let i = 0; i < r.length; i++) {
    const q = at(r, i);
    d += `${i > 0 ? ' L' : ''}${f3(q[0])},${f3(q[1])}`;
  }
  return `${d}Z`;
}

function ringsD(rings: readonly (readonly Point[])[]): string {
  let d = '';
  for (let i = 0; i < rings.length; i++) d += (i > 0 ? ' ' : '') + ringD(at(rings, i));
  return d;
}

export function shapeD(s: PatentShape): string {
  if (typeof s === 'string') return s;
  if (isRings(s)) return ringsD(s);
  return ringsD([s]);
}

export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxCorners(b: BoxLike): Point[] {
  return [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
}

function lineField(b: BoxLike, angle: number, ts: readonly number[]): string {
  const a = (angle * Math.PI) / 180;
  const u: Point = [Math.cos(a), -Math.sin(a)];
  const n: Point = [Math.sin(a), Math.cos(a)];
  const su: number[] = [];
  for (const [x, y] of boxCorners(b)) su.push(x * u[0] + y * u[1]);
  const s0 = Math.min(...su) - 1;
  const s1 = Math.max(...su) + 1;
  let d = '';
  for (let i = 0; i < ts.length; i++) {
    const t = at(ts, i);
    d += `${i > 0 ? ' ' : ''}M${f3(t * n[0] + s0 * u[0])},${f3(t * n[1] + s0 * u[1])} L${f3(t * n[0] + s1 * u[0])},${f3(t * n[1] + s1 * u[1])}`;
  }
  return d;
}

function normalRange(b: BoxLike, angle: number): Point {
  const a = (angle * Math.PI) / 180;
  const n: Point = [Math.sin(a), Math.cos(a)];
  const tn: number[] = [];
  for (const [x, y] of boxCorners(b)) tn.push(x * n[0] + y * n[1]);
  return [Math.min(...tn), Math.max(...tn)];
}

let cid = 0;

function clipTo(p: Parent, d: string): string {
  cid += 1;
  const id = `pclip${cid}`;
  const c = el(defsOf(p), 'clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
  el(c, 'path', { d, 'clip-rule': 'evenodd' });
  return `url(#${id})`;
}

function bboxOf(p: Parent, d: string): DOMRect {
  const t = path(p, d, {});
  const b = t.getBBox();
  t.remove();
  return b;
}

export type HatchOpts = Loose<{ spacing: number; angle: number; width: number; stroke: string; outline: boolean; outlineWidth: number; fill: string | false; part: string }>;

export function hatchSection(p: Parent, shape: PatentShape, o: HatchOpts = {}): { node: SVGGElement; d: string } {
  const d = shapeD(shape);
  const g = el(p, 'g', { 'data-part': o.part ?? 'hatch-section' });
  if (o.fill !== false) path(g, d, { fill: o.fill ?? '#ffffff', part: 'hatch-fill' }).setAttribute('fill-rule', 'evenodd');
  const b = bboxOf(g, d);
  const angle = o.angle ?? PATENT.hatch.angle;
  const sp = o.spacing ?? PATENT.hatch.spacing;
  const [t0, t1] = normalRange(b, angle);
  const ts: number[] = [];
  for (let t = t0 + sp / 2; t < t1; t += sp) ts.push(t);
  const hg = el(g, 'g', { 'clip-path': clipTo(p, d) });
  path(hg, lineField(b, angle, ts), { stroke: o.stroke ?? C.ink, width: o.width ?? PATENT.hatch.width, cap: 'butt', part: 'hatch-line' });
  if (o.outline !== false) path(g, d, { stroke: o.stroke ?? C.ink, width: o.outlineWidth ?? STYLE.line.normal, part: 'hatch-outline' });
  return { node: g, d };
}

export type SurfaceShadeOpts = Loose<{ angle: number; side: number; extent: number; n: number; power: number; width: number; stroke: string; part: string }>;

export function surfaceShade(p: Parent, shape: PatentShape, o: SurfaceShadeOpts = {}): { node: SVGGElement } {
  const d = shapeD(shape);
  const g = el(p, 'g', { 'data-part': o.part ?? 'surface-shade' });
  const b = bboxOf(g, d);
  const angle = o.angle ?? 90;
  const side = o.side ?? 1;
  const n = o.n ?? 6;
  const pw = o.power ?? 1.8;
  const [t0, t1] = normalRange(b, angle);
  const span = (o.extent ?? 0.35) * (t1 - t0);
  const edge = side > 0 ? t1 : t0;
  const ts: number[] = [];
  for (let k = 0; k < n; k++) ts.push(edge - side * span * Math.pow((k + 0.6) / n, pw));
  const hg = el(g, 'g', { 'clip-path': clipTo(p, d) });
  path(hg, lineField(b, angle, ts), { stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.hair, cap: 'butt', part: 'shade-line' });
  return { node: g };
}
