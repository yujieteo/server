// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { clipPath, line, path, polygon } from './draw.ts';
import { at } from './util.ts';
import type { AxisSpec, M3, V3 } from './geo-vec.ts';
import { add3, axis3, reg, userGradient } from './geo-vec.ts';
import type { Mapper, Proj } from './geo-proj.ts';
import { faceAt, faceQuad, proj3, projPt, projVisible } from './geo-proj.ts';
import type { AnchorSpec, Dim3, FaceFills } from './geo-box.ts';
import { CUBE_EDGES, boxCorner, corners8, obliqueBox, placedProj } from './geo-box.ts';
import { circleD } from './geo-cyl.ts';

const C = STYLE.color;

export type FloorLines = Loose<{ n: number; cells: readonly number[]; stroke: string; width: number; dir: string }>;

export type WireBoxOpts = Loose<{
  pos: V3; at: Point; anchor: AnchorSpec; stroke: string; width: number; omit: readonly string[]; hidden: string;
  divide: readonly number[]; axis: string; tint: readonly (string | null)[]; tintOpacity: number;
  floorLines: FloorLines; F: Figure; name: string; part: string;
}>;

export interface WireBox extends Dim3 {
  node: SVGGElement;
  ax: number;
  other: number;
  cuts: number[];
  ports: Ports;
}

type WireGeom = Pick<WireBox, 'P' | 'w' | 'd' | 'h' | 'ax' | 'other' | 'cuts'>;

function wirePt(wb: WireGeom, a: number, b: number, c: number): Point {
  const v: M3 = [0, 0, 0];
  v[wb.ax] = a;
  v[wb.other] = b;
  v[2] = c;
  return projPt(wb.P, v[0], v[1], v[2]);
}

function extent(wb: WireGeom, k: number): number {
  return at([wb.w, wb.d, wb.h], k);
}

function signedUnit(k: number, s: number): V3 {
  return k === 0 ? [s, 0, 0] : k === 1 ? [0, s, 0] : [0, 0, s];
}

interface TintFace {
  nrm: V3;
  pts: Point[];
}

function tintFaces(wb: WireGeom, a0: number, a1: number): TintFace[] {
  const B = extent(wb, wb.other);
  const h = wb.h;
  return [
    { nrm: [0, 0, 1], pts: [wirePt(wb, a0, 0, 0), wirePt(wb, a1, 0, 0), wirePt(wb, a1, B, 0), wirePt(wb, a0, B, 0)] },
    { nrm: signedUnit(wb.ax, 1), pts: [wirePt(wb, a0, 0, 0), wirePt(wb, a0, B, 0), wirePt(wb, a0, B, h), wirePt(wb, a0, 0, h)] },
    { nrm: signedUnit(wb.ax, -1), pts: [wirePt(wb, a1, 0, 0), wirePt(wb, a1, B, 0), wirePt(wb, a1, B, h), wirePt(wb, a1, 0, h)] },
    { nrm: signedUnit(wb.other, 1), pts: [wirePt(wb, a0, 0, 0), wirePt(wb, a1, 0, 0), wirePt(wb, a1, 0, h), wirePt(wb, a0, 0, h)] },
    { nrm: signedUnit(wb.other, -1), pts: [wirePt(wb, a0, B, 0), wirePt(wb, a1, B, 0), wirePt(wb, a1, B, h), wirePt(wb, a0, B, h)] },
  ];
}

function drawTints(g: SVGGElement, wb: WireGeom, o: WireBoxOpts): void {
  const tint = o.tint ?? [];
  for (let i = 0; i < tint.length; i++) {
    const fill = tint[i];
    if (fill === null || fill === undefined || fill === '' || i >= wb.cuts.length - 1) continue;
    const a0 = at(wb.cuts, i) * extent(wb, wb.ax);
    const a1 = at(wb.cuts, i + 1) * extent(wb, wb.ax);
    for (const f of tintFaces(wb, a0, a1)) {
      if (projVisible(wb.P, f.nrm)) polygon(g, f.pts, { fill, fillOpacity: o.tintOpacity, part: 'wire-box-tint' });
    }
  }
}

