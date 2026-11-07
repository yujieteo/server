// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { ellipse, line, linearGradient, path, polygon, rect } from './draw.ts';
import { f3 } from './util.ts';
import type { Part, Reg } from './bio-util.ts';
import { floorOf, fw, reg, rnd, rng } from './bio-util.ts';

const C = STYLE.color;

export type StumpOpts = Reg & Loose<{ h: number; fill: string; top: string; rings: number; stroke: string }>;

export function stump(p: Parent, x: number, yg: number, w: number, o: StumpOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'stump' });
  const h = o.h ?? 0.7 * w;
  const fill = o.fill ?? '#a89886';
  const top = o.top ?? '#cdbba5';
  const yt = yg - h;
  const ow = o.stroke !== undefined && o.stroke !== '' ? fw(K, STYLE.line.thin) : undefined;
  path(g, `M${f3(x - w / 2)},${f3(yg)} Q${f3(x - w * 0.4)},${f3(yg - h * 0.35)} ${f3(x - w * 0.4)},${f3(yt)} L${f3(x + w * 0.4)},${f3(yt)} Q${f3(x + w * 0.4)},${f3(yg - h * 0.35)} ${f3(x + w / 2)},${f3(yg)} Z`, {
    fill, stroke: o.stroke, width: ow,
  });
  ellipse(g, x, yt, w * 0.4, w * 0.13, { fill: top, stroke: o.stroke, width: ow });
  const nr = o.rings ?? 0;
  for (let i = 1; i <= nr; i++) {
    const q = i / (nr + 1);
    ellipse(g, x, yt, w * 0.4 * q, w * 0.13 * q, { stroke: shade(top, -0.25), width: fw(K, STYLE.line.hair) });
  }
  const ports = reg(o, p, { base: [x, yg], top: [x, yt], left: [x - w / 2, yg], right: [x + w / 2, yg] });
  return { node: g, ports };
}

export type GroundOpts = Reg &
  Loose<{
    depth: number;
    soil: string;
    soilDeep: string;
    surface: string;
    width: number;
    cleared: readonly (readonly [number, number])[];
    clearedFill: string;
    grass: boolean | number;
    grassColor: string;
    seed: number;
  }>;

export function ground(p: Parent, x0: number, x1: number, y: number, o: GroundOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'ground' });
  const depth = o.depth ?? 20;
  const soil = o.soil ?? '#d9cbb4';
  const R = rng(o.seed ?? 5);
  const cleared = o.cleared ?? [];
  if (depth > 0) rect(g, x0, y, x1 - x0, depth, { fill: linearGradient(g, [[0, soil, 1], [1, o.soilDeep ?? shade(soil, 0.55), 1]], 90), part: 'soil' });
  for (const [xa, xb] of cleared) rect(g, xa, y, xb - xa, Math.max(1, Math.min(depth, 2.2)), { fill: o.clearedFill ?? '#efe6d8', part: 'cleared' });
  line(g, [x0, y], [x1, y], { stroke: o.surface ?? '#6f6558', width: fw(K, o.width ?? STYLE.line.normal), cap: 'butt', part: 'surface' });
  const ng = o.grass === true ? Math.round((x1 - x0) / 9) : o.grass === false ? 0 : (o.grass ?? 0);
  const gc = o.grassColor ?? '#7e9a6f';
  for (let i = 0; i < ng; i++) {
    const gx = x0 + ((i + 0.3 + 0.4 * rnd(R)) * (x1 - x0)) / ng;
    let skip = false;
    for (const [a, b] of cleared) if (gx > a && gx < b) skip = true;
    if (skip) continue;
    for (const dx of [-0.9, 0, 0.9]) line(g, [gx, y], [gx + dx * 1.2, y - 2 - (dx !== 0 ? 0 : 0.8)], { stroke: gc, width: fw(K, STYLE.line.thin), part: 'grass' });
  }
  const ports = reg(o, p, { left: [x0, y], right: [x1, y], center: [(x0 + x1) / 2, y], soil: [(x0 + x1) / 2, y + depth / 2] });
  return { node: g, ports };
}

export type CantileverOpts = Reg & Loose<{ t: number; tipH: number; tipW: number; bend: number; fill: string; chip: boolean; chipW: number; chipH: number; chipFill: string; stroke: string }>;

function beamY(x0: number, x1: number, y: number, bend: number, xx: number): number {
  return y - bend * ((xx - x0) / (x1 - x0)) ** 2;
}

function beamOutline(x0: number, x1: number, y: number, bend: number, t: number): Point[] {
  const top: Point[] = [];
  const bot: Point[] = [];
  for (let i = 0; i <= 16; i++) {
    const xx = x0 + ((x1 - x0) * i) / 16;
    top.push([xx, beamY(x0, x1, y, bend, xx) - t / 2]);
    bot.push([xx, beamY(x0, x1, y, bend, xx) + t / 2]);
  }
  return [...top, ...bot.toReversed()];
}

export function cantilever(p: Parent, x0: number, x1: number, y: number, o: CantileverOpts = {}): Part & { apex: Point } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cantilever' });
  const t = o.t ?? 1.2;
  const tipH = o.tipH ?? 8;
  const tipW = o.tipW ?? 5;
  const fill = o.fill ?? '#9aa2ac';
  const st = o.stroke ?? C.ink;
  const sg = Math.sign(x1 - x0) === 0 ? 1 : Math.sign(x1 - x0);
  const bend = o.bend ?? 0;
  const sw = fw(K, STYLE.line.hair * 1.2);
  if (o.chip !== false) {
    const cw = o.chipW ?? 8;
    const ch = o.chipH ?? 5.2;
    rect(g, sg > 0 ? x0 - cw : x0, y - ch * 0.62, cw, ch, { fill: o.chipFill ?? '#6f7780', stroke: st, width: fw(K, STYLE.line.thin), part: 'chip' });
  }
  polygon(g, beamOutline(x0, x1, y, bend, t), { fill, stroke: st, width: sw, part: 'beam' });
  const tx = x1 - sg * tipW * 0.55;
  const sl = (-2 * bend * (tx - x0)) / (x1 - x0) ** 2;
  const nl = Math.hypot(sl, 1);
  const nrm: Point = [-sl / nl, 1 / nl];
  const ty = beamY(x0, x1, y, bend, tx) + t / 2;
  const apex: Point = [tx + nrm[0] * tipH, ty + nrm[1] * tipH];
  const ya = beamY(x0, x1, y, bend, tx - tipW / 2) + t / 2;
  const yb = beamY(x0, x1, y, bend, tx + tipW / 2) + t / 2;
  polygon(g, [[tx - tipW / 2, ya], [tx + tipW / 2, yb], apex], { fill, stroke: st, width: sw, join: 'round', part: 'tip' });
  const ports = reg(o, p, { apex, base: [x0, y], free: [x1, beamY(x0, x1, y, bend, x1)], back: [tx, beamY(x0, x1, y, bend, tx) - t / 2] });
  return { node: g, ports, apex };
}
