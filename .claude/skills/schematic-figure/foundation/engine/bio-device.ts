// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Dash, Handle, Loose, Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, clipPath, ellipse, line, linearGradient, path, polygon, rect } from './draw.ts';
import { f3 } from './util.ts';
import type { Part, Reg } from './bio-util.ts';
import { BIO, ellD, floorOf, fw, pol, reg, rounded } from './bio-util.ts';
import { cell } from './bio-cell.ts';
import type { CellOpts } from './bio-cell.ts';

const C = STYLE.color;

export type SyringeOpts = Reg &
  Loose<{ aspect: number; stroke: string; color: string; level: number; fill: string; ticks: number; bevel: boolean }>;

interface SyringeCtx {
  g: Handle;
  k: number;
  w: number;
  st: string;
  sw: number;
  K: number;
  b0: number;
  b1: number;
}

function syringeBarrel(c: SyringeCtx, o: SyringeOpts, lv: number): number {
  const { g, k, w, st, sw, K, b0, b1 } = c;
  rect(g, b0, -w / 2, b1 - b0, w, { fill: o.color ?? '#eef1f6', stroke: st, width: sw, r: w * 0.08 });
  if (lv > 0) rect(g, b0 + sw, -w / 2 + sw, (b1 - b0 - 2 * sw) * lv, w - 2 * sw, { fill: o.fill ?? BIO.liquid });
  const pl = b0 + (b1 - b0) * lv;
  rect(g, pl, -w / 2 + sw, 0.03 * k, w - 2 * sw, { fill: shade(st, -0.25) });
  line(g, [b0 + 0.02 * k, -w * 0.28], [b1 - 0.04 * k, -w * 0.28], { stroke: '#fff', width: fw(K, w * 0.12), opacity: 0.7 });
  const nt = o.ticks ?? 8;
  for (let i = 1; i <= nt; i++) {
    const x = b0 + ((b1 - b0) * i) / (nt + 1);
    line(g, [x, w / 2], [x, w / 2 - (i % 2 !== 0 ? 0.22 : 0.4) * w], { stroke: st, width: fw(K, STYLE.line.hair) });
  }
  return pl;
}

export function syringe(p: Parent, tip: Point, angle: number, len: number, o: SyringeOpts = {}): Part {
  const K = floorOf(p);
  const k = len;
  const w = (o.aspect ?? 0.1) * k;
  const st = o.stroke ?? BIO.outline;
  const g = group(p, { x: tip[0], y: tip[1], rotate: angle, part: o.part ?? 'syringe' });
  const sw = fw(K, Math.max(0.01 * k, STYLE.line.thin));
  const nd = Math.max(0.012 * k, 0.5);
  const bev = o.bevel !== false ? 0.03 * k : 0;
  const needle: Point[] = [[0, nd * (bev !== 0 ? -0.2 : 1)], [bev, -nd], [0.3 * k, -nd], [0.3 * k, nd], [0, nd]];
  polygon(g, needle, { fill: shade(C.metal, -0.1), stroke: shade(C.metal, -0.45), width: fw(K, STYLE.line.hair) });
  const hub: Point[] = [[0.29 * k, -w * 0.18], [0.36 * k, -w * 0.32], [0.36 * k, w * 0.32], [0.29 * k, w * 0.18]];
  polygon(g, hub, { fill: shade(st, 0.3), stroke: st, width: sw });
  const c: SyringeCtx = { g, k, w, st, sw, K, b0: 0.36 * k, b1: 0.78 * k };
  const pl = syringeBarrel(c, o, o.level ?? 0.55);
  rect(g, c.b1, -w * 0.95, 0.025 * k, w * 1.9, { fill: shade(st, 0.35), stroke: st, width: sw, r: 0.01 * k });
  rect(g, pl + 0.03 * k, -w * 0.12, 0.99 * k - (pl + 0.03 * k), w * 0.24, { fill: shade(st, 0.45), stroke: st, width: sw });
  rect(g, 0.99 * k, -w * 0.7, 0.025 * k, w * 1.4, { fill: shade(st, 0.35), stroke: st, width: sw, r: 0.01 * k });
  const ports = reg(o, p, { tip: [tip[0], tip[1]], end: pol(tip[0], tip[1], 1.015 * k, angle), center: pol(tip[0], tip[1], 0.57 * k, angle) });
  return { node: g.node, ports };
}