function drawFloorLines(g: SVGGElement, wb: WireGeom, fl: FloorLines): void {
  const n = fl.n ?? 6;
  const B = extent(wb, wb.other);
  for (const i of fl.cells ?? [0]) {
    const a0 = at(wb.cuts, i) * extent(wb, wb.ax);
    const a1 = at(wb.cuts, i + 1) * extent(wb, wb.ax);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      const pa = fl.dir === 'along' ? wirePt(wb, a0, t * B, 0) : wirePt(wb, a0 + (a1 - a0) * t, 0, 0);
      const pb = fl.dir === 'along' ? wirePt(wb, a1, t * B, 0) : wirePt(wb, a0 + (a1 - a0) * t, B, 0);
      line(g, pa, pb, { stroke: fl.stroke ?? C.mid, width: fl.width ?? STYLE.line.thin, part: 'wire-box-bar' });
    }
  }
}

function keyVisible(P: Proj, key: string): boolean {
  return projVisible(P, signedUnit('xyz'.indexOf(key.charAt(0)), +key.charAt(1) !== 0 ? 1 : -1));
}

function drawEdges(g: SVGGElement, wb: WireGeom, o: WireBoxOpts): void {
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.normal;
  const omit = new Set(o.omit ?? []);
  const all = corners8(wb.P, wb.w, wb.d, wb.h);
  for (const e of CUBE_EDGES) {
    if (omit.has(e.code)) continue;
    let behind = true;
    for (const k of e.fixed) if (keyVisible(wb.P, k)) behind = false;
    const dash = behind && o.hidden !== undefined && o.hidden !== '' ? o.hidden : undefined;
    line(g, at(all, e.i), at(all, e.j), { stroke, width, cap: 'round', dash, part: 'wire-box-edge' });
  }
  const B = extent(wb, wb.other);
  for (const c of o.divide ?? []) {
    const a = c * extent(wb, wb.ax);
    polygon(g, [wirePt(wb, a, 0, 0), wirePt(wb, a, B, 0), wirePt(wb, a, B, wb.h), wirePt(wb, a, 0, wb.h)], {
      fill: 'none', stroke, width, join: 'round', part: 'wire-box-divider',
    });
  }
}

export function wireCell(wb: WireGeom, i: number): { range: Point; center: Point } {
  const a0 = at(wb.cuts, i) * extent(wb, wb.ax);
  const a1 = at(wb.cuts, i + 1) * extent(wb, wb.ax);
  const B = extent(wb, wb.other);
  return { range: [a0, a1], center: wirePt(wb, (a0 + a1) / 2, B / 2, wb.h / 2) };
}

export function wireFloor(wb: WireGeom, i: number, u: number, v: number): Point {
  const [a0, a1] = wireCell(wb, i).range;
  return wirePt(wb, a0 + (a1 - a0) * u, v * extent(wb, wb.other), 0);
}

export function wireBox3(p: Parent, P: Proj, size: V3, o: WireBoxOpts = {}): WireBox {
  const [w, d, h] = size;
  const Q = placedProj(P, size, o);
  const g = el(p, 'g', { 'data-part': o.part ?? 'wire-box' });
  const ax = 'xyz'.indexOf(o.axis ?? 'x');
  const cuts = [0, ...(o.divide ?? []), 1];
  const wb: WireBox = { node: g, P: Q, w, d, h, ax, other: ax === 0 ? 1 : 0, cuts, ports: {} };
  drawTints(g, wb, o);
  if (o.floorLines !== undefined) drawFloorLines(g, wb, o.floorLines);
  drawEdges(g, wb, o);
  const ports: Ports = {
    center: boxCorner(wb, 0.5, 0.5, 0.5), top: boxCorner(wb, 0.5, 0.5, 1), bottom: boxCorner(wb, 0.5, 0.5, 0),
  };
  for (let i = 0; i < cuts.length - 1; i++) ports['c' + i] = wireFloor(wb, i, 0.5, 0.5);
  wb.ports = reg(o.F, o.name, p, ports);
  return wb;
}

export type HoleOpts = Loose<{
  wall: string; floor: string; rim: string; stroke: string; width: number; opacity: number; shading: boolean;
  part: string; F: Figure; name: string;
}>;

