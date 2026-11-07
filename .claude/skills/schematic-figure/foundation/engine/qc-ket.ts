// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Loose, Paint, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, rect } from './draw.ts';
import { at } from './util.ts';
import { C, mathFont, w0 } from './qc-base.ts';

export type KetOpts = Loose<{
  size: number;
  h: number;
  width: number;
  family: string;
  color: string;
  weight: string | number;
  anchor: 'start' | 'middle' | 'end';
  bra: boolean;
}>;

interface KetGeo {
  size: number;
  h: number;
  bw: number;
  gap: number;
  w: number;
}

function ketGeom(o: KetOpts): KetGeo {
  const size = o.size ?? STYLE.text.label + 1;
  return { size, h: o.h ?? size * 0.9, bw: size * 0.24, gap: size * 0.1, w: o.width ?? Math.max(STYLE.line.thin, size * 0.055) };
}

function measure(p: Parent, s: string, size: number, family: string): number {
  const t = text(p, 0, 0, s, { size, family });
  const w = t.getBBox().width;
  t.remove();
  return w;
}

function ketStrokes(g: SVGGElement, xl: number, xr: number, y: number, k: KetGeo, color: string): void {
  const st: Paint = { stroke: color, width: k.w, cap: 'butt', join: 'miter' };
  line(g, [xl, y - k.h / 2], [xl, y + k.h / 2], st);
  path(g, `M${xr - k.bw},${y - k.h / 2} L${xr},${y} L${xr - k.bw},${y + k.h / 2}`, st);
}

export function ket(p: Parent, x: number, y: number, s: string, o: KetOpts = {}): { node: SVGGElement; x0: number; x1: number } {
  const k = ketGeom(o);
  const fam = o.family ?? mathFont();
  const color = o.color ?? C.text;
  const tw = measure(p, s, k.size, fam);
  const W = k.gap * 2 + tw + k.bw + k.gap;
  const x0 = (o.anchor ?? 'end') === 'end' ? x - W : o.anchor === 'middle' ? x - W / 2 : x;
  const g = el(p, 'g', { 'data-part': 'ket' });
  if (o.bra === true) {
    const st: Paint = { stroke: color, width: k.w, cap: 'butt', join: 'miter' };
    path(g, `M${x0 + k.bw},${y - k.h / 2} L${x0},${y} L${x0 + k.bw},${y + k.h / 2}`, st);
    line(g, [x0 + W, y - k.h / 2], [x0 + W, y + k.h / 2], st);
    text(g, x0 + k.bw + k.gap, y + k.size * 0.33, s, { size: k.size, family: fam, color, weight: o.weight });
  } else {
    ketStrokes(g, x0, x0 + W, y, k, color);
    text(g, x0 + k.gap * 1.5, y + k.size * 0.33, s, { size: k.size, family: fam, color, weight: o.weight });
  }
  return { node: g, x0, x1: x0 + W };
}

function isEven(ys: readonly number[], pitch: number): boolean {
  if (pitch <= 0) return false;
  for (let i = 0; i < ys.length; i++) {
    if (!(Math.abs(at(ys, i) - (at(ys, 0) + i * pitch)) < 1e-3)) return false;
  }
  return true;
}

export function ketColumn(p: Parent, x: number, ys: readonly number[], states: string | readonly string[], o: KetOpts = {}): SVGGElement {
  const k = ketGeom(o);
  const fam = o.family ?? mathFont();
  const color = o.color ?? C.text;
  const anchor = o.anchor ?? 'end';
  const S: string[] = [];
  for (let i = 0; i < ys.length; i++) S.push(typeof states === 'string' ? states : at(states, i));
  const g = el(p, 'g', { 'data-part': 'ket-column' });
  const tws: number[] = [];
  for (const s of S) tws.push(measure(p, s, k.size, fam));
  const pitch = ys.length > 1 ? (at(ys, ys.length - 1) - at(ys, 0)) / (ys.length - 1) : 0;
  const even = isEven(ys, pitch);
  const tx: number[] = [];
  for (let i = 0; i < ys.length; i++) {
    const W = k.gap * 2.5 + at(tws, i) + k.bw;
    const x0 = anchor === 'end' ? x - W : anchor === 'middle' ? x - W / 2 : x;
    ketStrokes(g, x0, x0 + W, at(ys, i), k, color);
    tx.push(x0 + k.gap * 1.5);
  }
  if (even && anchor === 'end') {
    const xe = x - k.bw - k.gap;
    text(g, xe, at(ys, 0) + k.size * 0.33, S.join('\n'), { size: k.size, family: fam, color, anchor: 'end', lineGap: pitch / k.size, weight: o.weight });
  } else if (even && anchor === 'start') {
    text(g, x + k.gap * 1.5, at(ys, 0) + k.size * 0.33, S.join('\n'), { size: k.size, family: fam, color, lineGap: pitch / k.size, weight: o.weight });
  } else {
    for (let i = 0; i < ys.length; i++) text(g, at(tx, i), at(ys, i) + k.size * 0.33, at(S, i), { size: k.size, family: fam, color, weight: o.weight });
  }
  return g;
}

