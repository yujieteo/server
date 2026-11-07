// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/light3.js
import type { Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade, ramp } from './style.ts';
import { polygon, path } from './draw.ts';
import { projVec } from './geo-proj.ts';
import { add3, dPts, hull2, orOne, scale3 } from './geo-vec.ts';
import type { Box, LensItem, Scene3, Scene3Out, SegItem, Tint } from './light3-a.ts';
import { bbox, boxHit, fillOf, gradient, nextId, pageOf } from './light3-a.ts';
import { defsOf } from './svgdefs.ts';
import { at, f3 } from './util.ts';
import { depthOrder, resolveBeams } from './light3-b.ts';

const C = STYLE.color;

interface Region {
  sil: Point[];
  tint: Tint | null;
  k: number;
  tag: string;
  skip: boolean;
}

function regionsOf(it: SegItem): Region[] {
  const out: Region[] = [];
  for (const L of it.front) {
    if (!it.blends.includes(L) && boxHit(L.box, it.box)) {
      out.push({ sil: L.sil, tint: { to: L.seen.tint, amount: L.seen.mix * 1 }, k: L.seen.transmission, tag: 'through-glass', skip: false });
    }
  }
  for (const L of it.blends) out.push({ sil: L.sil, tint: null, k: 1, tag: '', skip: true });
  for (const V of it.veils) {
    if (V.box !== null && V.sil !== null && boxHit(V.box, it.box)) out.push({ sil: V.sil, tint: null, k: V.veil, tag: 'on-surface', skip: false });
  }
  return out;
}

function paintSegment(S: Scene3, root: SVGGElement, it: SegItem): void {
  const part = it.style.part ?? 'beam';
  const regions = regionsOf(it);
  if (regions.length === 0) {
    polygon(root, it.page, { ...fillOf(S.P, root, it, C.beamGreen, null), part });
    return;
  }
  const [x0, y0, x1, y1]: Box = it.box;
  const id = `l3m${nextId()}`;
  const m = el(defsOf(root), 'mask', { id, maskUnits: 'userSpaceOnUse', x: f3(x0 - 2), y: f3(y0 - 2), width: f3(x1 - x0 + 4), height: f3(y1 - y0 + 4) });
  el(m, 'rect', { x: f3(x0 - 2), y: f3(y0 - 2), width: f3(x1 - x0 + 4), height: f3(y1 - y0 + 4), fill: '#fff' });
  for (const R of regions) el(m, 'path', { d: dPts(R.sil), fill: '#000' });
  const gOut = el(root, 'g', { mask: `url(#${id})`, 'data-part': part });
  polygon(gOut, it.page, fillOf(S.P, root, it, C.beamGreen, null));
  for (const R of regions) {
    if (R.skip) continue;
    const cid = `l3c${nextId()}`;
    const cp = el(defsOf(root), 'clipPath', { id: cid });
    el(cp, 'path', { d: dPts(R.sil) });
    const gIn = el(root, 'g', { 'clip-path': `url(#${cid})`, 'data-part': `${part}-${R.tag}` });
    polygon(gIn, it.page, fillOf(S.P, root, it, C.beamGreen, R.tint, R.k));
  }
}

function isBlend(L: LensItem): boolean {
  return L.s.blend !== undefined && L.s.blend !== false;
}

function paintInner(S: Scene3, g: SVGGElement, L: LensItem): void {
  if (isBlend(L)) return;
  const tint: Tint = { to: L.seen.tint, amount: L.seen.mix * 1.4 };
  for (const q of L.inner) {
    const fake = { style: q.style, i: 0, total: 1, a3: at(q.pts, 0), b3: at(q.pts, q.pts.length - 1) };
    polygon(g, hull2(pageOf(S.P, q.pts)), fillOf(S.P, g, fake, C.beamGreen, tint, L.seen.transmission));
  }
}

function uniqueBeams(segs: readonly SegItem[]): number[] {
  const out: number[] = [];
  for (const q of segs) if (!out.includes(q.beam)) out.push(q.beam);
  return out;
}

function paintBlend(S: Scene3, g: SVGGElement, L: LensItem): void {
  const blend = L.s.blend;
  if (blend === undefined || blend === false) return;
  const bo = blend === true ? {} : blend;
  const cid = `l3c${nextId()}`;
  const cp = el(defsOf(g), 'clipPath', { id: cid });
  el(cp, 'path', { d: dPts(L.sil) });
  for (const bi of uniqueBeams(L.blendSegs)) {
    const segs: SegItem[] = [];
    for (const q of L.blendSegs) if (q.beam === bi) segs.push(q);
    const st0 = at(segs, 0).style;
    const gB = el(g, 'g', { 'clip-path': `url(#${cid})`, opacity: f3((st0.opacity ?? 0.3) * (bo.k ?? L.seen.transmission)), 'data-part': `${st0.part ?? 'beam'}-through-glass` });
    const col = ramp([st0.color ?? C.beamGreen, L.seen.tint], Math.min(1, bo.mix ?? L.seen.mix));
    const pc = { fill: col, stroke: col, width: 0.4, join: 'miter' };
    for (const q of segs) polygon(gB, q.page, pc);
    for (const q of L.inner) if (q.beam === bi) polygon(gB, hull2(pageOf(S.P, q.pts)), pc);
  }
}