export interface IvContent {
  cells: readonly Point[];
  r: number;
  opts: CellOpts;
}
export type IvBagOpts = Reg &
  Loose<{
    to: Point;
    via: readonly Point[];
    fill: string;
    level: number;
    color: string;
    stroke: string;
    tube: number;
    radius: number;
    content: IvContent;
  }>;

interface IvCtx {
  g: Parent;
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  bot: number;
  st: string;
  sw: number;
  K: number;
}

function ivBodyD(c: IvCtx): string {
  const { x, y, w, h, tx, bot } = c;
  const neck = 0.14 * w;
  return (
    `M${f3(x + 0.08 * w)},${f3(y)} L${f3(x + 0.92 * w)},${f3(y)} Q${f3(x + w)},${f3(y)} ${f3(x + w)},${f3(y + 0.08 * w)} ` +
    `L${f3(x + w)},${f3(bot - 0.14 * h)} Q${f3(x + w)},${f3(bot - 0.06 * h)} ${f3(tx + neck)},${f3(bot)} ` +
    `L${f3(tx - neck)},${f3(bot)} Q${f3(x)},${f3(bot - 0.06 * h)} ${f3(x)},${f3(bot - 0.14 * h)} ` +
    `L${f3(x)},${f3(y + 0.08 * w)} Q${f3(x)},${f3(y)} ${f3(x + 0.08 * w)},${f3(y)}Z`
  );
}

function ivLiquid(c: IvCtx, body: string, o: IvBagOpts): void {
  const { g, x, y, w, h, tx, bot, K } = c;
  const liquid = o.fill ?? BIO.liquid;
  path(g, body, { fill: linearGradient(g, [[0, '#f7f8fb'], [0.5, o.color ?? '#e9edf4'], [1, shade(o.color ?? '#e9edf4', -0.08)]], 0) });
  const lv = o.level ?? 0.7;
  const clip = group(g, { clip: clipPath(g, body) });
  rect(clip, x, bot - h * lv, w, h * lv, { fill: linearGradient(g, [[0, shade(liquid, 0.25)], [0.45, liquid], [1, shade(liquid, -0.12)]], 0) });
  line(clip, [x, bot - h * lv], [x + w, bot - h * lv], { stroke: shade(liquid, -0.3), width: fw(K, STYLE.line.hair) });
  path(clip, `M${f3(x + 0.22 * w)},${f3(y + 0.14 * h)} L${f3(x + 0.16 * w)},${f3(y + 0.6 * h)}`, { stroke: '#fff', width: fw(K, 0.07 * w), opacity: 0.65 });
  if (o.content !== undefined) {
    const cy = bot - (h * lv) / 2;
    for (const [dx, dy] of o.content.cells) cell(clip, tx + dx, cy + dy, o.content.r, o.content.opts);
  }
  rect(clip, x, y, w, 0.12 * h, { fill: '#fff', opacity: 0.55 });
}

function ivChamber(c: IvCtx, o: IvBagOpts, port: number, ch0: number, ch1: number, tw: number): void {
  const { g, tx, st, sw, K, w } = c;
  const cw = 0.11 * w;
  const liquid = o.fill ?? BIO.liquid;
  line(g, [tx, port], [tx, ch0], { stroke: st, width: fw(K, tw) });
  rect(g, tx - cw, ch0, 2 * cw, ch1 - ch0, { fill: '#f6f7fa', stroke: st, width: sw, r: cw * 0.4 });
  rect(g, tx - cw + sw, ch0 + (ch1 - ch0) * 0.62, 2 * cw - 2 * sw, (ch1 - ch0) * 0.38 - sw, { fill: liquid });
  ellipse(g, tx, ch0 + (ch1 - ch0) * 0.3, cw * 0.28, cw * 0.4, { fill: liquid, stroke: shade(liquid, -0.3), width: fw(K, STYLE.line.hair) });
}

