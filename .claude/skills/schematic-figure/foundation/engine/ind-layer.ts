// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, Loose, Parent, Point, Ports, Rect } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { clipPath, line, path, polygon } from './draw.ts';
import { at, f3 } from './util.ts';
import { C, INK, d, reg } from './ind-base.ts';

export const MATERIALS: Record<string, string> = {
  si: '#8FB8D8', sio2: '#F2B45A', sin: '#9CCB86', poly: '#C98C8C', metal: '#C9CED6', al: '#B8BEC6', au: '#D9A441', cu: '#C77B4A',
  cr: '#7E8791', resist: '#C9A2D9', glass: '#CFE6F3', doped: '#2A3A8C', implant: '#5A6FC4', resistor: '#8C8C8C', polymer: '#E9D8A6',
  electrolyte: '#6CC6E6', aem: '#F2B8B8', cem: '#D8D66E', electrode: '#C3A49C', catalyst: '#8C9194', gdl: '#D9DADB', channel: '#E4E5E6',
  steel: '#C4C8CC', gasket: '#C9352B', water: '#BFE3F2', air: '#FFFFFF',
};

export interface LayerGap {
  a: number;
  b: number;
  taper?: number | undefined;
}

export type LayerSpec = Loose<{
  t: number;
  material: string;
  fill: string;
  label: string;
  labelColor: string;
  labelSize: number;
  name: string;
  gaps: readonly (readonly [number, number] | LayerGap)[];
  from: number;
  to: number;
  z: number;
  overlay: boolean;
  stroke: string;
  width: number;
  hatch: number;
  hatchColor: string;
  hatchWidth: number;
  dash: boolean | readonly number[];
}>;

export interface FrameSpec {
  dash?: readonly number[] | undefined;
  stroke?: string | undefined;
  width?: number | undefined;
}

export type LayerStackOpts = Loose<{
  dir: 'down' | 'right';
  stroke: string;
  width: number;
  r: number;
  frame: boolean | FrameSpec;
  labels: 'inside' | 'side' | 'none';
  labelSize: number;
  family: string;
  F: Figure;
  name: string;
}>;

export interface LayerOut {
  z0: number;
  z1: number;
  box: Rect;
}

export interface LayerStackResult {
  node: SVGGElement;
  layers: LayerOut[];
  ports: Ports;
  box: Rect;
}

interface Stack {
  right: boolean;
  x: number;
  y: number;
}

interface GapSeg {
  a: number;
  b: number;
  taper: number;
}

interface PendingLabel {
  L: LayerSpec;
  bx: Rect;
  z0: number;
  z1: number;
}

function mapPt(st: Stack, s: number, z: number): Point {
  return st.right ? [st.x + z, st.y + s] : [st.x + s, st.y + z];
}

