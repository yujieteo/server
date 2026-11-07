// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/geo.js
import type { Figure, Loose, Paint, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { line, polygon } from './draw.ts';
import { at } from './util.ts';
import type { V3 } from './geo-vec.ts';
import { hull2, reg } from './geo-vec.ts';
import type { Face, FaceKey, Proj } from './geo-proj.ts';
import { faceMapper, projAt, projPt } from './geo-proj.ts';

const C = STYLE.color;

export type AnchorSpec = string | V3;
export type FaceMap = Record<FaceKey, Face>;

export const FACE_KEYS: readonly FaceKey[] = ['x0', 'x1', 'y0', 'y1', 'z0', 'z1'];

const ANCHORS: Record<string, V3> = {
  center: [0.5, 0.5, 0.5], top: [0.5, 0.5, 1], bottom: [0.5, 0.5, 0], origin: [0, 0, 0],
};

export function anchorFrac(a: AnchorSpec): V3 {
  if (typeof a !== 'string') return a;
  const named = ANCHORS[a];
  if (named !== undefined) return named;
  if (/^[01]{3}$/.test(a)) return [Number(a.charAt(0)), Number(a.charAt(1)), Number(a.charAt(2))];
  if (/^[xyz][01]$/.test(a)) {
    const ax = 'xyz'.indexOf(a.charAt(0));
    const v = +a.charAt(1);
    return [ax === 0 ? v : 0.5, ax === 1 ? v : 0.5, ax === 2 ? v : 0.5];
  }
  throw new Error(`obliqueBox: unknown anchor "${a}"`);
}

export interface Dim3 {
  P: Proj;
  w: number;
  d: number;
  h: number;
}

export type PlaceOpts = Loose<{ pos: V3; at: Point; anchor: AnchorSpec }>;

export function placedProj(P: Proj, size: V3, o: PlaceOpts): Proj {
  const pos = o.pos ?? [0, 0, 0];
  const origin0 = projPt(P, pos[0], pos[1], pos[2]);
  if (o.at === undefined) return projAt(P, origin0);
  const fr = anchorFrac(o.anchor ?? 'center');
  const q = projPt(P, pos[0] + fr[0] * size[0], pos[1] + fr[1] * size[1], pos[2] + fr[2] * size[2]);
  return projAt(P, [origin0[0] + o.at[0] - q[0], origin0[1] + o.at[1] - q[1]]);
}

export function boxCorner(b: Dim3, fx: number, fy: number, fz: number): Point {
  return projPt(b.P, fx * b.w, fy * b.d, fz * b.h);
}

export function boxAnchor(b: Dim3, a: AnchorSpec): Point {
  const fr = anchorFrac(a);
  return boxCorner(b, fr[0], fr[1], fr[2]);
}

export function corners8(Q: Proj, w: number, d: number, h: number): Point[] {
  const all: Point[] = [];
  for (let i = 0; i < 8; i++) all.push(projPt(Q, (i & 1) * w, ((i >> 1) & 1) * d, ((i >> 2) & 1) * h));
  return all;
}

export interface CubeEdge {
  i: number;
  j: number;
  fixed: FaceKey[];
  code: string;
}

function buildEdges(): CubeEdge[] {
  const out: CubeEdge[] = [];
  for (let i = 0; i < 8; i++) {
    for (const bit of [1, 2, 4]) {
      const j = i | bit;
      if (j === i) continue;
      const fixed: FaceKey[] = [];
      let code = '';
      for (let a = 0; a < 3; a++) {
        const side = (i >> a) & 1;
        if (1 << a === bit) code += 'xyz'.charAt(a);
        else {
          code += String(side);
          fixed.push(at(FACE_KEYS, a * 2 + side));
        }
      }
      out.push({ i, j, fixed, code });
    }
  }
  return out;
}

export const CUBE_EDGES: readonly CubeEdge[] = buildEdges();

export function anyVisible(faces: FaceMap, keys: readonly FaceKey[]): boolean {
  for (const k of keys) if (faces[k].visible) return true;
  return false;
}

export function makeFaces(Q: Proj, size: V3): FaceMap {
  return {
    x0: faceMapper(Q, 'x0', size), x1: faceMapper(Q, 'x1', size),
    y0: faceMapper(Q, 'y0', size), y1: faceMapper(Q, 'y1', size),
    z0: faceMapper(Q, 'z0', size), z1: faceMapper(Q, 'z1', size),
  };
}

export function keysWhere(faces: FaceMap, visible: boolean): FaceKey[] {
  const out: FaceKey[] = [];
  for (const k of FACE_KEYS) if (faces[k].visible === visible) out.push(k);
  return out;
}

export type EdgeStyle = Loose<{ dash: string; stroke: string; width: number }>;
export type GhostOpts = Loose<{
  dash: string; stroke: string; width: number; solid: readonly string[]; fill: string; fillOpacity: number;
}>;
export type FaceFills = Loose<Record<FaceKey | 'top' | 'bottom', string>>;

export type ObliqueBoxOpts = Loose<{
  pos: V3; at: Point; anchor: AnchorSpec; fill: string; top: string; faces: FaceFills; stroke: string; width: number;
  join: string; opacity: number; back: boolean; backFill: string; backOpacity: number; seal: boolean;
  hidden: boolean | EdgeStyle; ghost: boolean | GhostOpts; F: Figure; name: string; part: string;
}>;

export interface Box extends Dim3 {
  node: SVGGElement;
  faces: FaceMap;
  visible: FaceKey[];
  center: Point;
  ports: Ports;
}

function boxFill(o: ObliqueBoxOpts, k: FaceKey): string {
  const base = o.fill ?? o.top ?? '#dfe6ee';
  const ov = o.faces ?? {};
  if (k === 'z1' && ov.top !== undefined) return ov.top;
  if (k === 'z0' && ov.bottom !== undefined) return ov.bottom;
  const own = ov[k];
  if (own !== undefined) return own;
  return k.charAt(0) === 'z' ? base : k.charAt(0) === 'x' ? shade(base, -0.25) : shade(base, -0.12);
}

interface BoxDraw {
  g: SVGGElement;
  faces: FaceMap;
  all: Point[];
  o: ObliqueBoxOpts;
  stroke: string;
  width: number;
  st: Paint;
}

function firstSide(vis: readonly FaceKey[]): FaceKey | undefined {
  for (const k of vis) if (k.charAt(0) !== 'z') return k;
  return undefined;
}

function drawSolid(c: BoxDraw, vis: readonly FaceKey[], hid: readonly FaceKey[]): void {
  const { g, faces, all, o, st } = c;
  if (o.back === true) {
    for (const k of hid) {
      polygon(g, faces[k].corners, { fill: o.backFill ?? boxFill(o, k), fillOpacity: o.backOpacity ?? 0.35, part: 'box-back' });
    }
  }
  if (o.seal === true) {
    polygon(g, hull2(all), { fill: boxFill(o, firstSide(vis) ?? at(vis, 0)), part: 'box-seal' });
  }
  for (const ch of 'yxz') {
    for (const k of vis) {
      if (k.charAt(0) === ch) polygon(g, faces[k].corners, { fill: boxFill(o, k), fillOpacity: o.opacity, ...st, part: `face-${k}` });
    }
  }
}

function drawGhost(c: BoxDraw, ghost: GhostOpts): void {
  const { g, faces, all } = c;
  if (ghost.fill !== undefined && ghost.fill !== '') {
    polygon(g, hull2(all), { fill: ghost.fill, fillOpacity: ghost.fillOpacity ?? 0.15, part: 'ghost-fill' });
  }
  const solid = new Set(ghost.solid ?? []);
  for (const e of CUBE_EDGES) {
    if (!anyVisible(faces, e.fixed)) continue;
    const sol = solid.has(e.code);
    line(g, at(all, e.i), at(all, e.j), {
      stroke: ghost.stroke ?? c.stroke, width: ghost.width ?? c.width,
      dash: sol ? undefined : (ghost.dash ?? '1.3 0.9'), part: sol ? 'ghost-edge-solid' : 'ghost-edge',
    });
  }
}

function drawHidden(c: BoxDraw, hs: EdgeStyle): void {
  for (const e of CUBE_EDGES) {
    if (anyVisible(c.faces, e.fixed)) continue;
    line(c.g, at(c.all, e.i), at(c.all, e.j), {
      stroke: hs.stroke ?? c.stroke, width: hs.width ?? STYLE.line.hair, dash: hs.dash ?? '1.2 0.9', part: 'hidden-edge',
    });
  }
}

export function obliqueBox(p: Parent, P: Proj, size: V3, o: ObliqueBoxOpts = {}): Box {
  const [w, d, h] = size;
  const Q = placedProj(P, size, o);
  const g = el(p, 'g', { 'data-part': o.part ?? 'oblique-box' });
  const faces = makeFaces(Q, size);
  const vis = keysWhere(faces, true);
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.thin;
  const st: Paint = stroke === 'none' ? {} : { stroke, width, join: o.join ?? 'round' };
  const c: BoxDraw = { g, faces, all: corners8(Q, w, d, h), o, stroke, width, st };
  const ghost = o.ghost === undefined || o.ghost === false ? null : o.ghost === true ? {} : o.ghost;
  if (ghost === null) drawSolid(c, vis, keysWhere(faces, false));
  else drawGhost(c, ghost);
  if (o.hidden !== undefined && o.hidden !== false) drawHidden(c, o.hidden === true ? {} : o.hidden);
  const box: Dim3 = { P: Q, w, d, h };
  const center = boxCorner(box, 0.5, 0.5, 0.5);
  const ports: Ports = { center, top: boxCorner(box, 0.5, 0.5, 1), bottom: boxCorner(box, 0.5, 0.5, 0) };
  for (const k of vis) ports[k] = faces[k].center;
  reg(o.F, o.name, p, ports);
  return { node: g, P: Q, faces, visible: vis, center, ports, w, d, h };
}