export type BadgeOpts = Loose<{
  shape: 'square' | 'circle' | 'round';
  s: number;
  r: number;
  width: number;
  size: number;
  family: string;
  weight: string | number;
  fill: string;
  textColor: string;
  solid: boolean;
  stack: number;
  offset: Point;
}>;

export function badge(p: Parent, cx: number, cy: number, letter: string, color: string = C.blue, o: BadgeOpts = {}): SVGGElement {
  const s = o.s ?? 7;
  const w = o.width ?? w0();
  const shape = o.shape ?? 'square';
  const g = el(p, 'g', { 'data-part': 'badge' });
  const n = o.stack ?? 1;
  const [ox, oy] = o.offset ?? [s * 0.18, s * 0.18];
  const solid = o.solid === true;
  for (let i = n - 1; i >= 0; i--) {
    const x = cx + i * ox;
    const y = cy + i * oy;
    const fill = solid ? color : (o.fill ?? (n > 1 ? '#fff' : 'none'));
    const st: Paint = solid ? { fill, stroke: 'none' } : { stroke: color, width: w, fill };
    if (shape === 'circle') circle(g, x, y, s / 2, st);
    else rect(g, x - s / 2, y - s / 2, s, s, { ...st, join: 'miter', r: shape === 'round' ? (o.r ?? s * 0.25) : o.r });
  }
  if (letter !== '') {
    text(g, cx, cy, letter, { anchor: 'middle', valign: 'middle', size: o.size ?? s * 0.66, color: o.textColor ?? (solid ? '#fff' : color), family: o.family ?? STYLE.font.family, weight: o.weight });
  }
  return g;
}

export type SlantOpts = { top: number; bottom: number; xTopL: number } & Loose<{
  part: string;
  xTopR: number;
  xBotL: number;
  xBotR: number;
  band: number;
  yKneeTop: number;
  yKneeBot: number;
  stroke: string;
  width: number;
  dash: string;
  fill: string;
  fillOpacity: number;
  label: string;
  labelAt: Point;
  labelColor: string;
  labelRotate: number;
  size: number;
  italic: boolean;
}>;

export function slantFrame(p: Parent, o: SlantOpts): { node: SVGGElement; d: string } {
  const { top, bottom, xTopL } = o;
  const xBotL = o.xBotL ?? xTopL;
  const xTopR = o.xTopR ?? xTopL + (o.band ?? 10);
  const xBotR = o.xBotR ?? (o.band !== undefined ? xBotL + o.band : xTopR);
  const k1 = o.yKneeTop ?? top + (bottom - top) / 3;
  const k2 = o.yKneeBot ?? top + ((bottom - top) * 2) / 3;
  const P: Point[] = [[xTopL, top], [xTopR, top], [xTopR, k1], [xBotR, k2], [xBotR, bottom], [xBotL, bottom], [xBotL, k2], [xTopL, k1]];
  const g = el(p, 'g', { 'data-part': o.part ?? 'slant-frame' });
  const parts: string[] = [];
  for (const [a, b] of P) parts.push(`${a.toFixed(3)},${b.toFixed(3)}`);
  const d = `M${parts.join(' L')}Z`;
  path(g, d, { fill: o.fill ?? 'none', fillOpacity: o.fillOpacity, stroke: o.stroke ?? C.blue, width: o.width ?? w0(), dash: o.dash, join: 'miter' });
  if (o.label !== undefined && o.label !== '') {
    const [lx, ly] = o.labelAt ?? [(xTopL + xTopR) / 2, top - 1.5];
    const rot = o.labelRotate !== undefined && o.labelRotate !== 0;
    text(g, lx, ly, o.label, { anchor: 'middle', valign: rot ? 'middle' : 'bottom', size: o.size ?? STYLE.text.label, color: o.labelColor ?? o.stroke ?? C.blue, italic: o.italic, rotate: o.labelRotate });
  }
  return { node: g, d };
}