function boxOf(st: Stack, s0: number, s1: number, z0: number, z1: number): Rect {
  const [ax, ay] = mapPt(st, s0, z0);
  const [bx, by] = mapPt(st, s1, z1);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

function roundRectD(b: Rect, rr: number): string {
  return `M${f3(b.x + rr)},${f3(b.y)} H${f3(b.x + b.w - rr)} Q${f3(b.x + b.w)},${f3(b.y)} ${f3(b.x + b.w)},${f3(b.y + rr)} V${f3(b.y + b.h - rr)} Q${f3(b.x + b.w)},${f3(b.y + b.h)} ${f3(b.x + b.w - rr)},${f3(b.y + b.h)} H${f3(b.x + rr)} Q${f3(b.x)},${f3(b.y + b.h)} ${f3(b.x)},${f3(b.y + b.h - rr)} V${f3(b.y + rr)} Q${f3(b.x)},${f3(b.y)} ${f3(b.x + rr)},${f3(b.y)}Z`;
}

function matOf(L: LayerSpec): string {
  const m = L.material;
  return L.fill ?? (m !== undefined ? MATERIALS[m] : undefined) ?? m ?? C.light;
}

function sortedGaps(L: LayerSpec): GapSeg[] {
  const out: GapSeg[] = [];
  for (const q of L.gaps ?? []) {
    const seg: GapSeg = 'a' in q ? { a: q.a, b: q.b, taper: q.taper ?? 0 } : { a: at(q, 0), b: at(q, 1), taper: 0 };
    let j = out.length;
    while (j > 0 && at(out, j - 1).a > seg.a) j -= 1;
    out.splice(j, 0, seg);
  }
  return out;
}

type Seg = readonly [number, number, number, number];

function gapSegments(gaps: readonly GapSeg[], s0: number, s1: number): Seg[] {
  const segs: Seg[] = [];
  let cur = s0;
  let tl = 0;
  for (const q of gaps) {
    if (q.a > cur) segs.push([cur, q.a, tl, q.taper]);
    cur = Math.max(cur, q.b);
    tl = q.taper;
  }
  if (cur < s1) segs.push([cur, s1, tl, 0]);
  return segs;
}

function drawHatch(g: Parent, p: Parent, polys: readonly (readonly Point[])[], bx: Rect, L: LayerSpec, fill: string, sp: number): void {
  let clip = '';
  for (let i = 0; i < polys.length; i++) clip += (i > 0 ? ' ' : '') + d(at(polys, i)) + 'Z';
  const hg = el(g, 'g', { 'clip-path': clipPath(p, clip) });
  const hc = L.hatchColor ?? shade(fill === 'none' || !fill.startsWith('#') ? '#888888' : fill, -0.3);
  const hw = L.hatchWidth ?? STYLE.line.thin;
  for (let k = -bx.h; k < bx.w + bx.h; k += sp) {
    line(hg, [bx.x + k, bx.y], [bx.x + k + bx.h, bx.y + bx.h], { stroke: hc, width: hw, cap: 'butt' });
    line(hg, [bx.x + k, bx.y + bx.h], [bx.x + k + bx.h, bx.y], { stroke: hc, width: hw, cap: 'butt' });
  }
}

interface Ctx {
  p: Parent;
  top: SVGGElement;
  g: Parent;
  st: Stack;
  o: LayerStackOpts;
  width: number;
}

function drawDashed(c: Ctx, L: LayerSpec, s0: number, s1: number, z0: number): LayerOut {
  const dash = L.dash === true ? [2, 1.3] : L.dash === false ? undefined : L.dash;
  line(c.g, mapPt(c.st, s0, z0), mapPt(c.st, s1, z0), { stroke: L.stroke ?? INK, width: L.width ?? c.width * 1.4, dash, cap: 'butt' });
  return { z0, z1: z0, box: boxOf(c.st, s0, s1, z0, z0) };
}

function drawBand(c: Ctx, L: LayerSpec, w: number, z0: number, z1: number, labelQ: PendingLabel[]): LayerOut {
  const s0 = L.from ?? 0;
  const s1 = L.to ?? w;
  const fill = matOf(L);
  const segs = gapSegments(sortedGaps(L), s0, s1);
  const polys: Point[][] = [];
  for (const [a, b, tl2, tr] of segs) polys.push([mapPt(c.st, a, z0), mapPt(c.st, b, z0), mapPt(c.st, b + tr, z1), mapPt(c.st, a - tl2, z1)]);
  if (fill !== 'none') for (const q of polys) polygon(c.g, q, { fill, stroke: L.stroke ?? c.o.stroke, width: c.width, join: 'miter', part: 'layer' });
  const bx = boxOf(c.st, s0, s1, z0, z1);
  if (L.hatch !== undefined && L.hatch !== 0 && polys.length > 0) drawHatch(c.g, c.p, polys, bx, L, fill, L.hatch);
  if (L.label !== undefined && L.label !== '' && (c.o.labels ?? 'inside') !== 'none') labelQ.push({ L, bx, z0, z1 });
  if (c.o.F !== undefined && c.o.name !== undefined && c.o.name !== '' && L.name !== undefined && L.name !== '') c.o.F.anchor(`${c.o.name}.${L.name}`, c.top, bx.x + bx.w / 2, bx.y + bx.h / 2);
  return { z0, z1, box: bx };
}

function drawLabels(c: Ctx, labelQ: readonly PendingLabel[], w: number): void {
  const mode = c.o.labels ?? 'inside';
  for (const { L, bx, z0, z1 } of labelQ) {
    const size = L.labelSize ?? c.o.labelSize ?? STYLE.text.small;
    const side = mode === 'side';
    const right = c.st.right;
    const pos: Point = side ? mapPt(c.st, w + size * 0.6, (z0 + z1) / 2) : [bx.x + bx.w / 2, bx.y + bx.h / 2];
    text(c.top, pos[0], pos[1], L.label ?? '', {
      size, anchor: side && !right ? 'start' : 'middle', valign: side && right ? 'top' : 'middle',
      color: L.labelColor ?? C.text, rotate: !side && right ? -90 : undefined, family: c.o.family,
    });
  }
}

export function layerStack(p: Parent, x: number, y: number, w: number, layers: readonly LayerSpec[], o: LayerStackOpts = {}): LayerStackResult {
  const st: Stack = { right: (o.dir ?? 'down') === 'right', x, y };
  let zrun = 0;
  const Z: Point[] = [];
  for (const L of layers) {
    const z0 = L.z ?? zrun;
    const z1 = z0 + (L.t ?? 0);
    if (L.overlay !== true) zrun = Math.max(zrun, z1);
    Z.push([z0, z1]);
  }
  const outer = boxOf(st, 0, w, 0, zrun);
  const rr = o.r ?? 0;
  const top = el(p, 'g', { 'data-part': 'layer-stack' });
  const g = rr !== 0 ? el(top, 'g', { 'clip-path': clipPath(p, roundRectD(outer, rr)) }) : top;
  const c: Ctx = { p, top, g, st, o, width: o.width ?? STYLE.line.thin };
  const out: LayerOut[] = [];
  const labelQ: PendingLabel[] = [];
  for (let i = 0; i < layers.length; i++) {
    const L = at(layers, i);
    const [z0, z1] = at(Z, i);
    out.push(L.dash !== undefined && L.dash !== false ? drawDashed(c, L, L.from ?? 0, L.to ?? w, z0) : drawBand(c, L, w, z0, z1, labelQ));
  }
  if (o.frame !== undefined && o.frame !== false) {
    const f: FrameSpec = o.frame === true ? {} : o.frame;
    path(top, roundRectD(outer, rr), { stroke: f.stroke ?? INK, width: f.width ?? STYLE.line.thin * 1.4, dash: f.dash ?? [1.8, 1.2] });
  }
  drawLabels(c, labelQ, w);
  const ports = reg(o.F, o.name, top, { top: [outer.x + outer.w / 2, outer.y], bottom: [outer.x + outer.w / 2, outer.y + outer.h], left: [outer.x, outer.y + outer.h / 2], right: [outer.x + outer.w, outer.y + outer.h / 2], center: [outer.x + outer.w / 2, outer.y + outer.h / 2] });
  return { node: top, layers: out, ports, box: outer };
}
