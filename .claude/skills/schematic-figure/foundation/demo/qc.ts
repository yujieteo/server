// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/qc.js
import type { Figure, FigureOpts, Paint, Panel, Parent, Point } from '../engine/types.ts';
import * as L from '../engine/lib.ts';
import * as D from '../engine/qc.ts';
import { at } from '../engine/util.ts';

export const figure: FigureOpts = { width: 183, height: 178, name: 'qc' };

const C = L.STYLE.color;
const PURPLE = '#7754a2';
const PINK = '#ee2e7c';
const ORANGE = '#f27621';
const PINKX = '#FF7497';
const GREENZ = '#00CC96';
const BL = '#0072B2';
const OR = '#E69F00';

function cap(p: Parent, x: number, y: number, s: string): void {
  L.text(p, x, y, s, { size: L.STYLE.text.small, color: C.mid, anchor: 'middle' });
}

function singleParts(a: Panel, F: Figure): void {
  D.qwire(a, 12, 222, 22, { segments: [[12, 50, 'idle'], [180, 222, 'idle']] });
  D.qwire(a, 12, 222, 44, { classical: true });
  D.ket(a, 10, 22, '+');
  D.ket(a, 10, 44, '0', {});
  D.qcontrol(a, 60, 22);
  D.qcontrol(a, 76, 22, { open: true });
  D.qtarget(a, 92, 22);
  D.cnot(a, 112, 22, 44, { F, name: 'cx1' });
  D.cnot(a, 130, 22, 44, { kind: 'z' });
  D.gateBox(a, 150, 22, 'H');
  D.qmeter(a, 170, 22, { basis: 'X', basisPos: 'inside', h: 13, w: 11 });
  D.qmeter(a, 190, 22, { basis: 'Z' });
  D.badge(a, 150, 64, 'X', C.vermillion);
  D.badge(a, 168, 64, 'Z', C.blue, { shape: 'circle' });
  D.ket(a, 205, 66, 'ψ', { anchor: 'middle', bra: true });
  D.ketColumn(a, 40, [60, 70, 80], ['0', '+', '1']);
}

function multiParts(a: Panel): void {
  D.qwire(a, 12, 172, 100);
  D.qwire(a, 12, 222, 118);
  D.qswap(a, 30, 100, 118);
  D.gateBox(a, 58, 100, 'U', { y2: 118, w: 10 });
  D.gateBox(a, 86, 100, '', { rounded: true, w: 9, h: 9 });
  D.gateBox(a, 86, 118, '', { rounded: true, w: 9, h: 9, shadow: true });
  D.cnot(a, 108, 100, 118, { kind: 'z', color: PINK });
  D.qmeter(a, 136, 100, { y2: 118, basis: 'ZZ', w: 12 });
  D.qmeter(a, 172, 100, { output: 30, head: 2.2 });
  D.qmeter(a, 172, 118, { basis: 'X', basisPos: 'none' });
}

function panelA(F: Figure): void {
  const a = F.panel('a', { x: 1, y: 1, w: 80, h: 46 });
  singleParts(a, F);
  multiParts(a);
}

function colX(c: D.CircuitOut, col: number): number {
  return D.circuitX(c, col);
}

function wireY(c: D.CircuitOut, q: number): number {
  return D.circuitY(c, q);
}

function cycleFrames(back: L.Handle, c: D.CircuitOut): void {
  D.slantFrame(back, {
    top: wireY(c, 0) - 12, bottom: wireY(c, 3) + 16, xTopL: colX(c, 0.5), xTopR: colX(c, 4.5), xBotL: colX(c, 1.5), xBotR: colX(c, 6.5),
    yKneeTop: wireY(c, 1) - 4, yKneeBot: wireY(c, 2) + 4, dash: '2 1.2', label: 'cycle', labelAt: [colX(c, 2.5), wireY(c, 3) + 26],
  });
  D.slantFrame(back, {
    top: wireY(c, 0) - 12, bottom: wireY(c, 3) + 16, xTopL: colX(c, 6.5), xBotL: colX(c, 7.5), band: colX(c, 8.6) - colX(c, 7.5),
    yKneeTop: wireY(c, 1) - 4, yKneeBot: wireY(c, 2) + 4, stroke: 'none', fill: C.sky, fillOpacity: 0.18,
    label: 'Next cycle', labelColor: C.blue, labelAt: [colX(c, 7.5), wireY(c, 3) + 26],
  });
}

