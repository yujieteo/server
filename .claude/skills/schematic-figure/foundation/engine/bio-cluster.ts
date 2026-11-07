// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Loose, Parent } from './types.ts';
import { el } from './core.ts';
import { hashSeed } from './illustrate.ts';
import type { Part, Rand } from './bio-util.ts';
import { reg, rnd, rng, sortByKey } from './bio-util.ts';
import { cell } from './bio-cell.ts';
import type { CellOpts } from './bio-cell.ts';

export type CellClusterOpts = CellOpts &
  Loose<{ n: number; r: number; sizeVar: number; overlap: number; aspect: number; colors: readonly string[] }>;
export interface ClusterCell {
  x: number;
  y: number;
  r: number;
}

function clusterSeed(cx: number, cy: number, R: number, o: CellClusterOpts, rand: Rand, rr: number): ClusterCell[] {
  const n = o.n ?? 12;
  const as = o.aspect ?? 1;
  const cells: ClusterCell[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const a = i * 2.39996;
    const q = Math.sqrt(t) * (R - rr) * 0.9;
    const x = cx + q * Math.cos(a) * Math.sqrt(as) + (rnd(rand) - 0.5) * 0.3 * rr;
    const y = cy + (q * Math.sin(a)) / Math.sqrt(as) + (rnd(rand) - 0.5) * 0.3 * rr;
    cells.push({ x, y, r: rr * (1 + (o.sizeVar ?? 0.14) * (2 * rnd(rand) - 1)) });
  }
  return cells;
}

function pushApart(a: ClusterCell, b: ClusterCell, ov: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dd = Math.hypot(dx, dy);
  const d = dd === 0 ? 1e-3 : dd;
  const m = (a.r + b.r) * ov;
  if (d < m) {
    const k = ((m - d) / d) * 0.5;
    a.x -= dx * k;
    a.y -= dy * k;
    b.x += dx * k;
    b.y += dy * k;
  }
}

function clusterRelax(cells: ClusterCell[], cx: number, cy: number, R: number, as: number, ov: number): void {
  const n = cells.length;
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = cells[i];
        const b = cells[j];
        if (a !== undefined && b !== undefined) pushApart(a, b, ov);
      }
    }
    for (const c of cells) {
      const ex = (c.x - cx) / Math.sqrt(as);
      const ey = (c.y - cy) * Math.sqrt(as);
      const d = Math.hypot(ex, ey);
      const lim = Math.max(0, R - c.r * 0.9);
      if (d > lim) {
        const k = lim / d;
        c.x = cx + ex * k * Math.sqrt(as);
        c.y = cy + (ey * k) / Math.sqrt(as);
      } else {
        c.x += (cx - c.x) * 0.01;
        c.y += (cy - c.y) * 0.01;
      }
    }
  }
}

export interface ClusterResult extends Part {
  cells: ClusterCell[];
}

export function cellCluster(p: Parent, cx: number, cy: number, R: number, o: CellClusterOpts = {}): ClusterResult {
  const { n: n0, r: r0, sizeVar: _sv, overlap, aspect, seed: s0, colors, F: _F, name: _name, part, ...co } = o;
  const n = n0 ?? 12;
  const seed = s0 ?? 11;
  const rand = rng(seed);
  const as = aspect ?? 1;
  const ov = overlap ?? 0.86;
  const rr = r0 ?? ((R * Math.sqrt(0.78 / n)) / ov) * 0.98;
  const g = el(p, 'g', { 'data-part': part ?? 'cell-cluster' });
  const cells = clusterSeed(cx, cy, R, o, rand, rr);
  clusterRelax(cells, cx, cy, R, as, ov);
  const ys: number[] = [];
  for (const c of cells) ys.push(c.y);
  const ordered = sortByKey(cells, ys);
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    if (c === undefined) continue;
    const fill = colors === undefined ? co.fill : colors[i % colors.length];
    cell(g, c.x, c.y, c.r, { ...co, fill, seed: hashSeed(seed, i, c.x, c.y) });
  }
  const sx = R * Math.sqrt(as);
  const sy = R / Math.sqrt(as);
  const ports = reg(o, p, { center: [cx, cy], left: [cx - sx, cy], right: [cx + sx, cy], top: [cx, cy - sy], bottom: [cx, cy + sy] });
  const out: ClusterCell[] = [];
  for (const c of ordered) out.push({ x: c.x, y: c.y, r: c.r });
  return { node: g, cells: out, ports };
}
