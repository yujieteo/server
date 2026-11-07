// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { clipPath, path } from './draw.ts';
import { at } from './util.ts';
import type { AxisSpec, V3 } from './geo-vec.ts';
import { add3, axis3, orderBy } from './geo-vec.ts';
import type { Proj } from './geo-proj.ts';
import { proj3, projDepth, projPt } from './geo-proj.ts';
import type { Cyl } from './geo-cyl.ts';
import { circleD, cylinder3 } from './geo-cyl.ts';
import { obliqueBox } from './geo-box.ts';

const C = STYLE.color;

export type TubeOpts = Loose<{
  axis: AxisSpec; inner: number; fill: string; capFill: string; holeFill: string; holeDepth: number; wallFill: string;
  stroke: string; width: number; innerWidth: number; shading: boolean; part: string;
}>;

export interface Tube extends Cyl {
  top: Point;
  hole: SVGPathElement | null;
}

function drawBore(p: Parent, res: Cyl, o: TubeOpts, top: V3, a: V3, ri: number, fill: string): SVGPathElement {
  const stroke = o.stroke ?? C.ink;
  const iw = o.innerWidth ?? o.width ?? STYLE.line.thin;
  const hd = circleD(res.P, top, a, ri);
  const wall = o.holeDepth ?? 0;
  if (wall <= 0) {
    const edge = stroke === 'none' ? {} : { stroke, width: iw };
    return path(res.node, hd, { fill: o.holeFill ?? 'none', ...edge, part: 'tube-hole' });
  }
  const clip = clipPath(p, hd);
  path(res.node, hd, { fill: o.wallFill ?? shade(o.holeFill ?? fill, -0.18), part: 'tube-wall' });
  const gg = el(res.node, 'g', { 'clip-path': clip });
  path(gg, circleD(res.P, add3(top, a, -wall), a, ri), { fill: o.holeFill ?? fill, part: 'tube-bore' });
  return path(res.node, hd, { fill: 'none', stroke, width: iw, part: 'tube-hole' });
}

export function tube3(p: Parent, P: Proj, base: V3, r: number, h: number, o: TubeOpts = {}): Tube {
  const a = axis3(o.axis ?? 'z');
  const top = add3(base, a, h);
  const fill = o.fill ?? '#ffffff';
  const res = cylinder3(p, P, base, top, r, r, { fill, capFill: o.capFill ?? fill, stroke: o.stroke, width: o.width, shading: o.shading, part: o.part ?? 'tube' });
  const ri = r * (o.inner ?? 0.56);
  const hole = res.cap === 'c1' && ri > 0 ? drawBore(p, res, o, top, a, ri, fill) : null;
  return { ...res, top: proj3(P, top), hole };
}

export interface SiteGrid {
  rows: number;
  cols: number;
  pitch?: Point | undefined;
  origin?: V3 | undefined;
  hex?: boolean | undefined;
}

export type TubeArrayOpts = TubeOpts & Loose<{ each: readonly (TubeOpts | false | undefined)[] }>;

export interface TubeArray {
  node: SVGGElement;
  order: { i: number; site: V3; top: Point }[];
  sites: V3[];
}

function gridSites(S: SiteGrid, r: number): V3[] {
  const pitch = S.pitch ?? [2.2 * r, 2.2 * r];
  const origin = S.origin ?? [0, 0, 0];
  const out: V3[] = [];
  for (let j = 0; j < S.rows; j++) {
    for (let i = 0; i < S.cols; i++) {
      const shift = S.hex === true && j % 2 !== 0 ? 0.5 : 0;
      out.push([origin[0] + (i + shift) * pitch[0], origin[1] + j * pitch[1], origin[2]]);
    }
  }
  return out;
}

