// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, polygon, rect } from './draw.ts';
import { f3, unit } from './util.ts';
import { C, DIRS, INK, PAPER, d, reg, wrap } from './ind-base.ts';
import type { Dir, Part } from './ind-base.ts';

export type RotaryFeederOpts = Loose<{
  r: number; vanes: number; hub: number; phase: number; vaneWidth: number; rot: number;
  stroke: string; width: number; fill: string; F: Figure; name: string;
}>;

export function rotaryFeeder(p: Parent, cx: number, cy: number, o: RotaryFeederOpts = {}): Part {
  const r = o.r ?? 5;
  const n = o.vanes ?? 8;
  const hub = o.hub ?? r * 0.3;
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const g = wrap(p, 'rotary-feeder', o.rot, cx, cy);
  const a0 = ((o.phase ?? 0) * Math.PI) / 180;
  circle(g, cx, cy, r, { fill: o.fill ?? PAPER, stroke, width });
  for (let i = 0; i < n; i++) {
    const t = a0 + (i / n) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    line(g, [cx + c * hub, cy + s * hub], [cx + c * r, cy + s * r], { stroke, width: o.vaneWidth ?? width * 0.7, cap: 'butt' });
  }
  circle(g, cx, cy, hub, { fill: o.fill ?? PAPER, stroke, width: width * 0.8 });
  const q = r * Math.SQRT1_2;
  const ports = reg(o.F, o.name, g, { top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy], outL: [cx - q, cy + q], outR: [cx + q, cy + q], center: [cx, cy] });
  return { node: g, ports };
}

export type InlineFilterOpts = Loose<{
  len: number; halfH: number; gap: number; mediumExt: number; mediumFill: string; rot: number;
  stroke: string; width: number; fill: string; F: Figure; name: string;
}>;

