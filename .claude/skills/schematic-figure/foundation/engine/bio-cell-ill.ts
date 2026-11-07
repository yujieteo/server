// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { smooth } from './draw.ts';
import { ball, blob, finish, hashSeed, softSpot, tint } from './illustrate.ts';
import type { Ill, Part, Rand } from './bio-util.ts';
import { BIO, floorOf, fw, palOf, pol, rad, reg, rnd, rng, vary, varyTint } from './bio-util.ts';
import type { CellOpts, CellResult, CellShape, Harm } from './bio-cell-shape.ts';
import { cellHarm, cellPt, placeReceptors, portsOf } from './bio-cell-shape.ts';

function numOr(v: false | number | undefined, d: number): false | number {
  if (v === false) return false;
  return typeof v === 'number' ? v : d;
}

function wobbleHarm(R: Rand): Harm[] {
  const wh: Harm[] = [];
  for (const k of [2, 3, 4, 5]) wh.push({ k, a: (0.5 + rnd(R)) / k ** 0.8, ph: rnd(R) * 6.283 });
  return wh;
}

function illShape(cx: number, cy: number, r: number, o: CellOpts, il: Ill, R: Rand, vr: ReturnType<typeof vary> | undefined): CellShape {
  const h = cellHarm(o, R);
  const wh = wobbleHarm(R);
  let sum = 0;
  for (const w of wh) sum += w.a;
  const ro = rad(vr === undefined ? 0 : vr.rot);
  const wob = o.wobble ?? il.wobble ?? 0.035;
  return { cx, cy, r, ...h, wob, wh, wn: sum / 1.6, aspect: vr === undefined ? 1 : vr.aspect, cr: Math.cos(ro), sr: Math.sin(ro), ill: true };
}

function illVesicles(inner: Parent, cx: number, cy: number, r: number, count: number, base: string, R: Rand): void {
  const vc = tint(base, { l: 0.12, s: -0.05 });
  for (let i = 0; i < count; i++) {
    const [x, y] = pol(cx, cy, r * (0.45 + 0.4 * rnd(R)), rnd(R) * 360);
    ball(inner, x, y, r * (0.03 + 0.03 * rnd(R)), vc, { outline: false, rim: false, core: 0, highlight: 0.5, contrast: 0.8, part: 'vesicle' });
  }
}

function illNucleus(inner: Parent, s: CellShape, o: CellOpts, il: Ill, base: string, seed: number, R: Rand): void {
  if (o.nucleus === false) return;
  const K = floorOf(inner);
  const fl = o.flat === true;
  const pal = palOf(o.palette);
  const { cx, cy, r } = s;
  const nu = o.nucleus ?? {};
  const nr = (nu.r ?? (fl ? 0.56 : 0.5)) * r * (1 + 0.08 * (rnd(R) - 0.5));
  const nx = cx + ((nu.dx ?? (fl ? 0.02 : -0.04)) + 0.06 * (rnd(R) - 0.5)) * r;
  const ny = cy + ((nu.dy ?? (fl ? 0.06 : 0.08)) + 0.06 * (rnd(R) - 0.5)) * r;
  const nc = nu.color ?? pal?.nucleus ?? shade(base, -0.22);
  const aspect = 1 + 0.18 * (rnd(R) - 0.5);
  const rot = rnd(R) * 180;
  const nd = smooth(blob(nx, ny, nr, { seed: seed + 7, amp: 0.07, aspect, rot }), true, 0.5);
  const n = finish(inner, nd, nc, {
    light: il.light, contrast: fl ? 0.55 : 0.85, rim: 0.4, core: 0.25, highlight: fl ? 0.25 : 0.4,
    width: fw(K, Math.max(0.022 * r, STYLE.line.hair)), outline: nu.stroke ?? (fl ? pal?.nstroke : undefined), part: 'nucleus',
  });
  const T = n.tones;
  const [ox, oy] = pol(nx, ny, nr * 0.38 * Math.sqrt(rnd(R)), rnd(R) * 360);
  ball(n.inner, ox, oy, nr * (0.12 + 0.07 * rnd(R)), tint(nc, { l: -0.1 }), { outline: false, rim: false, core: 0, highlight: 0.25, contrast: 0.5, part: 'nucleolus' });
  for (let i = 0; i < 9; i++) {
    const [x, y] = pol(nx, ny, nr * 0.75 * Math.sqrt(rnd(R)), rnd(R) * 360);
    softSpot(n.inner, x, y, nr * (0.08 + 0.07 * rnd(R)), nr * (0.05 + 0.05 * rnd(R)), rnd(R) * 180, T.deep, 0.4);
  }
}

export function cellIllustrated(p: Parent, cx: number, cy: number, r: number, o: CellOpts, il: Ill): CellResult {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cell' });
  const pal = palOf(o.palette);
  const seed = o.seed ?? hashSeed(cx, cy, r);
  const vr = o.vary === false ? undefined : vary(seed, 0, { rot: 180, aspect: 0.07, hue: 4, lum: 0.03, sat: 0.03 });
  const base0 = o.fill ?? pal?.fill ?? BIO.cell;
  const base = vr === undefined ? base0 : varyTint(vr, base0);
  const R = rng(seed);
  const fl = o.flat === true;
  const s = illShape(cx, cy, r, o, il, R, vr);
  const N = s.ruf !== 0 ? Math.max(96, s.bumps * 8) : 72;
  const pts: Point[] = [];
  for (let i = 0; i < N; i++) pts.push(cellPt(s, (i * 360) / N));
  const outline = smooth(pts, true, 0.5);
  if (o.receptors !== undefined) placeReceptors(g, s, o.receptors);
  const body = finish(g, outline, base, {
    light: il.light, contrast: o.contrast ?? il.contrast ?? (fl ? 0.6 : 1), shadow: o.shadow ?? il.shadow ?? false,
    rim: numOr(o.rim, fl ? 0.45 : 0.7), highlight: numOr(o.highlight, fl ? 0.4 : 0.75), core: fl ? 0.22 : 0.35,
    width: fw(K, o.width ?? Math.max(0.03 * r, STYLE.line.thin)), outline: o.stroke ?? (fl ? pal?.stroke : undefined),
    mottle: o.mottle ?? (fl ? 2 : 4), seed, part: 'cell-body', outlinePart: 'membrane',
  });
  if (o.vesicles !== undefined && o.vesicles !== false) illVesicles(body.inner, cx, cy, r, o.vesicles === true ? 16 : o.vesicles, base, R);
  illNucleus(body.inner, s, o, il, base, seed, R);
  const part: Part = { node: g, ports: reg(o, p, portsOf(s)) };
  return { ...part, shape: s };
}
