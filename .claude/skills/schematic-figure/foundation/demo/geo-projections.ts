// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/geo-projections.js
import type { Figure, FigureOpts, Parent } from '../engine/types.ts';
import * as L from '../engine/lib.ts';
import * as S from '../engine/cs.ts';
import { at } from '../engine/util.ts';
import type { TubeOpts } from '../engine/geo-tube.ts';

export const figure: FigureOpts = { width: 183, height: 150, name: 'geo-projections' };

const C = L.STYLE.color;

function cap(p: Parent, x: number, y: number, s: string): void {
  L.text(p, x, y, s, { size: 5.5, anchor: 'middle', color: C.mid });
}

function boxesIsometric(a: Parent, F: Figure): void {
  const iso = L.obliqueProj({ preset: 'isometric' });
  const b1 = L.obliqueBox(a, iso, [56, 40, 34], { at: [62, 80], anchor: 'center', fill: '#e6ecf3', F, name: 'isoBox' });
  const win = b1.faces.x1;
  const lf = b1.faces.y1;
  L.polygon(a, L.faceQuad(win, 0.15, 0.2, 0.55, 0.65), { fill: '#bcd6ea', stroke: C.ink, width: 0.3 });
  L.knob3(a, b1.P, L.faceWorld(win, 0.78, 0.45), win, 3.4, 4.5, { side: '#f0c419', face: '#ffffff' });
  L.polygon(a, L.faceQuad(lf, 0.1, 0.35, 0.9, 0.55), { fill: '#3a3f47' });
  const fg1 = L.faceGroup(a, lf, 0.1, 0.85);
  L.text(fg1, 0, 0, 'isometric', { size: 5.5 / fg1.scale, color: C.ink });
  L.knob3(a, b1.P, L.faceWorld(b1.faces.z1, 0.3, 0.5), 'z', 2.8, 3, { side: '#d55e00', face: '#f6c9a8' });
  cap(a, 62, 136, 'obliqueBox · isometric');
}

function boxesCabinet(a: Parent, F: Figure): void {
  const cab = L.obliqueProj({ preset: 'cabinet' });
  const b2 = L.obliqueBox(a, cab, [60, 44, 36], { at: [150, 142], anchor: '000', fill: '#eef0e4', hidden: true, F, name: 'cabBox' });
  const fr = b2.faces.y0;
  const sd = b2.faces.x1;
  L.polygon(a, L.faceQuad(fr, 0.1, 0.2, 0.5, 0.7), { fill: '#bcd6ea', stroke: C.ink, width: 0.3 });
  L.knob3(a, b2.P, L.faceWorld(fr, 0.75, 0.45), fr, 4, 5, { side: '#f0c419', shading: true });
  L.circle3(a, b2.P, L.faceWorld(sd, 0.5, 0.5), sd, 5, { fill: '#3a3f47', stroke: C.ink, width: 0.3 });
  const fg2 = L.faceGroup(a, b2.faces.z1, 0.08, 0.7);
  L.text(fg2, 0, 0, 'cabinet', { size: 5.5 / fg2.scale, color: C.ink });
  cap(a, 190, 158, 'obliqueBox · cabinet, hidden edges');
  L.axes3(a, [170, 58], L.projVec(cab, [26, 0, 0]), L.projVec(cab, [0, 44, 0]), L.projVec(cab, [0, 0, 24]), { labels: ['x', 'y', 'z'] });
}

function panelA(F: Figure): void {
  const a = F.panel('a', { x: 1, y: 1, w: 90, h: 66 });
  boxesIsometric(a, F);
  boxesCabinet(a, F);
}

