// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/lightscene3.js
import type { Figure, FigureOpts, Point } from '../engine/types.ts';
import type { V3 } from '../engine/geo-vec.ts';
import * as L from '../engine/lib.ts';

export const figure: FigureOpts = { width: 120, height: 52, name: 'lightscene3', format: 'journal', illustrate: true };

const BEAM = '#D55E00';
const GLASS = '#cfe3ec';
const Z = 11;
const Y = 14;
const CORNERS: readonly Point[] = [[-7, -8], [7, -8], [7, 8], [-7, 8]];
const SCREEN_CORNERS: readonly Point[] = [[-8, -8], [8, -8], [8, 8], [-8, 8]];

function ring(c: V3, axis: 'x' | 'y', r: number, n: number = 24): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const a = r * Math.cos(t);
    const b = r * Math.sin(t);
    out.push(axis === 'x' ? [c[0], c[1] + a, c[2] + b] : [c[0] + a, c[1], c[2] + b]);
  }
  return out;
}

function slide(pts: readonly V3[], d: V3, q0: V3, n: V3): V3[] {
  const out: V3[] = [];
  for (const q of pts) {
    const s = ((q0[0] - q[0]) * n[0] + (q0[1] - q[1]) * n[1] + (q0[2] - q[2]) * n[2]) / (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]);
    out.push([q[0] + d[0] * s, q[1] + d[1] * s, q[2] + d[2] * s]);
  }
  return out;
}

function mirrorPoint(mc: V3, mt: V3, a: number, b: number): V3 {
  return [mc[0] + mt[0] * a, mc[1] + mt[1] * a, mc[2] + b];
}

function screenPoint(sc: V3, a: number, b: number): V3 {
  return [sc[0] + a, sc[1], sc[2] + b];
}

function world(corners: readonly Point[], f: 'mirror' | 'screen', c: V3, mt: V3): V3[] {
  const out: V3[] = [];
  for (const [a, b] of corners) out.push(f === 'mirror' ? mirrorPoint(c, mt, a, b) : screenPoint(c, a, b));
  return out;
}

function page(P: L.Proj, pts: readonly V3[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) out.push(L.proj3(P, q));
  return out;
}

function slot(out: L.Scene3Out, name: string): L.Handle {
  const h = out.slots[name];
  if (h === undefined) throw new Error(`no slot ${name}`);
  return h;
}

export default function draw(F: Figure): void {
  const p = F.panel('a', { x: 0, y: 0, w: 120, h: 52 });
  const g = p.node;
  const P = L.projAt(L.obliqueProj({ preset: 'cabinet', scale: 3.2 }), [20, 128]);
  L.obliqueBox(g, P, [76, 36, 2], { pos: [-4, -3, -2], fill: '#e4e8ee' });
  const S = L.lightScene3(g, P);
  const th = (20 * Math.PI) / 180;
  const pn: V3 = [Math.cos(th), Math.sin(th), 0];
  const pt: V3 = [-Math.sin(th), Math.cos(th), 0];
  const pc: V3 = [22, Y, Z];
  L.sceneLens(S, 'plate', { c: pc, axis: pn, e1: [0, 0, 8], e2: [pt[0] * 8, pt[1] * 8, pt[2] * 8], t: 1.6, glass: GLASS });
  const mc: V3 = [46, Y, Z];
  const mn: V3 = [-Math.SQRT1_2, Math.SQRT1_2, 0];
  const mt: V3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
  L.sceneSurface(S, 'mirror', { point: mc, normal: mn, pts: world(CORNERS, 'mirror', mc, mt) });
  const sc: V3 = [46, 36, Z];
  const sn: V3 = [0, -1, 0];
  L.sceneSurface(S, 'screen', { point: sc, normal: sn, pts: world(SCREEN_CORNERS, 'screen', sc, mt) });
  const r = 1.4;
  const d1: V3 = [1, 0, 0];
  const d2: V3 = [0, 1, 0];
  L.sceneBeam(S, [
    ring([4, Y, Z], 'x', r),
    { at: 'plate', pts: slide(ring([22, Y, Z], 'x', r), d1, pc, pn) },
    { at: 'mirror', pts: slide(ring([46, Y, Z], 'x', r), d1, mc, mn) },
    { at: 'screen', pts: slide(ring([46, 30, Z], 'y', r), d2, sc, sn) },
  ], { color: BEAM, opacity: 0.55 });
  const out = L.sceneDraw(S);
  const ink = L.STYLE.color.ink;
  L.polygon(slot(out, 'mirror'), page(P, world(CORNERS, 'mirror', mc, mt)), { fill: '#dfe7ee', stroke: ink, width: 0.5 });
  L.polygon(slot(out, 'screen'), page(P, world(SCREEN_CORNERS, 'screen', sc, mt)), { fill: '#f3f3f3', stroke: ink, width: 0.5 });
  L.text(g, 103, 44, 'Plate', { size: 6, anchor: 'middle' });
  L.text(g, 157, 42, 'Mirror', { size: 6, anchor: 'middle' });
  L.text(g, 208, 20, 'Screen', { size: 6, anchor: 'middle' });
}