function highlightDir(L: LensItem): Point {
  const h = L.s.highlight;
  return h === false || h === undefined ? [-0.8, -0.6] : (h.dir ?? [-0.8, -0.6]);
}

function paintHighlight(S: Scene3, g: SVGGElement, L: LensItem, hd: Point): void {
  const h = L.s.highlight;
  if (h === false) return;
  const hs = h ?? {};
  const rad = hs.at ?? 0.88;
  const span = ((hs.span ?? 55) * Math.PI) / 180;
  let best = 0;
  let bs = -Infinity;
  for (let k = 0; k < 360; k++) {
    const tt = (k / 360) * 2 * Math.PI;
    const q = projVec(S.P, add3(scale3(L.e1, Math.cos(tt)), L.e2, Math.sin(tt)));
    const sc = (q[0] * hd[0] + q[1] * hd[1]) / orOne(Math.hypot(q[0], q[1]));
    if (sc > bs) {
      bs = sc;
      best = tt;
    }
  }
  const c0 = add3(L.point, L.axis, (L.front * L.t) / 2);
  const arc: Point[] = [];
  for (let k = 0; k < 25; k++) {
    const tt = best - span + (2 * span * k) / 24;
    arc.push(pageOf(S.P, [add3(add3(c0, L.e1, rad * Math.cos(tt)), L.e2, rad * Math.sin(tt))])[0] ?? [0, 0]);
  }
  path(g, dPts(arc, false), { stroke: '#ffffff', width: hs.width ?? 0.8, opacity: hs.opacity ?? 0.9, part: 'lens-highlight' });
}

function faceGradient(g: SVGGElement, L: LensItem, face: readonly Point[], hd: Point): string {
  const [bx0, by0, bx1, by1] = bbox(face);
  const hl = orOne(Math.hypot(hd[0], hd[1]));
  const cx = (bx0 + bx1) / 2;
  const cy = (by0 + by1) / 2;
  const rr = Math.max(bx1 - bx0, by1 - by0) / 2;
  const ga: Point = [cx + (hd[0] / hl) * rr, cy + (hd[1] / hl) * rr];
  const gb: Point = [cx - (hd[0] / hl) * rr, cy - (hd[1] / hl) * rr];
  const stops = L.s.face ?? [[0, '#ffffff', 0.45], [0.35, L.glass, 0.06], [1, shade(L.glass, -0.15), 0.25]];
  return gradient(g, ga, gb, stops);
}

function paintLens(S: Scene3, root: SVGGElement, L: LensItem, out: Scene3Out): void {
  const s = L.s;
  const g = el(root, 'g', { 'data-part': 'lens' });
  const stroke = s.stroke ?? shade(L.glass, -0.5);
  const width = s.width ?? STYLE.line.thin;
  paintInner(S, g, L);
  const face = pageOf(S.P, L.faceRing);
  path(g, dPts(L.sil) + dPts(face), { fill: s.rim ?? shade(L.glass, -0.12), fillOpacity: s.rimOpacity ?? 0.6, part: 'lens-rim' }).setAttribute('fill-rule', 'evenodd');
  path(g, dPts(L.sil), { stroke, width, part: 'lens-edge' });
  const hd = highlightDir(L);
  polygon(g, face, { fill: faceGradient(g, L, face, hd), part: 'lens-face' });
  paintBlend(S, g, L);
  paintHighlight(S, g, L, hd);
  path(g, dPts(face), { stroke, width: s.faceWidth ?? width * 1.25, part: 'lens-outline' });
  out.lenses[L.name] = { silhouette: L.sil, face };
}

export function sceneDraw(S: Scene3): Scene3Out {
  resolveBeams(S);
  const order = depthOrder(S);
  const root = el(S.p, 'g', { 'data-part': S.o.part ?? 'light-scene' });
  const out: Scene3Out = { slots: S.slots, order: [], lenses: {}, segments: [] };
  for (const it of order) {
    out.order.push(it.kind === 'seg' ? `beam${it.beam}.${it.i}` : it.name);
    if (it.kind === 'surface') {
      S.slots[it.name] = { node: el(root, 'g', { 'data-part': `surface-${it.name}` }) };
    } else if (it.kind === 'seg') {
      out.segments.push({ page: it.page, beam: it.beam });
      paintSegment(S, root, it);
    } else {
      paintLens(S, root, it, out);
    }
  }
  return out;
}