function panelB(F: Figure): void {
  const b = F.panel('b', { x: 93, y: 1, w: 89, h: 66 });
  const P2 = L.obliqueProj({ preset: 'cabinet', origin: [40, 120] });
  L.cylinder3(b, P2, [0, 150, 0], [0, 172, 0], 13, 6, { fill: '#8e9aaf', shading: true, capFill: '#cfe6f3' });
  L.cylinder3(b, P2, [0, 0, 0], [0, 150, 0], 13, 13, {
    fill: '#b8bec6', shading: true, streak: true, bands: [{ t0: 0.62, t1: 0.7, fill: '#d55e00' }], F, name: 'barrel',
  });
  cap(b, 70, 170, 'cylinder3 along y (receding)');
  const P3 = L.obliqueProj({ preset: 'isometric', origin: [150, 60] });
  L.cylinder3(b, P3, [0, 0, 0], [52, 0, 0], 9, 9, { fill: '#c2c8d0', shading: true, streak: { at: 0.5 }, bands: [{ t0: 0.2, t1: 0.26, fill: '#0072b2' }] });
  L.cylinder3(b, P3, [52, 0, 0], [68, 0, 0], 9, 3.5, { fill: '#9aa3ae', shading: true, capFill: '#cfe6f3' });
  L.text(b, 160, 110, 'objective (isometric x)', { size: 5.5, color: C.mid });
  const P4 = L.obliqueProj({ preset: 'isometric', origin: [150, 150] });
  L.cylinder3(b, P4, [0, 0, 0], [0, 0, 36], 12, 0, { fill: '#56b4e9', shading: true });
  L.cylinder3(b, P4, [40, -40, 0], [40, -40, 5], 16, 16, { fill: '#e9e9e9', capFill: '#f6f6f6' });
  cap(b, 150, 170, 'cone, disc (isometric z)');
}

function matrixCellColors(U: readonly (readonly number[])[]): (string | undefined)[][] {
  const out: (string | undefined)[][] = [];
  for (const row of U) {
    const r: (string | undefined)[] = [];
    for (const v of row) r.push(v < 0 ? C.vermillion : undefined);
    out.push(r);
  }
  return out;
}

function delimiters(c: Parent): void {
  const kinds: L.DelimKind[] = ['(', '[', '|', '‖'];
  for (let i = 0; i < kinds.length; i++) {
    const k = at(kinds, i);
    const x = 150 + i * 16;
    const h = 14 + i * 12;
    L.delim(c, k, x, 44 - h / 2, 44 + h / 2);
    L.text(c, x + 2, 80, k, { size: 5, color: C.mid });
  }
  L.delim(c, ')', 226, 22, 66);
}

function panelC(F: Figure): void {
  const c = F.panel('c', { x: 1, y: 69, w: 90, h: 38 });
  const U = [[1, 0, 1, 0, 1, -1, 0], [0, 0, 0, 0, 1, 0, 1], [0, 1, 0, 0, 0, 1, 0], [1, 1, 0, 1, 0, 0, -1]];
  L.text(c, 12, 44, '**U**  =', { size: 7, valign: 'middle' });
  const M = L.texMatrix(c, 36, 44, U, {
    size: 7, colGap: 8, rowTint: ['#e8f5ef', null, '#e8f5ef', null], cellColors: matrixCellColors(U), F, name: 'U',
  });
  cap(c, M.x0 + M.w / 2, M.y1 + 9, 'texMatrix 4×7: hanging minus, row tints');
  delimiters(c);
  const math = L.STYLE.font.math;
  const rr = S.richRow(c, 140, 92, ['loss', { s: 'ℒ', family: math, italic: true }, '=', { s: 'λ', family: math, italic: true }, 'KL'], { size: 7 });
  for (const s of [at(rr.spans, 1), at(rr.spans, 3)]) {
    L.rect(c, s.x0 - 0.6, s.y0, s.x1 - s.x0 + 1.2, s.y1 - s.y0, { fill: '#fdf1e3', stroke: C.orange, width: 0.25 });
  }
  c.node.appendChild(rr.node);
  cap(c, 195, 103, 'delim kinds; richRow spans');
}