export function inlineFilter(p: Parent, cx: number, cy: number, o: InlineFilterOpts = {}): Part {
  const len = o.len ?? 24;
  const hh = o.halfH ?? len * 0.42;
  const gap = o.gap ?? len * 0.07;
  const ext = o.mediumExt ?? hh * 0.1;
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const g = wrap(p, 'inline-filter', o.rot, cx, cy);
  const xl = cx - len / 2;
  const xr = cx + len / 2;
  const a = cx - gap / 2;
  const b = cx + gap / 2;
  polygon(g, [[a, cy - hh], [xl, cy], [a, cy + hh]], { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
  polygon(g, [[b, cy - hh], [xr, cy], [b, cy + hh]], { fill: o.fill ?? PAPER, stroke, width, join: 'miter' });
  rect(g, a, cy - hh - ext, gap, 2 * (hh + ext), { fill: o.mediumFill ?? C.light });
  for (const x of [a, b]) line(g, [x, cy - hh - ext], [x, cy + hh + ext], { stroke, width, cap: 'butt' });
  const ports = reg(o.F, o.name, g, { in: [xl, cy], out: [xr, cy], top: [cx, cy - hh - ext], bottom: [cx, cy + hh + ext], center: [cx, cy] });
  return { node: g, ports };
}

export type StreamArrowOpts = Loose<{
  shaftW: number; headW: number; headL: number; fill: string; stroke: string; width: number; F: Figure; name: string;
}>;

export function streamArrow(p: Parent, from: Point, to: Point, o: StreamArrowOpts = {}): Part {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const [ux, uy] = unit(x1 - x0, y1 - y0);
  const nx = -uy;
  const ny = ux;
  const H = o.headL ?? 4.5;
  const a = (o.shaftW ?? 4) / 2;
  const b = (o.headW ?? 9) / 2;
  const hx = x1 - ux * H;
  const hy = y1 - uy * H;
  const g = polygon(p, [[x0 + nx * a, y0 + ny * a], [hx + nx * a, hy + ny * a], [hx + nx * b, hy + ny * b], [x1, y1], [hx - nx * b, hy - ny * b], [hx - nx * a, hy - ny * a], [x0 - nx * a, y0 - ny * a]],
    { fill: o.fill ?? PAPER, stroke: o.stroke ?? INK, width: o.width ?? STYLE.line.normal * 1.2, join: 'miter', part: 'stream-arrow' });
  const ports = reg(o.F, o.name, p, { tail: [x0, y0], tip: [x1, y1] });
  return { node: g, ports };
}

export type FlowLabelOpts = Loose<{
  dir: Dir; arrowLen: number; gap: number; head: number; size: number; rotate: number; arrowDy: number;
  family: string; color: string; stroke: string; width: number;
}>;

function moveText(tx: SVGTextElement, x: number): void {
  tx.setAttribute('x', String(f3(x)));
  for (const s of tx.querySelectorAll('tspan[x]')) s.setAttribute('x', String(f3(x)));
}

export function flowLabel(p: Parent, x: number, y: number, str: string, o: FlowLabelOpts = {}): SVGGElement {
  const dir = o.dir ?? 'right';
  const vert = dir === 'up' || dir === 'down';
  const rot = o.rotate ?? (vert ? -90 : 0);
  const pv = DIRS[dir];
  const t = (-rot * Math.PI) / 180;
  const fwd = pv[0] * Math.cos(t) - pv[1] * Math.sin(t) >= 0;
  const g = el(p, 'g', { 'data-part': 'flow-label', transform: `translate(${f3(x)} ${f3(y)})${rot !== 0 ? ` rotate(${rot})` : ''}` });
  const size = o.size ?? STYLE.text.small;
  const A = o.arrowLen ?? size * 2.6;
  const gap = o.gap ?? size * 0.35;
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.thin;
  const tx = text(g, 0, 0, str, { size, anchor: 'start', valign: 'middle', family: o.family, color: o.color });
  const tw = tx.getBBox().width;
  const x0 = -(tw + gap + A) / 2;
  const ay = o.arrowDy ?? size * 0.02;
  const H = o.head ?? size * 0.55;
  let a0: number;
  let a1: number;
  if (fwd) {
    moveText(tx, x0);
    a0 = x0 + tw + gap;
    a1 = a0 + A;
  } else {
    moveText(tx, x0 + A + gap);
    a0 = x0 + A;
    a1 = x0;
  }
  const s = Math.sign(a1 - a0);
  line(g, [a0, ay], [a1, ay], { stroke, width, cap: 'butt' });
  path(g, d([[a1 - s * H, ay - H * 0.5], [a1, ay], [a1 - s * H, ay + H * 0.5]]), { stroke, width, join: 'miter', cap: 'butt' });
  return g;
}

export type PumpKind = 'centrifugal' | 'plain' | 'arrow';

export type PumpOpts = Loose<{
  r: number; kind: PumpKind; foot: boolean; dir: Dir; nozzleL: number; rot: number;
  stroke: string; width: number; fill: string; F: Figure; name: string;
}>;

export function pump(p: Parent, cx: number, cy: number, o: PumpOpts = {}): Part {
  const r = o.r ?? 5;
  const kind = o.kind ?? 'centrifugal';
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const fill = o.fill ?? PAPER;
  const g = wrap(p, 'pump', o.rot, cx, cy);
  const [dx, dy] = DIRS[o.dir ?? 'right'];
  const sx = dx === 0 ? 1 : dx;
  let bottom: Point = [cx, cy + r];
  if (o.foot ?? true) {
    const ft = r * 0.62;
    const fb = r * 1.4;
    const a = r * 0.55;
    const b = r * 0.95;
    polygon(g, [[cx - a, cy + ft], [cx + a, cy + ft], [cx + b, cy + fb], [cx - b, cy + fb]], { fill, stroke, width, join: 'miter' });
    bottom = [cx, cy + fb];
  }
  circle(g, cx, cy, r, { fill, stroke, width });
  let out: Point = [cx + dx * r, cy + dy * r];
  if (kind === 'centrifugal') {
    const nw = r * 0.42;
    const nl = o.nozzleL ?? r * 1.3;
    const xc = Math.sqrt(r * r - (r - nw) * (r - nw));
    path(g, d([[cx, cy - r], [cx + sx * nl, cy - r], [cx + sx * nl, cy - r + nw], [cx + sx * xc, cy - r + nw]]), { fill, stroke, width, join: 'miter' });
    out = [cx + sx * nl, cy - r + nw / 2];
  } else if (kind === 'arrow') {
    const nx = -dy;
    const ny = dx;
    const t = r * 0.62;
    polygon(g, [[cx + dx * t, cy + dy * t], [cx - dx * t * 0.6 + nx * t * 0.8, cy - dy * t * 0.6 + ny * t * 0.8], [cx - dx * t * 0.6 - nx * t * 0.8, cy - dy * t * 0.6 - ny * t * 0.8]], { fill: stroke });
  }
  const ports = reg(o.F, o.name, g, { in: [cx - dx * r, cy - dy * r], out, top: [cx, cy - r], bottom, center: [cx, cy] });
  return { node: g, ports };
}

export type CompressorKind = 'compressor' | 'turbine' | 'fan';

export type CompressorOpts = Loose<{
  r: number; dir: 'right' | 'left'; kind: CompressorKind; rot: number;
  stroke: string; width: number; fill: string; F: Figure; name: string;
}>;

function fanBlades(g: Parent, cx: number, cy: number, r: number, stroke: string): void {
  for (let i = 0; i < 3; i++) {
    const t = (i * 2 * Math.PI) / 3 - Math.PI / 2;
    const q = r * 0.8;
    const c = Math.cos(t);
    const si = Math.sin(t);
    const c2 = Math.cos(t + 0.55);
    const s2 = Math.sin(t + 0.55);
    path(g, `M${f3(cx)},${f3(cy)} L${f3(cx + q * c)},${f3(cy + q * si)} Q${f3(cx + q * 0.95 * c2)},${f3(cy + q * 0.95 * s2)} ${f3(cx + q * 0.55 * Math.cos(t + 0.75))},${f3(cy + q * 0.55 * Math.sin(t + 0.75))}Z`, { fill: stroke });
  }
}

function chords(g: Parent, cx: number, cy: number, r: number, s: number, kind: CompressorKind, stroke: string, width: number): void {
  const wide: Point = [-Math.cos((50 * Math.PI) / 180) * r, Math.sin((50 * Math.PI) / 180) * r];
  const nar: Point = [Math.cos((20 * Math.PI) / 180) * r, Math.sin((20 * Math.PI) / 180) * r];
  const A: Point = kind === 'turbine' ? [-nar[0], nar[1]] : wide;
  const B: Point = kind === 'turbine' ? [-wide[0], wide[1]] : nar;
  for (const k of [-1, 1]) line(g, [cx + s * A[0], cy + k * A[1]], [cx + s * B[0], cy + k * B[1]], { stroke, width, cap: 'butt' });
}

export function compressor(p: Parent, cx: number, cy: number, o: CompressorOpts = {}): Part {
  const r = o.r ?? 6;
  const kind = o.kind ?? 'compressor';
  const stroke = o.stroke ?? INK;
  const width = o.width ?? STYLE.line.normal * 1.2;
  const g = wrap(p, kind, o.rot, cx, cy);
  const s = (o.dir ?? 'right') === 'left' ? -1 : 1;
  circle(g, cx, cy, r, { fill: o.fill ?? PAPER, stroke, width });
  if (kind === 'fan') fanBlades(g, cx, cy, r, stroke);
  else chords(g, cx, cy, r, s, kind, stroke, width);
  const ports = reg(o.F, o.name, g, { in: [cx - s * r, cy], out: [cx + s * r, cy], top: [cx, cy - r], bottom: [cx, cy + r], center: [cx, cy] });
  return { node: g, ports };
}
