// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Loose, Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, line, path, radialGradient, smooth } from './draw.ts';
import { f3 } from './util.ts';
import type { Part, Rand, Reg } from './bio-util.ts';
import { BIO, floorOf, fw, nz, pol, rad, reg, rnd, rng } from './bio-util.ts';

export type VirusOpts = Reg &
  Loose<{
    spikes: number;
    spikeLen: number;
    tip: 'knob' | 'club' | 'trumpet' | 'fork' | 'none';
    genome: 'coil' | 'segments' | 'none';
    wiggle: number;
    waves: number;
    color: string;
    core: string;
    rna: string;
    seed: number;
  }>;

function spikeTip(s: Parent, tip: string, e: number, r: number, col: string, K: number): void {
  if (tip === 'knob') ellipse(s, e, 0, r * 0.06, r * 0.1, { fill: col });
  else if (tip === 'trumpet') {
    const d =
      `M${f3(e - r * 0.16)},${f3(-r * 0.035)} Q${f3(e - r * 0.02)},${f3(-r * 0.04)} ${f3(e)},${f3(-r * 0.11)} ` +
      `L${f3(e)},${f3(r * 0.11)} Q${f3(e - r * 0.02)},${f3(r * 0.04)} ${f3(e - r * 0.16)},${f3(r * 0.035)}Z`;
    path(s, d, { fill: col });
  } else if (tip === 'club') {
    path(s, `M${f3(e - r * 0.12)},0 L${f3(e)},${f3(-r * 0.1)} Q${f3(e + r * 0.05)},0 ${f3(e)},${f3(r * 0.1)}Z`, { fill: col });
  } else if (tip === 'fork') {
    for (const sg of [-1, 1]) line(s, [e - r * 0.1, 0], [e, sg * r * 0.08], { stroke: col, width: fw(K, r * 0.05) });
  }
}

function strand(g: Parent, K: number, pts: readonly Point[], w: number, rna: string): void {
  const d = smooth(pts, false, 0.5);
  path(g, d, { stroke: shade(rna, 0.45), width: fw(K, w * 1.5), opacity: 0.5 });
  path(g, d, { stroke: rna, width: fw(K, w), part: 'genome' });
}

function backbone(t: number, cx: number, cy: number, r: number, ph: number, ph2: number): Point {
  const th = ph + t * 1.3 * 6.283;
  const rho = r * (0.4 + 0.14 * Math.sin(t * 3.5 * 6.283 + ph2));
  return [cx + rho * Math.cos(th), cy + rho * Math.sin(th)];
}

function coilGenome(g: Parent, K: number, cx: number, cy: number, r: number, o: VirusOpts, R: Rand, rna: string): void {
  const ph = rnd(R) * 6.283;
  const ph2 = rnd(R) * 6.283;
  const m = 400;
  const amp = (o.wiggle ?? 0.035) * r;
  const waves = o.waves ?? 34;
  const pts: Point[] = [];
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const [x0, y0] = backbone(t, cx, cy, r, ph, ph2);
    const [x1, y1] = backbone(Math.min(1, t + 1e-3), cx, cy, r, ph, ph2);
    const [x2, y2] = backbone(Math.max(0, t - 1e-3), cx, cy, r, ph, ph2);
    const n = nz(Math.hypot(x1 - x2, y1 - y2));
    const v = amp * Math.sin(t * waves * 6.283);
    pts.push([x0 - ((y1 - y2) / n) * v, y0 + ((x1 - x2) / n) * v]);
  }
  strand(g, K, pts, r * 0.045, rna);
  strand(g, K, pts, r * 0.045, rna);
}

function segmentGenome(g: Parent, K: number, cx: number, cy: number, r: number, R: Rand, rna: string): void {
  for (let j = 0; j < 6; j++) {
    const a = j * 60 + rnd(R) * 20;
    const [x, y] = pol(cx, cy, 0.4 * r, a);
    const L2 = 0.28 * r;
    const pts: Point[] = [];
    for (let i = 0; i < 25; i++) {
      const t = i / 24 - 0.5;
      pts.push([x + t * L2 * Math.cos(rad(a + 90)) + 0.03 * r * Math.sin(t * 25), y + t * L2 * Math.sin(rad(a + 90)) + 0.03 * r * Math.cos(t * 25)]);
    }
    strand(g, K, pts, r * 0.04, rna);
  }
}

export function virus(p: Parent, cx: number, cy: number, r: number, o: VirusOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'virus' });
  const R = rng(o.seed ?? 3);
  const col = o.color ?? BIO.virus;
  const n = o.spikes ?? 16;
  const sl = o.spikeLen ?? 0.32;
  const tip = o.tip ?? 'knob';
  const a0 = (rnd(R) * 360) / n;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * 360) / n;
    const s = group(g, { x: cx, y: cy, rotate: a });
    const e = r * (1 + sl);
    line(s, [r * 0.9, 0], [e - (tip === 'none' ? 0 : r * 0.05), 0], { stroke: col, width: fw(K, r * 0.07), cap: 'butt' });
    spikeTip(s, tip, e, r, col, K);
  }
  circle(g, cx, cy, r, { fill: col });
  const core = o.core ?? BIO.capsid;
  circle(g, cx, cy, r * 0.82, { fill: radialGradient(g, [[0, shade(core, 0.4)], [0.7, core], [1, shade(core, -0.12)]], { cx: 0.42, cy: 0.38, r: 0.62 }) });
  const rna = o.rna ?? BIO.rna;
  const genome = o.genome ?? 'coil';
  if (genome === 'coil') coilGenome(g, K, cx, cy, r, o, R, rna);
  else if (genome === 'segments') segmentGenome(g, K, cx, cy, r, R, rna);
  const ext = r * (1 + sl);
  const ports = reg(o, p, { center: [cx, cy], left: [cx - ext, cy], right: [cx + ext, cy], top: [cx, cy - ext], bottom: [cx, cy + ext] });
  return { node: g, ports };
}

export type MrnaOpts = Loose<{
  style: 'coil' | 'wave';
  amp: number;
  turns: number;
  color: string;
  width: number;
  cap: boolean;
  tail: boolean | number;
  part: string;
}>;

export function mrna(p: Parent, a: Point, b: Point, o: MrnaOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'mrna' });
  const col = o.color ?? BIO.rna;
  const L2 = nz(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const ux = (b[0] - a[0]) / L2;
  const uy = (b[1] - a[1]) / L2;
  const amp = (o.amp ?? 0.1) * L2;
  const turns = o.turns ?? 5;
  const m = Math.max(80, turns * 24);
  const coil = (o.style ?? 'coil') === 'coil';
  const pts: Point[] = [];
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const w = t * turns * 6.283;
    const s = coil ? t * L2 - amp * 0.9 * Math.cos(w) + amp * 0.9 : t * L2;
    const v = amp * Math.sin(w);
    pts.push([a[0] + ux * s - uy * v, a[1] + uy * s + ux * v]);
  }
  const w = o.width ?? Math.max(0.03 * L2, STYLE.line.thin);
  path(g, smooth(pts, false, 0.5), { stroke: col, width: fw(K, w) });
  const first = pts[0];
  if (o.cap === true && first !== undefined) circle(g, first[0], first[1], w * 1.4, { fill: col });
  const e = pts[m];
  if (o.tail !== undefined && o.tail !== false && o.tail !== 0 && e !== undefined) {
    const tl = (o.tail === true ? 0.18 : o.tail) * L2;
    line(g, e, [e[0] + ux * tl, e[1] + uy * tl], { stroke: col, width: fw(K, w * 0.6) });
  }
  return { node: g };
}