export function ivBag(p: Parent, x: number, y: number, w: number, h: number, o: IvBagOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'iv-bag' });
  const st = o.stroke ?? BIO.outline;
  const sw = fw(K, Math.max(0.02 * w, STYLE.line.thin));
  const tx = x + w / 2;
  const bot = y + h;
  const neck = 0.14 * w;
  const port = bot + 0.1 * h;
  const ch0 = port + 0.06 * h;
  const ch1 = ch0 + 0.24 * h;
  const tw = o.tube ?? Math.max(0.07 * w, 1.2);
  const c: IvCtx = { g, x, y, w, h, tx, bot, st, sw, K };
  if (o.to !== undefined) {
    const d = rounded([[tx, ch1], ...(o.via ?? []), o.to], o.radius ?? 0.25 * w);
    path(g, d, { stroke: st, width: fw(K, tw), part: 'iv-line' });
    path(g, d, { stroke: '#f6f7fa', width: fw(K, tw - 2 * sw) });
  }
  const body = ivBodyD(c);
  ivLiquid(c, body, o);
  path(g, body, { stroke: st, width: sw });
  circle(g, tx, y + 0.06 * h, 0.05 * w, { fill: '#fff', stroke: st, width: sw });
  rect(g, tx - neck * 0.5, bot, neck, port - bot, { fill: shade(st, 0.35), stroke: st, width: sw });
  ivChamber(c, o, port, ch0, ch1, tw);
  const ports = reg(o, p, { top: [tx, y], outlet: [tx, ch1], end: o.to ?? [tx, ch1], center: [tx, y + h / 2] });
  return { node: g, ports };
}

export type ZoomCircleOpts = Reg & Loose<{ stroke: string; width: number; dash: Dash; fill: string }>;

export function zoomCircle(
  p: Parent,
  target: readonly [number, number, number],
  centre: Point,
  R: number,
  o: ZoomCircleOpts = {},
): { node: SVGGElement; inner: Handle; ports: Part['ports'] } {
  const K = floorOf(p);
  const [tx, ty, tr] = target;
  const [cx, cy] = centre;
  const g = el(p, 'g', { 'data-part': o.part ?? 'zoom-circle' });
  const st = o.stroke ?? C.mid;
  const sw = fw(K, o.width ?? STYLE.line.thin);
  const d = Math.hypot(cx - tx, cy - ty);
  const th = Math.atan2(cy - ty, cx - tx);
  if (d > Math.abs(R - tr)) {
    const b = Math.acos((tr - R) / d);
    for (const s of [-1, 1]) {
      const a = th + s * b;
      line(g, [tx + tr * Math.cos(a), ty + tr * Math.sin(a)], [cx + R * Math.cos(a), cy + R * Math.sin(a)], { stroke: st, width: sw, dash: o.dash });
    }
  }
  circle(g, tx, ty, tr, { stroke: st, width: sw, dash: o.dash });
  circle(g, cx, cy, R, { fill: o.fill ?? '#fff', stroke: 'none' });
  const inner = group(g, { clip: clipPath(g, ellD(cx, cy, R)) });
  const ring = el(g, 'g', {});
  circle(ring, cx, cy, R, { stroke: st, width: sw * 1.4 });
  const ports = reg(o, p, { target: [tx, ty], center: [cx, cy], left: [cx - R, cy], right: [cx + R, cy], top: [cx, cy - R], bottom: [cx, cy + R] });
  return { node: g, inner, ports };
}
