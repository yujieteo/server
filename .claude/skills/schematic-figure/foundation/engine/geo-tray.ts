// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, Loose, Paint, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { polygon } from './draw.ts';
import type { V3 } from './geo-vec.ts';
import { reg } from './geo-vec.ts';
import type { Proj } from './geo-proj.ts';
import { projPt, projVisible } from './geo-proj.ts';
import type { AnchorSpec } from './geo-box.ts';
import { placedProj } from './geo-box.ts';

const C = STYLE.color;

type TrayKey = 'y0' | 'x1' | 'y1' | 'x0';

export type TrayOpts = Loose<{
  pos: V3; at: Point; anchor: AnchorSpec; wall: number; floor: number; fill: string;
  faces: Loose<Record<TrayKey, string>>; inner: string; floorFill: string; rim: string; stroke: string;
  width: number; opacity: number; F: Figure; name: string; part: string;
}>;

export interface Tray {
  node: SVGGElement;
  P: Proj;
  back: SVGGElement;
  mid: SVGGElement;
  front: SVGGElement;
  interior: [number, number, number, number, number];
  ports: Ports;
}

const KEYS: readonly TrayKey[] = ['y0', 'x1', 'y1', 'x0'];
const OPPOSITE: Record<TrayKey, TrayKey> = { x0: 'x1', x1: 'x0', y0: 'y1', y1: 'y0' };
const NORMALS: Record<TrayKey, V3> = { y0: [0, -1, 0], x1: [1, 0, 0], y1: [0, 1, 0], x0: [-1, 0, 0] };

interface TrayCtx {
  Q: Proj;
  h: number;
  fl: number;
  o: TrayOpts;
  base: string;
  pf: Paint;
  out: Point[];
  inn: Point[];
}

function outerFill(c: TrayCtx, k: TrayKey): string {
  return c.o.faces?.[k] ?? (k.charAt(0) === 'x' ? shade(c.base, -0.25) : shade(c.base, -0.12));
}

function q3(c: TrayCtx, a: Point, z: number): Point {
  return projPt(c.Q, a[0], a[1], z);
}

function pointAt(list: readonly Point[], i: number): Point {
  const q = list[i % 4];
  if (q === undefined) throw new Error('tray corner missing');
  return q;
}

function floorPts(c: TrayCtx): Point[] {
  const out: Point[] = [];
  for (const a of c.inn) out.push(q3(c, a, c.fl));
  return out;
}

function drawRim(c: TrayCtx, i: number, grp: SVGGElement): void {
  const pts = [q3(c, pointAt(c.out, i), c.h), q3(c, pointAt(c.out, i + 1), c.h), q3(c, pointAt(c.inn, i + 1), c.h), q3(c, pointAt(c.inn, i), c.h)];
  polygon(grp, pts, { fill: c.o.rim ?? c.base, ...c.pf, part: 'tray-rim' });
}

function drawFarWall(c: TrayCtx, back: SVGGElement, i: number): void {
  const a = pointAt(c.inn, i);
  const b = pointAt(c.inn, i + 1);
  const k = KEYS[i];
  if (k === undefined) return;
  polygon(back, [q3(c, a, c.fl), q3(c, b, c.fl), q3(c, b, c.h), q3(c, a, c.h)], {
    fill: c.o.inner ?? shade(outerFill(c, OPPOSITE[k]), -0.08), ...c.pf, part: 'tray-inner-wall',
  });
}

function yFirst(near: readonly number[]): number[] {
  const out: number[] = [];
  for (const ch of 'yx') {
    for (const i of near) if (KEYS[i]?.charAt(0) === ch) out.push(i);
  }
  return out;
}

function drawNearWalls(c: TrayCtx, front: SVGGElement, near: readonly number[]): void {
  for (const i of near) {
    const k = KEYS[i];
    if (k === undefined) continue;
    const a = pointAt(c.out, i);
    const b = pointAt(c.out, i + 1);
    polygon(front, [q3(c, a, 0), q3(c, b, 0), q3(c, b, c.h), q3(c, a, c.h)], { fill: outerFill(c, k), ...c.pf, part: `tray-wall-${k}` });
  }
}

export function tray3(p: Parent, P: Proj, size: V3, o: TrayOpts = {}): Tray {
  const [w, d, h] = size;
  const Q = placedProj(P, size, o);
  const t = o.wall ?? 0.08 * Math.min(w, d);
  const fl = o.floor ?? t;
  const g = el(p, 'g', { 'data-part': o.part ?? 'tray' });
  const back = el(g, 'g', { 'data-part': 'tray-back' });
  const mid = el(g, 'g', { 'data-part': 'tray-contents' });
  const front = el(g, 'g', { 'data-part': 'tray-front' });
  const base = o.fill ?? '#dfe6ee';
  const stroke = o.stroke ?? C.ink;
  const st: Paint = stroke === 'none' ? {} : { stroke, width: o.width ?? STYLE.line.thin, join: 'round' };
  const out: Point[] = [[0, 0], [w, 0], [w, d], [0, d]];
  const inn: Point[] = [[t, t], [w - t, t], [w - t, d - t], [t, d - t]];
  const c: TrayCtx = { Q, h, fl, o, base, pf: { fillOpacity: o.opacity, ...st }, out, inn };
  polygon(back, floorPts(c), { fill: o.floorFill ?? shade(base, -0.06), ...c.pf, part: 'tray-floor' });
  const near: number[] = [];
  const far: number[] = [];
  for (let i = 0; i < 4; i++) {
    const k = KEYS[i];
    if (k !== undefined && projVisible(Q, NORMALS[k])) near.push(i);
    else far.push(i);
  }
  for (const i of far) drawFarWall(c, back, i);
  for (const i of far) drawRim(c, i, back);
  const ordered = yFirst(near);
  drawNearWalls(c, front, ordered);
  for (const i of ordered) drawRim(c, i, front);
  const ports = reg(o.F, o.name, p, {
    center: projPt(Q, w / 2, d / 2, h / 2), top: projPt(Q, w / 2, d / 2, h),
    floor: projPt(Q, w / 2, d / 2, fl), bottom: projPt(Q, w / 2, d / 2, 0),
  });
  return { node: g, P: Q, back, mid, front, interior: [t, t, w - t, d - t, fl], ports };
}