function patentSolids(d: Parent): { plate: L.Box; body: L.Box } {
  const Pp = L.obliqueProj({ preset: 'angles', angle: 24, depth: 1, origin: [36, 150] });
  const ink = { stroke: '#000', width: 0.6 };
  const faces = { x1: '#ffffff', y0: '#ffffff' };
  const body = L.obliqueBox(d, Pp, [100, 80, 45], { fill: '#ffffff', faces, ...ink });
  const plate = L.obliqueBox(d, Pp, [112, 90, 5], { pos: [-6, -5, 60], fill: '#ffffff', faces, ...ink });
  L.polygon(d, L.faceQuad(plate.faces.z1, 0.12, 0.15, 0.88, 0.85), { fill: '#ffffff', stroke: '#000', width: 0.4 });
  for (const u of [0.05, 0.95]) {
    for (const v of [0.08, 0.5, 0.92]) {
      L.circle3(d, plate.P, L.faceWorld(plate.faces.z1, u, v), 'z', 2.2, { fill: '#fff', stroke: '#000', width: 0.4 });
    }
  }
  return { plate, body };
}

function panelD(F: Figure): void {
  const d = F.panel('d', { x: 93, y: 69, w: 89, h: 80 });
  const { plate, body } = patentSolids(d);
  const n = { stroke: '#000', width: 0.4, color: '#000', size: 6.5 };
  L.numeral(d, 20, 22, '101', { ...n, to: { to: L.faceAt(plate.faces.z1, 0.3, 0.3), bend: -0.25 } });
  L.numeral(d, 232, 28, '103', { ...n, to: { to: L.boxAnchor(plate, '111'), wavy: true, bend: 0.18, head: 'solid' } });
  const lead: L.LeaderSpec[] = [{ to: L.faceAt(body.faces.x1, 0.4, 0.5), bend: 0.2 }, { to: L.faceAt(body.faces.x1, 0.8, 0.8), bend: -0.2, head: 'dot' }];
  L.numeral(d, 236, 118, '105', { ...n, to: lead });
  L.numeral(d, 12, 196, '107', { ...n, to: { to: L.faceAt(body.faces.y0, 0.3, 0.6), bend: 0.3, head: 'solid' } });
  const at109 = L.faceAt(body.faces.y0, 0.72, 0.45);
  L.numeral(d, at109[0], at109[1], '109', { ...n, underline: true });
  L.numeral(d, 150, 214, '111', { ...n, to: { to: L.faceAt(body.faces.y0, 0.9, 0.95), via: [[172, 196]], head: 'arrow' } });
  cap(d, 126, 226, 'obliqueProj angles 24°; numeral / leader (curved, wavy, heads), underline');
}

function panelE(F: Figure): void {
  const e = F.panel('e', { x: 1, y: 108, w: 90, h: 41 });
  const Pt = L.obliqueProj({ preset: 'cabinet', angle: 35, depth: 0.55, origin: [22, 100] });
  L.obliqueBox(e, Pt, [104, 70, 10], { fill: '#e5e1d8', part: 'holder' });
  const each: (TubeOpts | undefined)[] = [];
  for (let i = 0; i < 7; i++) each.push(undefined);
  each.push({ fill: '#56b4e9', capFill: '#a9d8f5', holeFill: '#2a6f97' });
  L.tubeArray3(e, Pt, { rows: 3, cols: 5, pitch: [19, 22], origin: [12, 13, 10] }, 7.5, 14, {
    fill: '#ffffff', holeFill: '#dfe6ee', width: 0.4, each,
  });
  cap(e, 70, 111, 'tubeArray3 (back to front)');
  const Pv = L.obliqueProj({ preset: 'cabinet', angle: 40, depth: 0.6, origin: [165, 100] });
  L.voxels3(e, Pv, [3, 3, 3], { size: 13, filled: [[0, 0, 0], [1, 1, 0], [2, 2, 0], [2, 0, 2]] });
  L.tube3(e, Pv, [72, 0, 0], 9, 26, { fill: '#ffffff', holeDepth: 3, holeFill: '#cfd3d8', shading: true });
  cap(e, 205, 111, 'voxels3, tube3 with bore');
}

export default function draw(F: Figure): void {
  panelA(F);
  panelB(F);
  panelC(F);
  panelD(F);
  panelE(F);
}
