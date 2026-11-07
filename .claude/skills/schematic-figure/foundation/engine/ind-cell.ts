// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, polygon, radialGradient, rect } from './draw.ts';
import { at, unit } from './util.ts';
import { C, INK, PAPER, insideText, reg } from './ind-base.ts';
import type { Part } from './ind-base.ts';
import { MATERIALS } from './ind-layer.ts';

export type BatteryOpts = Loose<{
  vertical: boolean; cells: number; gap: number; long: number; short: number; longWidth: number; shortWidth: number;
  lead: number; color: string; width: number; F: Figure; name: string;
}>;

function bm(vertical: boolean, cx: number, cy: number, u: number, v: number): Point {
  return vertical ? [cx + v, cy + u] : [cx + u, cy + v];
}

export function battery(p: Parent, cx: number, cy: number, o: BatteryOpts = {}): Part {
  const cells = o.cells ?? 1;
  const gap = o.gap ?? 1.6;
  const Lg = o.long ?? 7;
  const Sh = o.short ?? Lg * 0.55;
  const color = o.color ?? INK;
  const lw = o.longWidth ?? o.width ?? STYLE.line.normal;
  const sw = o.shortWidth ?? (o.width ?? STYLE.line.normal) * 2;
  const lead = o.lead ?? 0;
  const v = o.vertical === true;
  const g = el(p, 'g', { 'data-part': 'battery' });
  const span = (2 * cells - 1) * gap;
  for (let i = 0; i < cells; i++) {
    const u = -span / 2 + 2 * i * gap;
    line(g, bm(v, cx, cy, u, -Lg / 2), bm(v, cx, cy, u, Lg / 2), { stroke: color, width: lw, cap: 'butt' });
    line(g, bm(v, cx, cy, u + gap, -Sh / 2), bm(v, cx, cy, u + gap, Sh / 2), { stroke: color, width: sw, cap: 'butt' });
  }
  const e0 = -span / 2 - lead;
  const e1 = span / 2 + lead;
  if (lead !== 0) {
    line(g, bm(v, cx, cy, e0, 0), bm(v, cx, cy, -span / 2, 0), { stroke: color, width: lw, cap: 'butt' });
    line(g, bm(v, cx, cy, span / 2, 0), bm(v, cx, cy, e1, 0), { stroke: color, width: lw, cap: 'butt' });
  }
  const ports = reg(o.F, o.name, g, { [v ? 'top' : 'left']: bm(v, cx, cy, e0, 0), [v ? 'bottom' : 'right']: bm(v, cx, cy, e1, 0), plus: bm(v, cx, cy, -span / 2, -Lg / 2), minus: bm(v, cx, cy, span / 2, -Sh / 2), center: [cx, cy] });
  return { node: g, ports };
}

export type IonOpts = Loose<{
  r: number; fill: string; color: string; label: string; size: number; stroke: string; width: number; shaded: boolean; family: string;
}>;

export function ion(p: Parent, cx: number, cy: number, sign: number = 1, o: IonOpts = {}): SVGGElement {
  const r = o.r ?? 3;
  const base = o.fill ?? (sign > 0 ? C.green : sign < 0 ? C.vermillion : C.mid);
  const g = el(p, 'g', { 'data-part': 'ion' });
  const fill = o.shaded === true ? radialGradient(g, [[0, shade(base, 0.35)], [1, shade(base, -0.12)]], { cx: 0.38, cy: 0.35, r: 0.7 }) : base;
  circle(g, cx, cy, r, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.thin });
  const col = o.color ?? PAPER;
  if (o.label !== undefined && o.label !== '') {
    insideText(text(g, cx, cy, o.label, { size: o.size ?? STYLE.text.small, anchor: 'middle', valign: 'middle', color: col, weight: 'bold', family: o.family }), base);
  } else if (sign !== 0) {
    const a = r * 0.46;
    const w = r * 0.3;
    line(g, [cx - a, cy], [cx + a, cy], { stroke: col, width: w, cap: 'butt' });
    if (sign > 0) line(g, [cx, cy - a], [cx, cy + a], { stroke: col, width: w, cap: 'butt' });
  }
  return g;
}

export type BadgeOpts = Loose<{
  r: number; fill: string; shaded: boolean; color: string; size: number; weight: string | number; stroke: string; width: number; family: string;
}>;