function panelB(F: Figure): void {
  const b = F.panel('b', { x: 84, y: 1, w: 98, h: 60 });
  const wires: D.WireSpec[] = [{ id: 'aX', init: '+', label: 'X' }, { id: 'L', label: 'L' }, { id: 'R', label: 'R' }, { id: 'aZ', init: '0', label: 'Z' }];
  const back = L.group(b, { part: 'frames' });
  const gates: D.CircuitGate[] = [
    { g: 'gate', q: 'L', col: 1, label: 'H' }, { g: 'cnot', c: 'aX', t: 'L', col: 2 }, { g: 'cnot', c: 'aX', t: 'R', col: 3 },
    { g: 'cnot', c: 'L', t: 'aZ', col: 5 }, { g: 'cz', c: 'R', t: 'aZ', col: 6 },
    { g: 'meter', q: 'aX', col: 7, basis: 'X' }, { g: 'meter', q: 'aZ', col: 8, basis: 'Z' },
  ];
  const c = D.circuit(b, { x: 40, y: 40, wires, cols: 8, colW: 22, pitch: 30, header: 'Round:', dividers: [4], activeSpan: true, F, name: 'circ', gates });
  cycleFrames(back, c);
}

function panelC(F: Figure): void {
  const cc = F.panel('c', { x: 1, y: 50, w: 80, h: 62 });
  const mw: D.WireSpec[] = [];
  for (let i = 0; i < 9; i++) mw.push({ id: `w${i}`, dot: ORANGE });
  const gates: D.CircuitGate[] = [
    { g: 'gate', q: 0, col: 1, label: '' }, { g: 'cz', c: 0, t: 1, col: 2 }, { g: 'link', c: 2, t: 3, col: 2, color: PINK },
    { g: 'gate', q: 4, col: 1, label: '' }, { g: 'cz', c: 3, t: 5, col: 3 }, { g: 'link', c: 1, t: 7, col: 4, color: PINK },
    { g: 'swap', a: 6, b: 8, col: 3 }, { g: 'gate', q: 0, q2: 1, col: 5, label: 'U' }, { g: 'gate', q: 6, col: 5, label: '' },
    { g: 'meter', q: 4, q2: 5, col: 6, basis: 'XX' }, { g: 'meter', q: 8, col: 7, output: 8 },
  ];
  D.circuit(cc, {
    x: 52, y: 22, wires: mw, cols: 7, colW: 23, pitch: 17, lead: 8, tail: 8, rounded: true, gateW: 10, gateH: 10, gates,
    groups: [{ from: 0, to: 2, label: 'M_{1}' }, { from: 3, to: 5, label: 'M_{2}' }, { from: 6, to: 8, label: 'M_{N}' }],
  });
}

function tannerNodes(): D.TannerGrid<D.TannerNode> {
  const rows: D.TannerNode[][] = [];
  for (let j = 0; j < 6; j++) {
    const row: D.TannerNode[] = [];
    for (let i = 0; i < 8; i++) {
      if (j % 2 === 0) row.push(i % 2 === 0 ? { shape: 'square', color: PINKX } : { color: OR });
      else row.push(i % 2 === 0 ? { color: BL } : { shape: 'square', color: GREENZ });
    }
    rows.push(row);
  }
  return rows;
}

function tannerEdges(horizontal: boolean): D.TannerGrid<Paint> {
  const rows: Paint[][] = [];
  for (let j = 0; j < 6; j++) {
    const row: Paint[] = [];
    for (let i = 0; i < 8; i++) {
      const dashed = !horizontal || i % 2 === 0;
      row.push(dashed ? { dash: '0.4 0.5', width: 0.4 } : { width: 0.35 });
    }
    rows.push(row);
  }
  return rows;
}

