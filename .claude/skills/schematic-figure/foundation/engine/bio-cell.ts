// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, clipPath, path, radialGradient, smooth } from './draw.ts';
import type { Part, Rand } from './bio-util.ts';
import { BIO, ellD, floorOf, fw, illOf, palOf, pol, reg, rng } from './bio-util.ts';
import type { CellOpts, CellResult, CellShape } from './bio-cell-shape.ts';
import { cellHarm, cellPt, cellR, placeReceptors, portsOf, vesicleDots } from './bio-cell-shape.ts';
import { cellIllustrated } from './bio-cell-ill.ts';

export type { CellOpts, CellResult, CellShape } from './bio-cell-shape.ts';
export { cellAt } from './bio-cell-shape.ts';

function outlineOf(s: CellShape): string {
  if (s.lobes !== 0 || s.ruf !== 0) {
    const N = s.ruf !== 0 ? Math.max(96, s.bumps * 8) : 96;
    const pts: Point[] = [];
    for (let i = 0; i < N; i++) pts.push(cellPt(s, (i * 360) / N));
    return smooth(pts, true, 0.5);
  }
  return ellD(s.cx, s.cy, s.r);
}

function cellFlat(g: Parent, s: CellShape, o: CellOpts, outline: string, R: Rand): Part['ports'] {
  const K = floorOf(g);
  const pal = palOf(o.palette);
  const base = o.fill ?? pal?.fill ?? BIO.cell;
  const stroke = o.stroke ?? pal?.stroke ?? shade(base, -0.25);
  const sw = fw(K, o.width ?? Math.max(0.035 * s.r, STYLE.line.thin));
  path(g, outline, { fill: base, stroke, width: sw, part: 'membrane' });
  if (o.vesicles !== undefined && o.vesicles !== false) vesicleDots(g, s.cx, s.cy, s.r, o.vesicles, shade(base, 0.55), R);
  if (o.nucleus !== false) {
    const nu = o.nucleus ?? {};
    const nr = (nu.r ?? 0.56) * s.r;
    circle(g, s.cx + (nu.dx ?? 0.02) * s.r, s.cy + (nu.dy ?? 0.06) * s.r, nr, {
      fill: nu.color ?? pal?.nucleus ?? shade(base, -0.2),
      stroke: nu.stroke ?? pal?.nstroke ?? shade(base, -0.33),
      width: sw,
      part: 'nucleus',
    });
  }
  return portsOf(s);
}

function arcPath(s: CellShape, a0: number, a1: number, k: number): string {
  const pts: Point[] = [];
  for (let i = 0; i < 13; i++) {
    const a = a0 + ((a1 - a0) * i) / 12;
    pts.push(pol(s.cx, s.cy, cellR(s, a) * k, a));
  }
  return smooth(pts);
}

function cellNucleus(inner: Parent, g: Parent, s: CellShape, o: CellOpts, base: string, K: number): void {
  if (o.nucleus === false) return;
  const pal = palOf(o.palette);
  const nu = o.nucleus ?? {};
  const nr = (nu.r ?? 0.5) * s.r;
  const nx = s.cx + (nu.dx ?? -0.04) * s.r;
  const ny = s.cy + (nu.dy ?? 0.08) * s.r;
  const nc = nu.color ?? pal?.nucleus ?? shade(base, -0.22);
  circle(inner, nx, ny, nr, { fill: shade(nc, -0.12) });
  const ng = group(inner, { clip: clipPath(g, ellD(nx, ny, nr)) });
  circle(ng, nx + 0.1 * nr, ny - 0.12 * nr, nr * 0.94, { fill: shade(nc, 0.1) });
  const hl: Point[] = [];
  for (let i = 0; i < 9; i++) hl.push(pol(nx, ny, nr * 0.72, -75 + (50 * i) / 8));
  path(ng, smooth(hl), { stroke: '#fff', width: fw(K, nr * 0.1), opacity: 0.45 });
}

function cellShaded(g: Parent, s: CellShape, o: CellOpts, outline: string, R: Rand): Part['ports'] {
  const K = floorOf(g);
  const pal = palOf(o.palette);
  const base = o.fill ?? pal?.fill ?? BIO.cell;
  const stroke = o.stroke ?? pal?.stroke ?? shade(base, -0.42);
  const fill = radialGradient(g, [[0, shade(base, 0.38)], [0.6, base], [1, shade(base, -0.16)]], { cx: 0.4, cy: 0.36, r: 0.66 });
  path(g, outline, { fill, stroke, width: fw(K, o.width ?? Math.max(0.025 * s.r, STYLE.line.thin)), part: 'membrane' });
  const inner = group(g, { clip: clipPath(g, outline) });
  if (o.rim !== false) path(inner, arcPath(s, 95, 215, 0.93), { stroke: '#fff', width: fw(K, s.r * 0.16), opacity: o.rim ?? 0.3 });
  if (o.highlight !== false) path(inner, arcPath(s, -78, -18, 0.8), { stroke: '#fff', width: fw(K, s.r * 0.08), opacity: o.highlight ?? 0.55 });
  if (o.vesicles !== undefined && o.vesicles !== false) vesicleDots(inner, s.cx, s.cy, s.r, o.vesicles, shade(base, 0.5), R);
  cellNucleus(inner, g, s, o, base, K);
  return portsOf(s);
}

export function cell(p: Parent, cx: number, cy: number, r: number, o: CellOpts = {}): CellResult {
  const il = illOf(o);
  if (il !== undefined) return cellIllustrated(p, cx, cy, r, o, il);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cell' });
  const R = rng(o.seed ?? 1);
  const h = cellHarm(o, R);
  const s: CellShape = { cx, cy, r, ...h, wob: 0, wh: [], wn: 1, aspect: 1, cr: 1, sr: 0, ill: false };
  if (o.receptors !== undefined) placeReceptors(g, s, o.receptors);
  const outline = outlineOf(s);
  const ports = o.flat === true ? cellFlat(g, s, o, outline, R) : cellShaded(g, s, o, outline, R);
  return { node: g, ports: reg(o, p, ports), shape: s };
}