export function badge(p: Parent, cx: number, cy: number, str: string | number, o: BadgeOpts = {}): SVGGElement {
  const r = o.r ?? 4;
  const base = o.fill ?? '#b9bec1';
  const g = el(p, 'g', { 'data-part': 'badge' });
  const fill = (o.shaded ?? true) ? radialGradient(g, [[0, shade(base, 0.3)], [1, base]], { cx: 0.4, cy: 0.35, r: 0.7 }) : base;
  circle(g, cx, cy, r, { fill, stroke: o.stroke, width: o.width ?? STYLE.line.thin });
  insideText(text(g, cx, cy, String(str), { size: o.size ?? Math.max(STYLE.text.min, r * 1.3), anchor: 'middle', valign: 'middle', color: o.color ?? C.text, weight: o.weight, family: o.family }), base);
  return g;
}

export type KeyItem = readonly [string, string] | { fill?: string | undefined; material?: string | undefined; label: string };

export type MaterialKeyOpts = Loose<{
  cols: number; colW: number; rowH: number; sw: number; sh: number; size: number; stroke: string; family: string;
}>;

function keyParts(it: KeyItem): [string | undefined, string] {
  if ('label' in it) return [it.fill ?? it.material, it.label];
  return [at(it, 0), at(it, 1)];
}

export function materialKey(p: Parent, x: number, y: number, items: readonly KeyItem[], o: MaterialKeyOpts = {}): SVGGElement {
  const cols = o.cols ?? 1;
  const size = o.size ?? STYLE.text.small;
  const sw = o.sw ?? size * 1.6;
  const sh = o.sh ?? size * 0.8;
  const rowH = o.rowH ?? size * 1.5;
  const colW = o.colW ?? sw + size * 9;
  const g = el(p, 'g', { 'data-part': 'material-key' });
  const per = Math.ceil(items.length / cols);
  for (let i = 0; i < items.length; i++) {
    const [f, label] = keyParts(at(items, i));
    const fill = (f !== undefined ? MATERIALS[f] : undefined) ?? f;
    const cx = x + Math.floor(i / per) * colW;
    const cy = y + (i % per) * rowH;
    rect(g, cx, cy - sh / 2, sw, sh, { fill, stroke: o.stroke, width: STYLE.line.thin });
    text(g, cx + sw + size * 0.5, cy, label, { size, valign: 'middle', family: o.family });
  }
  return g;
}

export type SectionMarkOpts = Loose<{
  label: string; labels: readonly string[]; side: 1 | -1; color: string; textColor: string; dash: readonly number[];
  width: number; arrowLen: number; size: number; family: string;
}>;

export function sectionMark(p: Parent, a: Point, b: Point, o: SectionMarkOpts = {}): SVGGElement {
  const [x0, y0] = a;
  const [x1, y1] = b;
  const color = o.color ?? C.vermillion;
  const size = o.size ?? STYLE.text.label;
  const [ux, uy] = unit(x1 - x0, y1 - y0);
  const sd = o.side ?? 1;
  const nx = uy * sd;
  const ny = -ux * sd;
  const A = o.arrowLen ?? size * 1.2;
  const hw = A * 0.3;
  const sw = A * 0.11;
  const g = el(p, 'g', { 'data-part': 'section-mark' });
  line(g, [x0, y0], [x1, y1], { stroke: color, width: o.width ?? STYLE.line.hair * 1.4, dash: o.dash ?? [2, 1.2], cap: 'butt' });
  const labels = o.labels ?? [o.label ?? 'A', o.label ?? 'A'];
  const ends: readonly (readonly [number, number, number])[] = [[x0, y0, -1], [x1, y1, 1]];
  for (let i = 0; i < 2; i++) {
    const [px, py, s] = at(ends, i);
    const bx = px - s * ux * hw * 1.6;
    const by = py - s * uy * hw * 1.6;
    const tip: Point = [bx + nx * 0.4, by + ny * 0.4];
    const tail: Point = [bx - nx * A, by - ny * A];
    const hb: Point = [tip[0] - nx * A * 0.42, tip[1] - ny * A * 0.42];
    polygon(g, [[tail[0] + ux * sw, tail[1] + uy * sw], [hb[0] + ux * sw, hb[1] + uy * sw], [hb[0] + ux * hw, hb[1] + uy * hw], tip,
      [hb[0] - ux * hw, hb[1] - uy * hw], [hb[0] - ux * sw, hb[1] - uy * sw], [tail[0] - ux * sw, tail[1] - uy * sw]], { fill: color, part: 'arrowhead' });
    const k = hw + size * 0.55;
    text(g, bx + s * ux * k - nx * A * 0.5, by + s * uy * k - ny * A * 0.5, at(labels, i), { size, anchor: 'middle', valign: 'middle', family: o.family, color: o.textColor ?? C.text });
  }
  return g;
}