function codes(d: Panel): void {
  const sc = D.surfaceCode(d, 22, 30, { d: 3, pitch: 22, xColor: PINKX, zColor: GREENZ });
  cap(d, 44, 110, 'surfaceCode (tanner)');
  D.curveLeader(d, [[100, 20], [88, 8], [72, 12], [D.affineAt(sc.X, 2) + 3, D.affineAt(sc.Y, 0) - 5]]);
  L.text(d, 101, 23, 'data', { size: 6 });
  D.surfaceCode(d, 112, 36, { d: 3, pitch: 18, style: 'plaquette', xColor: PINKX, zColor: GREENZ });
  cap(d, 130, 110, 'surfaceCode (plaquette)');
  const TX = 176;
  const TY = 22;
  const dxT = 12;
  D.tannerLattice(d, { x: TX, y: TY, cols: 8, rows: 6, dx: dxT, dy: 11, overhang: 6, nodes: tannerNodes(), hEdges: tannerEdges(true), vEdges: tannerEdges(false) });
  D.torusFrame(d, TX - 6, TY - 6, 7 * dxT + 12, 5 * 11 + 12, { width: 0.7, size: 2.6 });
  cap(d, TX + 42, 110, 'tannerLattice + torusFrame');
}

function badges(d: Panel): void {
  D.badge(d, 20, 140, 'L', BL, { shape: 'circle', stack: 3 });
  D.badge(d, 44, 140, 'Z', GREENZ, { stack: 3 });
  D.badge(d, 66, 140, '', PINKX, { shape: 'round', s: 6 });
  D.badge(d, 84, 140, 'X', PINKX, { solid: true });
  D.qubit(d, 104, 140, 3.2, ORANGE, { shadow: true });
  D.qubit(d, 116, 140, 3.2, PURPLE, { label: 'n' });
  D.doubleLine(d, [130, 140], [150, 140]);
  D.doubleLine(d, [160, 132], [160, 148], { n: 3, gap: 1.4, width: 0.5 });
  D.doubleLine(d, [172, 140], [206, 140], { heads: 'both', gap: 1.4 });
  cap(d, 60, 158, 'badge: stack, round, solid; qubit');
  cap(d, 168, 158, 'doubleLine: n = 2, 3, heads');
}

function panelD(F: Figure): void {
  const d = F.panel('d', { x: 84, y: 64, w: 98, h: 60 });
  codes(d);
  badges(d);
}

const YEL = '#FFC000';
const RAIL = '#ED7D31';
const LIZ = '#9B59C3';
const PITCH = 17;
const X0 = 10;
const YT = 56;
const YB = 100;
const YI = 82;
const ION_BLUE = '#1d43f2';
const ION_RED = '#ec2a18';

function trapHardware(e: Panel): void {
  D.trapRail(e, X0, 110, 200, 17, { color: RAIL, dx: 4, dy: 2.7, notches: { x0: X0 + 16, pitch: PITCH, n: 11, edge: 'top', w: 2 } });
  D.segmentRow(e, X0 + 6, 118, { n: 12, pitch: PITCH, w: 15, h: 17, dx: 4, dy: 2.7, color: YEL, fadeEnds: 2, highlight: { 7: LIZ }, labels: { 7: 'LIZ' } });
  D.segmentRow(e, X0, 26, { n: 12, pitch: PITCH, w: 15, h: 17, dx: 4, dy: 2.7, color: YEL, fadeEnds: 2, highlight: { 7: LIZ } });
  D.trapRail(e, X0 + 12, 34, 200, 17, { color: RAIL, dx: 4, dy: 2.7, notches: { x0: X0 + 26, pitch: PITCH, n: 11, edge: 'bottom', w: 2, h: 2.3 } });
  const xb = X0 + 6 + 7 * PITCH + 7.5;
  D.laserBeam(e, [xb - 70, 2], [xb, 82], [xb + 66, 158], { w0: 3, wIn: 22, wOut: 5, opacity: 0.6 });
}