export function tubeArray3(p: Parent, P: Proj, sites: readonly V3[] | SiteGrid, r: number, h: number, o: TubeArrayOpts = {}): TubeArray {
  const S: V3[] = 'rows' in sites ? gridSites(sites, r) : [...sites];
  const g = el(p, 'g', { 'data-part': o.part ?? 'tube-array' });
  const depths: number[] = [];
  for (const s of S) depths.push(projDepth(P, s));
  const order: TubeArray['order'] = [];
  for (const i of orderBy(depths)) {
    const extra = o.each?.[i] ?? {};
    if (extra === false) continue;
    const site = at(S, i);
    const t = tube3(g, P, site, r, h, { ...o, part: 'tube', ...extra });
    order.push({ i, site, top: t.top });
  }
  return { node: g, order, sites: S };
}

export type Cell3 = readonly [number, number, number, string?];

export type VoxelOpts = Loose<{
  size: number; gap: number; pos: V3; filled: readonly Cell3[]; light: string; dark: string; opacity: number;
  back: boolean; backOpacity: number; filledOnTop: boolean; stroke: string; width: number; part: string;
}>;

export interface Voxels {
  node: SVGGElement;
  P: Proj;
  pos: V3;
  step: number;
  s: number;
}

interface VoxelCell {
  q: V3;
  f: boolean | string;
}

function filledAt(list: readonly Cell3[], i: number, j: number, k: number): boolean | string {
  for (const c of list) if (c[0] === i && c[1] === j && c[2] === k) return c[3] ?? true;
  return false;
}

function drawVoxel(g: SVGGElement, P: Proj, o: VoxelOpts, c: VoxelCell, stroke: string, width: number): void {
  const s = o.size ?? 8;
  if (c.f !== false && c.f !== '') {
    obliqueBox(g, P, [s, s, s], { pos: c.q, fill: typeof c.f === 'string' ? c.f : (o.dark ?? '#6f4e9a'), stroke, width, seal: true, part: 'voxel-filled' });
  } else {
    obliqueBox(g, P, [s, s, s], {
      pos: c.q, fill: o.light ?? '#cfd3ea', opacity: o.opacity ?? 0.8, back: o.back ?? true,
      backOpacity: o.backOpacity ?? 0.25, stroke, width, part: 'voxel',
    });
  }
}

export function voxels3(p: Parent, P: Proj, dims: V3, o: VoxelOpts = {}): Voxels {
  const [n1, n2, n3] = dims;
  const s = o.size ?? 8;
  const pos = o.pos ?? [0, 0, 0];
  const step = s + (o.gap ?? 0);
  const g = el(p, 'g', { 'data-part': o.part ?? 'voxels' });
  const cells: VoxelCell[] = [];
  const deps: number[] = [];
  for (let i = 0; i < n1; i++) {
    for (let j = 0; j < n2; j++) {
      for (let k = 0; k < n3; k++) {
        const q: V3 = [pos[0] + i * step, pos[1] + j * step, pos[2] + k * step];
        cells.push({ q, f: filledAt(o.filled ?? [], i, j, k) });
        deps.push(projDepth(P, [q[0] + s / 2, q[1] + s / 2, q[2] + s / 2]));
      }
    }
  }
  const stroke = o.stroke ?? shade(o.light ?? '#cfd3ea', -0.35);
  const width = o.width ?? STYLE.line.hair;
  const top = o.filledOnTop ?? true;
  const sorted = orderBy(deps);
  for (const ci of sorted) {
    const c = at(cells, ci);
    if (!top || c.f === false || c.f === '') drawVoxel(g, P, o, c, stroke, width);
  }
  if (top) {
    for (const ci of sorted) {
      const c = at(cells, ci);
      if (c.f !== false && c.f !== '') drawVoxel(g, P, o, c, stroke, width);
    }
  }
  return { node: g, P, pos, step, s };
}

export function voxelCell(v: Voxels, i: number, j: number, k: number): Point {
  return projPt(v.P, v.pos[0] + i * v.step + v.s / 2, v.pos[1] + j * v.step + v.s / 2, v.pos[2] + k * v.step + v.s / 2);
}
