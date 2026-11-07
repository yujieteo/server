// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, Loose, Paint, Parent, Point, Ports, Rect } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { path, polygon } from './draw.ts';
import { at } from './util.ts';
import type { AxisSpec, V3 } from './geo-vec.ts';
import { add3, axis3, orderBy, reg, unit3 } from './geo-vec.ts';
import type { ObliqueOpts, Proj } from './geo-proj.ts';
import { obliqueProj, proj3, projDepth, projPt, projVisible } from './geo-proj.ts';
import { circleD, cylinder3, ringBasis } from './geo-cyl.ts';

const C = STYLE.color;

export type PrismOpts = Loose<{
  fill: string; top: string; side: string; sideX: string; stroke: string; width: number; opacity: number;
  F: Figure; name: string; part: string;
}>;

export interface PrismFace {
  i: number;
  pts: Point[];
  normal: V3;
}

export interface Prism {
  node: SVGGElement;
  top: Point[];
  faces: PrismFace[];
  ports: Ports;
}

interface RawFace {
  i: number;
  q: V3[];
  normal: V3;
}

function ringArea(xy: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = at(xy, i);
    const b = at(xy, (i + 1) % xy.length);
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area;
}

function prismSides(P: Proj, xy: readonly Point[], z0: number, z1: number): { faces: RawFace[]; deps: number[] } {
  const sg = ringArea(xy) > 0 ? 1 : -1;
  const faces: RawFace[] = [];
  const deps: number[] = [];
  for (let i = 0; i < xy.length; i++) {
    const a = at(xy, i);
    const b = at(xy, (i + 1) % xy.length);
    const normal = unit3([sg * (b[1] - a[1]), -sg * (b[0] - a[0]), 0]);
    if (!projVisible(P, normal)) continue;
    const q: V3[] = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]];
    faces.push({ i, q, normal });
    deps.push(projDepth(P, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2]));
  }
  return { faces, deps };
}

export function prism3(p: Parent, P: Proj, xy: readonly Point[], z0: number, z1: number, o: PrismOpts = {}): Prism {
  const g = el(p, 'g', { 'data-part': o.part ?? 'prism' });
  const n = xy.length;
  const base = o.fill ?? o.top ?? '#dfe6ee';
  const stroke = o.stroke ?? C.ink;
  const st: Paint = stroke === 'none' ? {} : { stroke, width: o.width ?? STYLE.line.thin, join: 'round' };
  const raw = prismSides(P, xy, z0, z1);
  const faces: PrismFace[] = [];
  for (const fi of orderBy(raw.deps)) {
    const f = at(raw.faces, fi);
    const xs = Math.abs(f.normal[0]) >= Math.abs(f.normal[1]);
    const fill = xs ? (o.sideX ?? o.side ?? shade(base, -0.25)) : (o.side ?? shade(base, -0.12));
    const pts: Point[] = [];
    for (const q of f.q) pts.push(proj3(P, q));
    polygon(g, pts, { fill, fillOpacity: o.opacity, ...st, part: 'prism-side' });
    faces.push({ i: f.i, pts, normal: f.normal });
  }
  const zc = projVisible(P, [0, 0, 1]) ? z1 : z0;
  const top: Point[] = [];
  for (const [x, y] of xy) top.push(projPt(P, x, y, zc));
  polygon(g, top, { fill: base, fillOpacity: o.opacity, ...st, part: 'prism-top' });
  let sx = 0;
  let sy = 0;
  for (const q of xy) {
    sx += q[0];
    sy += q[1];
  }
  const ports = reg(o.F, o.name, p, { top: projPt(P, sx / n, sy / n, z1), bottom: projPt(P, sx / n, sy / n, z0) });
  return { node: g, top, faces, ports };
}

export type WheelOpts = Loose<{
  fill: string; capFill: string; rim: number; rimFill: string; hub: number; hubFill: string; spokes: number;
  window: V3; windowFill: string; windowStroke: string; phase: number; stroke: string; width: number;
  shading: boolean; F: Figure; name: string; part: string;
}>;

export interface Wheel {
  node: SVGGElement;
  P: Proj;
  face: 'c0' | 'c1' | null;
  origin: V3;
  e1: V3;
  e2: V3;
  r: number;
  ports: Ports;
}

export function wheelAt(w: Wheel, rho: number, phi: number): Point {
  return proj3(w.P, add3(add3(w.origin, w.e1, rho * w.r * Math.cos(phi)), w.e2, rho * w.r * Math.sin(phi)));
}