export function hole3(p: Parent, P: Proj, c: V3, normal: AxisSpec, r: number, depth: number, o: HoleOpts = {}): { node: SVGGElement; ports: Ports } {
  const n = axis3(normal);
  const g = el(p, 'g', { 'data-part': o.part ?? 'hole', opacity: o.opacity });
  const top = circleD(P, c, n, r);
  const fc = add3(c, n, -depth);
  const wallC = o.wall ?? '#8f98ad';
  const pc = proj3(P, c);
  const pf = proj3(P, fc);
  const fill =
    o.shading === false
      ? wallC
      : userGradient(p, [pc[0] + (pc[0] - pf[0]) * 0.1, pc[1] + (pc[1] - pf[1]) * 0.1], pf, [[0, shade(wallC, -0.3)], [1, shade(wallC, 0.15)]]);
  path(g, top, { fill, part: 'hole-wall' });
  const inner = el(g, 'g', { 'clip-path': clipPath(p, top) });
  path(inner, circleD(P, fc, n, r), { fill: o.floor ?? shade(wallC, 0.35), part: 'hole-floor' });
  const stroke = o.rim ?? o.stroke ?? C.ink;
  if (stroke !== 'none') path(g, top, { fill: 'none', stroke, width: o.width ?? STYLE.line.thin, part: 'hole-rim' });
  return { node: g, ports: reg(o.F, o.name, p, { center: pc, floor: pf }) };
}

export type TilePlateOpts = Loose<{
  pos: V3; nu: number; nv: number; border: number; gap: number; fill: string; faces: FaceFills; stroke: string;
  width: number; bed: string; lip: number; lipFill: string; tileFill: string; tileStroke: string; tileWidth: number;
  manual: boolean; F: Figure; name: string; part: string;
}>;

export interface TilePlate {
  node: SVGGElement;
  P: Proj;
  z: number;
  b: number;
  cu: number;
  cv: number;
  gap: number;
  o: TilePlateOpts;
  ports: Ports;
}

export function tilePlateTile(tp: TilePlate, i: number, j: number): Mapper {
  const x = tp.b + i * tp.cu + tp.gap / 2;
  const y = tp.b + j * tp.cv + tp.gap / 2;
  return { P: tp.P, base: [x, y, tp.z], du: [tp.cu - tp.gap, 0, 0], dv: [0, tp.cv - tp.gap, 0] };
}

export function tilePlateDraw(tp: TilePlate, i: number, j: number): Mapper {
  const T = tilePlateTile(tp, i, j);
  const o = tp.o;
  polygon(tp.node, faceQuad(T, 0, 0, 1, 1), {
    fill: o.tileFill ?? '#bec5d2', stroke: o.tileStroke,
    width: o.tileStroke !== undefined && o.tileStroke !== '' ? (o.tileWidth ?? STYLE.line.hair) : undefined, part: 'plate-tile',
  });
  return T;
}

export function tilePlate3(p: Parent, P: Proj, size: V3, o: TilePlateOpts = {}): TilePlate {
  const [w, d, h] = size;
  const pos = o.pos ?? [0, 0, 0];
  const g = el(p, 'g', { 'data-part': o.part ?? 'tile-plate' });
  const fill = o.fill ?? '#1e3150';
  const lip = o.lip ?? 0;
  if (lip !== 0) {
    obliqueBox(g, P, [w + 2 * lip, d + 2 * lip, h * 0.35], { pos: [pos[0] - lip, pos[1] - lip, pos[2]], fill: o.lipFill ?? shade(fill, 0.2), stroke: 'none', part: 'plate-lip' });
  }
  const box = obliqueBox(g, P, [w, d, h], { pos, fill, faces: o.faces, stroke: o.stroke ?? shade(fill, 0.25), width: o.width ?? STYLE.line.thin, part: 'plate-body' });
  const Q = box.P;
  const b = o.border ?? 0.05 * Math.min(w, d);
  const nu = o.nu ?? 12;
  const nv = o.nv ?? 8;
  polygon(g, [projPt(Q, b, b, h), projPt(Q, w - b, b, h), projPt(Q, w - b, d - b, h), projPt(Q, b, d - b, h)], { fill: o.bed ?? shade(fill, 0.55), part: 'plate-bed' });
  const cu = (w - 2 * b) / nu;
  const cv = (d - 2 * b) / nv;
  const gap = o.gap ?? 0.06 * Math.min(cu, cv);
  const ports: Ports = { center: box.center, top: boxCorner(box, 0.5, 0.5, 1) };
  const tp: TilePlate = { node: g, P: Q, z: h, b, cu, cv, gap, o, ports };
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const T = o.manual === true ? tilePlateTile(tp, i, j) : tilePlateDraw(tp, i, j);
      ports[`t${i}_${j}`] = faceAt(T, 0.5, 0.5);
    }
  }
  reg(o.F, o.name, p, ports);
  return tp;
}