function wellsAndIons(e: Panel): void {
  D.potentialWell(e, 30, YT, YB, { hw: 11, power: 1.75, ghosts: [-6, -3] });
  D.ion(e, 30, YI, 2.6, ION_BLUE);
  L.arrow(e, [33, YI], [41, YI], { head: 2.2, width: 0.45 });
  D.potentialWell(e, 82, YT, YB, { hw: 17, kind: 'double', barrier: 0.3 });
  D.ion(e, 78, YI, 2.6, ION_BLUE);
  D.ion(e, 86, YI, 2.6, ION_RED);
  L.arrow(e, [75, YI], [67, YI], { head: 2.2, width: 0.45 });
  L.arrow(e, [89, YI], [97, YI], { head: 2.2, width: 0.45 });
  const xL = X0 + 6 + 7 * PITCH + 7.5;
  D.potentialWell(e, xL, YT, YB, { hw: 11 });
  D.coupling(e, [xL - 3.5, YI], [xL + 3.5, YI], { n: 5, h: 3, blur: 0.25, width: 0.35 });
  D.ion(e, xL - 3.5, YI, 2.6, ION_BLUE);
  D.ion(e, xL + 3.5, YI, 2.6, ION_RED);
  D.potentialWell(e, 196, YT, YB, { hw: 9 });
  D.ion(e, 192.5, YI, 2.6, ION_BLUE);
  D.ion(e, 199.5, YI, 2.6, ION_RED);
  D.swapArrows(e, [192.5, YI], [199.5, YI], { r: 3.4, head: 1.8, width: 0.45, bend: 0.5 });
}

function panelE(F: Figure): void {
  const e = F.panel('e', { x: 1, y: 115, w: 80, h: 62 });
  trapHardware(e);
  wellsAndIons(e);
}

function panelF(F: Figure): void {
  const f = F.panel('f', { x: 84, y: 127, w: 98, h: 50 });
  D.enclosure(f, 188, 78, 120, 44, { angle: -8, r: 16, shadow: true });
  const m1 = D.moduleNode(f, 70, 40, 18, { highlight: { 2: PURPLE }, color: ORANGE, shadow: true, rotate: -90 });
  const m2 = D.moduleNode(f, 150, 80, 18, { highlight: { 0: PURPLE }, color: ORANGE, rotate: 180 });
  const m3 = D.moduleNode(f, 226, 70, 18, { highlight: { 2: PURPLE }, color: ORANGE, rotate: 0, n: 3, edges: 'ring' });
  D.entangleLink(f, at(m2.qubits, 0), at(m3.qubits, 2), { halfTurns: 6, amp: 2.2, dots: true });
  D.doubleLine(f, [182, 40], [200, 58], { heads: 'both', gap: 1.4, width: 0.45 });
  L.text(f, 204, 44, 'classical', { size: 5 });
  const dets: [number, number][] = [[108, -45], [126, 45]];
  for (const [yy, ang] of dets) D.photonDetector(f, 16, yy, 4.5, { angle: ang });
  L.line(f, [21, 117], [36, 117], { width: 0.8 });
  L.path(f, 'M20,111 L28,117 L20,123', { stroke: C.mid, width: 0.45 });
  const q2: Point = at(m1.qubits, 2);
  L.path(f, `M28,117 C45,117 45,${q2[1] + 30} 66,57.5`, { stroke: C.ink, width: 0.6 });
  D.photon(f, 38, 104, { angle: -30, head: true });
  D.photon(f, 95, 112, { angle: 10, len: 10, cycles: 4 });
  L.path(f, 'M28,117 C60,125 110,120 132,80', { stroke: C.ink, width: 0.6 });
  cap(f, 116, 30, 'moduleNode');
  cap(f, 190, 124, 'enclosure + entangleLink');
}

export default function draw(F: Figure): void {
  panelA(F);
  panelB(F);
  panelC(F);
  panelD(F);
  panelE(F);
  panelF(F);
}
