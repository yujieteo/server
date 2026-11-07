// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/geo-ribbons.js
import type { Figure, FigureOpts, Panel, Parent, Point } from '../engine/types.ts';
import * as L from '../engine/lib.ts';
import { at } from '../engine/util.ts';
import type { V3 } from '../engine/geo-vec.ts';

export const figure: FigureOpts = { width: 183, height: 150, name: 'geo-ribbons' };

const C = L.STYLE.color;

function cap(p: Parent, x: number, y: number, s: string): void {
  L.text(p, x, y, s, { size: 5.5, anchor: 'middle', color: C.mid });
}

function chips(a: Parent, P: L.Proj): L.Box[] {
  const faces = { y1: '#9dbdf5', x1: '#8fb0ea' };
  const chipA = L.obliqueBox(a, P, [70, 60, 6], { pos: [0, 0, 0], fill: '#dde8fb', faces, stroke: '#3c5fa8', width: 0.3 });
  const chipB = L.obliqueBox(a, P, [60, 60, 6], { pos: [150, 70, 0], fill: '#dde8fb', faces, stroke: '#3c5fa8', width: 0.3 });
  for (const ch of [chipA, chipB]) {
    const top = ch.faces.z1;
    L.polygon(a, L.faceQuad(top, 0.2, 0.2, 0.8, 0.8), { fill: '#c8deff', stroke: '#0d62fe', width: 0.3 });
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) L.circle3(a, ch.P, L.faceWorld(top, 0.28 + i * 0.11, 0.28 + j * 0.11), 'z', 0.9, { fill: '#5a57d6' });
    }
  }
  return [chipA, chipB];
}

function panelA(F: Figure): void {
  const a = F.panel('a', { x: 1, y: 1, w: 118, h: 49 });
  const P = L.obliqueProj({ preset: 'isometric', scale: 0.6, origin: [140, 18] });
  const chipB = at(chips(a, P), 1);
  L.ribbon3(a, chipB.P, [[8, 52], [8, 8], [52, 8]], 4, { plane: chipB.faces.z1, radius: 10, fill: '#f0c419', stroke: '#8a6d00', width: 0.25 });
  const rb = L.ribbon3(a, P, [[56, 30], [110, 30], [110, 100], [166, 100]], 24, {
    n: 6, radius: [16, 16], fill: '#fcd5e5', fillOpacity: 0.9, stroke: '#f58bbd', edge: '#d2256f', width: 0.3,
    highlight: 2, highlightFill: '#d2256f', plane: { origin: [0, 0, 6] }, F, name: 'flex',
  });
  cap(a, 150, 128, 'ribbon3: 6 channels, fillets r = 16');
  const q: Point = [158, 34];
  const wq = L.projInv(P, q, 6);
  L.circle3(a, P, wq, 'z', 4, { stroke: C.vermillion, width: 0.4 });
  L.line(a, [q[0] - 2, q[1]], [q[0] + 2, q[1]], { stroke: C.ink, width: 0.3 });
  L.line(a, [q[0], q[1] - 2], [q[0], q[1] + 2], { stroke: C.ink, width: 0.3 });
  L.callout(a, L.ppAt(rb.path, 0.5, 2).page, [236, 70], 'highlighted channel', { size: 5.5, anchor: 'start' });
  L.callout(a, q, [232, 42], `P.inv(q, 6) = (${wq[0].toFixed(1)}, ${wq[1].toFixed(1)}, ${wq[2].toFixed(1)})`, { size: 5, anchor: 'start' });
}

function panelB(F: Figure): void {
  const b = F.panel('b', { x: 121, y: 1, w: 61, h: 49 });
  const Pb = L.obliqueProj({ preset: 'isometric', scale: 0.75, origin: [80, 30] });
  const TL = 120;
  const TW = 80;
  const plus: Point[] = [[0, 0], [TL, 0], [TL, 25], [TL + 12, 25], [TL + 12, 55], [TL, 55], [TL, TW], [0, TW], [0, 55], [-12, 55], [-12, 25], [0, 25]];
  L.prism3(b, Pb, plus, 0, 5, { fill: '#d6dbe4', stroke: '#8b97ad', width: 0.3, F, name: 'plate' });
  const tray = L.tray3(b, Pb, [100, 64, 18], { pos: [10, 8, 5], wall: 3, floor: 2, fill: '#c9d2df', stroke: '#56627a', width: 0.3, F, name: 'tray' });
  const [x0, y0, , , z] = tray.interior;
  const sites: V3[] = [];
  const depths: number[] = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 4; i++) {
      const s: V3 = [x0 + 3 + i * 23, y0 + 3 + j * 28, z];
      sites.push(s);
      depths.push(L.projDepth(tray.P, s));
    }
  }
  for (const k of L.orderBy(depths)) {
    L.obliqueBox(tray.mid, tray.P, [20, 24, 22], { pos: at(sites, k), fill: '#98a3b8', faces: { y1: '#808ca4', x1: '#717d95' }, stroke: '#3e4a60', width: 0.3 });
  }
  cap(b, 86, 128, 'prism3 plate, tray3 with contents');
}

function panelC(F: Figure): void {
  const c = F.panel('c', { x: 1, y: 51, w: 60, h: 49 });
  const Pc = L.obliqueProj({ preset: 'isometric', scale: 0.7, origin: [55, 30] });
  L.obliqueBox(c, Pc, [60, 40, 26], { pos: [15, 12, 0], fill: '#4d98cd', faces: { y1: '#7fb3db', x1: '#6fa7d4' }, stroke: '#3e86bd', width: 0.3 });
  L.obliqueBox(c, Pc, [90, 64, 40], { ghost: { solid: ['x11', '1y1'], stroke: '#61708a', width: 0.35 }, F, name: 'ghost' });
  cap(c, 55, 118, 'ghost, solid x11 and 1y1');
  const Pc2 = L.obliqueProj({ preset: 'cabinet', scale: 0.8, origin: [118, 100] });
  L.obliqueBox(c, Pc2, [40, 40, 34], { ghost: { fill: '#88c5e9', fillOpacity: 0.2 }, hidden: { stroke: '#98a2b6' }, stroke: '#23201f', width: 0.35 });
  cap(c, 138, 118, 'cabinet, + hidden');
}