function drawSpokes(g: SVGGElement, w: Wheel, o: WheelOpts): void {
  const ns = o.spokes ?? 7;
  const [w0, w1, wf] = o.window ?? [0.22, 0.56, 0.6];
  const ph = o.phase ?? 0;
  const m = 12;
  const edge: Paint = o.windowStroke !== undefined && o.windowStroke !== '' ? { stroke: o.windowStroke, width: STYLE.line.hair } : {};
  for (let k = 0; k < ns; k++) {
    const p0 = ph + ((k + (1 - wf) / 2) / ns) * 2 * Math.PI;
    const p1 = ph + ((k + (1 + wf) / 2) / ns) * 2 * Math.PI;
    const pts: Point[] = [];
    for (let i = 0; i <= m; i++) pts.push(wheelAt(w, w1, p0 + ((p1 - p0) * i) / m));
    for (let i = m; i >= 0; i--) pts.push(wheelAt(w, w0, p0 + ((p1 - p0) * i) / m));
    polygon(g, pts, { fill: o.windowFill ?? '#3f4e68', ...edge, part: 'wheel-window' });
  }
}

export function wheel3(p: Parent, P: Proj, c: V3, axis: AxisSpec, r: number, tread: number, o: WheelOpts = {}): Wheel {
  const a = axis3(axis);
  const c0 = add3(c, a, -tread / 2);
  const c1 = add3(c, a, tread / 2);
  const tyre = o.fill ?? '#344661';
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.thin;
  const st: Paint = stroke === 'none' ? {} : { stroke, width };
  const cy = cylinder3(p, P, c0, c1, r, r, { fill: tyre, capFill: o.capFill ?? shade(tyre, -0.12), stroke, width, shading: o.shading, part: o.part ?? 'wheel' });
  const faceC = cy.cap === 'c1' ? c1 : cy.cap === 'c0' ? c0 : null;
  const [e1, e2] = ringBasis(P, a);
  const ports: Ports = { center: proj3(P, c), hub: proj3(P, faceC ?? c), a: proj3(P, c0), b: proj3(P, c1) };
  const w: Wheel = { node: cy.node, P, face: cy.cap, origin: faceC ?? c, e1, e2, r, ports };
  if (faceC !== null) {
    path(cy.node, circleD(P, faceC, a, r * (o.rim ?? 0.64)), { fill: o.rimFill ?? '#a3afc3', ...st, part: 'wheel-rim' });
    drawSpokes(cy.node, w, o);
    path(cy.node, circleD(P, faceC, a, r * (o.hub ?? 0.18)), { fill: o.hubFill ?? '#e1e6ee', ...st, part: 'wheel-hub' });
  }
  reg(o.F, o.name, p, ports);
  return w;
}

export type FitOpts = Loose<{
  frac: readonly [number, number, number, number]; proj: ObliqueOpts; scale: number; offset: Point; part: string;
}>;

export interface FitProbe {
  node: SVGGElement;
  P: Proj;
}

export interface Fit {
  node: SVGGElement;
  P: Proj;
  scale: number;
  offset: Point;
  bbox: Rect;
}

function fitProj(o: FitOpts, s: number, origin: Point): Proj {
  return obliqueProj({ ...o.proj, scale: (o.proj?.scale ?? 1) * s, origin });
}

export function fitProbe(p: Parent, o: FitOpts = {}): FitProbe {
  return { node: el(p, 'g', {}), P: fitProj(o, 1, [0, 0]) };
}

export function fitPlace(p: Parent, probe: FitProbe, box: Rect, o: FitOpts = {}): Fit {
  const [fx0, fx1, fy0, fy1] = o.frac ?? [0, 1, 0, 1];
  const bb = probe.node.getBBox();
  probe.node.remove();
  if (!(bb.width > 0 || bb.height > 0)) throw new Error('fitArt: the drawing is empty');
  const tw = (fx1 - fx0) * box.w;
  const th = (fy1 - fy0) * box.h;
  const s = o.scale ?? Math.min(bb.width > 0 ? tw / bb.width : Infinity, bb.height > 0 ? th / bb.height : Infinity);
  const cx = box.x + ((fx0 + fx1) / 2) * box.w;
  const cy = box.y + ((fy0 + fy1) / 2) * box.h;
  const offset: Point = o.offset ?? [cx - s * (bb.x + bb.width / 2) - box.x, cy - s * (bb.y + bb.height / 2) - box.y];
  const origin: Point = [box.x + offset[0], box.y + offset[1]];
  const g = el(p, 'g', { 'data-part': o.part ?? 'fit-art' });
  const bbox: Rect = { x: origin[0] + s * bb.x, y: origin[1] + s * bb.y, w: s * bb.width, h: s * bb.height };
  return { node: g, P: fitProj(o, s, origin), scale: s, offset, bbox };
}