function panelD(F: Figure): void {
  const d = F.panel('d', { x: 62, y: 51, w: 60, h: 49 });
  const Pd = L.obliqueProj({ preset: 'isometric', scale: 0.55, origin: [80, 50] });
  const wall: V3[] = [[0, 60, 0], [120, 60, 0], [120, 60, 50], [60, 60, 72], [0, 60, 50]];
  const door: V3[] = [[18, 60, 0], [40, 60, 0], [40, 60, 38], [18, 60, 38]];
  const win: V3[] = [[62, 60, 22], [96, 60, 22], [96, 60, 40], [62, 60, 40]];
  L.poly3(d, Pd, [[0, 0, 0], [120, 0, 0], [120, 60, 0], [0, 60, 0]], { fill: '#eef0e4', stroke: '#8b97ad', width: 0.3 });
  L.poly3(d, Pd, [wall, door, win], { fill: '#e0e4eb', stroke: '#61708a', width: 0.35 });
  const roof: V3[] = [[0, 0, 80], [120, 0, 80], [120, 55, 80], [0, 55, 80]];
  const hatch: V3[] = [[40, 15, 80], [80, 15, 80], [80, 38, 80], [40, 38, 80]];
  for (const x of [0, 120]) L.line3(d, Pd, [x, 0, 0], [x, 0, 80], { stroke: '#98a2b6', width: 0.3, dash: '1.3 0.9' });
  L.poly3(d, Pd, [roof, hatch], { fill: '#88c5e9', fillOpacity: 0.6, stroke: '#3f86ba', width: 0.35 });
  cap(d, 86, 118, 'poly3 rings, even-odd holes');
}

function panelE(F: Figure): void {
  const e = F.panel('e', { x: 123, y: 51, w: 59, h: 49 });
  const Pe = L.obliqueProj({ preset: 'isometric', scale: 0.7, origin: [90, 55] });
  L.wheel3(e, Pe, [0, -10, 30], 'y', 30, 16, {});
  L.cylinder3(e, Pe, [0, -2, 30], [0, 92, 30], 3.5, 3.5, { fill: '#9aa6ba', width: 0.3 });
  L.wheel3(e, Pe, [0, 100, 30], 'y', 30, 16, { shading: true, F, name: 'wheel' });
  const Pe2 = L.obliqueProj({ preset: 'cabinet', scale: 0.6, origin: [130, 95] });
  L.wheel3(e, Pe2, [20, 0, 30], '-y', 26, 14, { spokes: 5, window: [0.3, 0.55, 0.5], fill: '#23201f', rimFill: '#d6dbe4', windowFill: '#5a6475', phase: 0.3 });
  cap(e, 86, 118, 'wheel3: isometric pair, cabinet');
}

function art(F: Figure, g: Parent, Pq: L.Proj, variant: boolean, measure: boolean): void {
  const tray = L.tray3(g, Pq, [80, 50, 12], { wall: 2.5, fill: '#d6dbe4', stroke: '#61708a', width: 0.3 });
  const [x0, y0, , , z] = tray.interior;
  L.tubeArray3(tray.mid, tray.P, { rows: 3, cols: 5, pitch: [14.5, 14.5], origin: [x0 + 8, y0 + 8, z] }, 5.2, variant ? 22 : 14, {
    fill: variant ? '#88c5e9' : '#ffffff', holeFill: '#dfe6ee', width: 0.3,
  });
  if (!measure && !variant) {
    const c = L.projPt(Pq, 40, 25, 12);
    F.anchor('fit.center', g, c[0], c[1]);
  }
}

function fitted(F: Figure, f: Panel, box: L.Rect, o: L.FitOpts, variant: boolean): L.Fit {
  const probe = L.fitProbe(f, o);
  art(F, probe.node, probe.P, variant, true);
  const fit = L.fitPlace(f, probe, box, o);
  art(F, fit.node, fit.P, variant, false);
  return fit;
}

function panelF(F: Figure): void {
  const f = F.panel('f', { x: 1, y: 101, w: 181, h: 48 });
  const box1 = { x: 20, y: 18, w: 150, h: 104 };
  const box2 = { x: 200, y: 18, w: 110, h: 104 };
  const box3 = { x: 340, y: 18, w: 150, h: 104 };
  for (const bx of [box1, box2, box3]) L.rect(f, bx.x, bx.y, bx.w, bx.h, { stroke: C.light, width: 0.3, dash: '1.2 0.9' });
  const frac: L.FitOpts['frac'] = [0.05, 0.95, 0.05, 0.95];
  const fit = fitted(F, f, box1, { frac }, false);
  fitted(F, f, box2, { frac }, false);
  fitted(F, f, box3, { scale: fit.scale, offset: fit.offset }, true);
  cap(f, box1.x + box1.w / 2, 132, `fitted (scale ${fit.scale.toFixed(2)})`);
  cap(f, box2.x + box2.w / 2, 132, 'fitted into a narrower box');
  cap(f, box3.x + box3.w / 2, 132, 'pose of the first reused: taller tubes');
}

export default function draw(F: Figure): void {
  panelA(F);
  panelB(F);
  panelC(F);
  panelD(F);
  panelE(F);
  panelF(F);
}
