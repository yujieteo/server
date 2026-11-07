// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/patent.js
import type { Figure, FigureOpts, Parent, Point, Ports } from '../engine/types.ts';
import type { Proj } from '../engine/geo-proj.ts';
import type { V3 } from '../engine/geo-vec.ts';
import * as L from '../engine/lib.ts';

function sheetNumber(): number {
  const n = parseInt(new URL(import.meta.url).searchParams.get('sheet') ?? '1', 10);
  return Math.min(3, Math.max(1, Number.isNaN(n) || n === 0 ? 1 : n));
}

const SHEET = sheetNumber();

export const figure: FigureOpts = { format: 'patent', sheet: 'letter', sheetId: `${SHEET}/3`, name: `patent-${SHEET}`, numerals: 'patent-numerals.md' };

const WH = { fill: '#ffffff' };
const HW = 5 * 1.1 * Math.SQRT2 * 0.866;

function pt(P: Proj, x: number, y: number, z: number): Point {
  return L.projPt(P, x, y, z);
}

function attr(e: Element | null): string {
  return e?.getAttribute('d') ?? '';
}

function bodyD(c: L.Cyl): string {
  return `${attr(c.node.querySelector('[data-part=cylinder-body]'))} ${attr(c.node.querySelector('[data-part=cylinder-cap]'))}`;
}

function lead(p: Parent, s: string, from: Point, to: Point, curve: number = 0.3, assembly: boolean = false): void {
  L.numeralTo(p, from[0], from[1], s, to, { curve, assembly: assembly ? true : undefined });
}

function threads(p: Parent, P: Proj): void {
  for (let z = 40; z <= 160; z += 7) {
    const c = pt(P, 160, 60, z);
    L.line(p, [c[0] - HW, c[1] + 1.4], [c[0] + HW, c[1] - 1.4], { stroke: '#000', width: 0.5 });
  }
}

function perspective(p: Parent, P: Proj): void {
  L.obliqueBox(p, P, [200, 120, 18], { pos: [0, 0, 0], ...WH, width: 0.9 });
  const holes: readonly Point[] = [[20, 20], [180, 20], [20, 100], [180, 100]];
  for (const [x, y] of holes) L.circle3(p, P, [x, y, 18], 'z', 6, { stroke: '#000', width: 0.7, fill: '#fff' });
  L.sectionLine(p, pt(P, -40, 60, 18), pt(P, 240, 60, 18), '2', { side: -1, len: 18 });
  const col = L.cylinder3(p, P, [60, 60, 18], [60, 60, 170], 16, 16, { fill: '#fff', width: 0.9 });
  L.surfaceShade(p, bodyD(col), { angle: 90, side: 1, n: 5, extent: 0.32 });
  L.cylinder3(p, P, [160, 60, 18], [160, 60, 30], 14, 14, { fill: '#fff', width: 0.9 });
  L.cylinder3(p, P, [160, 60, 30], [160, 60, 192], 5, 5, { fill: '#fff', width: 0.8 });
  threads(p, P);
  L.obliqueBox(p, P, [150, 36, 22], { pos: [40, 42, 170], ...WH, width: 0.9 });
  L.cylinder3(p, P, [160, 60, 192], [160, 60, 200], 5, 5, { fill: '#fff', width: 0.8 });
  const knob = L.cylinder3(p, P, [160, 60, 200], [160, 60, 222], 13, 13, { fill: '#fff', width: 0.9 });
  L.surfaceShade(p, bodyD(knob), { angle: 90, side: 1, n: 4, extent: 0.35 });
}

function perspectiveNumerals(p: Parent, P: Proj, W: number): void {
  const a10 = pt(P, 190, 42, 205);
  lead(p, '10', [W - 60, 70], [a10[0] + 8, a10[1] - 14], -0.25, true);
  const a12 = pt(P, 200, 120, 0);
  lead(p, '12', [a12[0] - 150, a12[1] + 30], pt(P, 80, 120, 9), -0.3);
  const a24 = pt(P, 200, 0, 18);
  const h24 = pt(P, 180, 20, 18);
  lead(p, '24', [a24[0] + 34, a24[1] - 8], h24[0] > 0 ? [h24[0] + 6, h24[1] + 2] : h24);
  const a14 = pt(P, 60, 60, 110);
  lead(p, '14', [a14[0] - 62, a14[1] - 10], [a14[0] - 17, a14[1]]);
  const a16 = pt(P, 40, 42, 192);
  lead(p, '16', [a16[0] - 40, a16[1] - 34], pt(P, 60, 42, 186));
  const a18 = pt(P, 160, 60, 222);
  const h18 = pt(P, 160, 60, 214);
  lead(p, '18', [a18[0] - 55, a18[1] - 40], [h18[0] - 14, h18[1]]);
  const a20 = pt(P, 160, 60, 100);
  lead(p, '20', [a20[0] + 60, a20[1] + 6], [a20[0] + HW, a20[1]], -0.3);
  const a22 = pt(P, 160, 60, 24);
  const h22 = pt(P, 174, 60, 24);
  lead(p, '22', [a22[0] + 40, a22[1] + 62], [h22[0] + 4, h22[1] + 4], -0.3);
}

interface Elev {
  ox: number;
  oy: number;
  k: number;
}

function elev(E: Elev, x: number, z: number): Point {
  return [E.ox + x * E.k, E.oy - z * E.k];
}

function ring(E: Elev, pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const [x, z] of pts) out.push(elev(E, x, z));
  return out;
}

function outline(p: Parent, E: Elev, pts: readonly Point[]): void {
  L.polygon(p, ring(E, pts), { fill: '#fff', stroke: '#000', width: 0.9 });
}

function section(p: Parent, E: Elev): void {
  L.hatchSection(p, ring(E, [[0, 0], [50, 0], [50, 6], [55, 6], [55, 18], [0, 18]]), { angle: 45 });
  L.hatchSection(p, ring(E, [[70, 0], [200, 0], [200, 18], [65, 18], [65, 6], [70, 6]]), { angle: 45 });
  L.hatchSection(p, ring(E, [[44, 18], [55, 18], [55, 40], [65, 40], [65, 18], [76, 18], [76, 170], [44, 170]]), { angle: 135 });
  L.hatchSection(p, ring(E, [[40, 170], [155, 170], [155, 192], [40, 192]]), { angle: 45, spacing: 4.5 });
  L.hatchSection(p, ring(E, [[165, 170], [190, 170], [190, 192], [165, 192]]), { angle: 45, spacing: 4.5 });
  L.hatchSection(p, ring(E, [[146, 18], [174, 18], [174, 30], [146, 30]]), { angle: 135, spacing: 4.5 });
  outline(p, E, [[50, 0], [70, 0], [70, 6], [50, 6]]);
  outline(p, E, [[55, 6], [65, 6], [65, 40], [55, 40]]);
  for (let z = 14; z <= 38; z += 4) L.line(p, elev(E, 55, z), elev(E, 65, z + 1.5), { stroke: '#000', width: 0.5 });
  outline(p, E, [[155, 30], [165, 30], [165, 200], [155, 200]]);
  for (let z = 40; z <= 160; z += 7) L.line(p, elev(E, 155, z), elev(E, 165, z + 2), { stroke: '#000', width: 0.5 });
  outline(p, E, [[147, 200], [173, 200], [173, 222], [147, 222]]);
  L.surfaceShade(p, ring(E, [[147, 200], [173, 200], [173, 222], [147, 222]]), { angle: 90, side: 1, n: 3, extent: 0.3 });
  L.centerLine(p, elev(E, 60, -8), elev(E, 60, 180));
  L.centerLine(p, elev(E, 160, 10), elev(E, 160, 232));
}

function secLead(p: Parent, E: Elev, s: string, x: number, z: number, dx: number, dy: number, to: Point, c: number): void {
  const a = elev(E, x, z);
  lead(p, s, [a[0] + dx, a[1] + dy], to, c);
}

function sectionNumerals(p: Parent, E: Elev): void {
  secLead(p, E, '12', 0, 9, -40, 30, elev(E, 20, 9), -0.3);
  secLead(p, E, '26', 60, 3, 34, 26, elev(E, 62, 1), -0.3);
  secLead(p, E, '14', 44, 120, -44, -6, elev(E, 52, 120), 0.3);
  secLead(p, E, '16', 100, 192, -30, -30, elev(E, 100, 184), 0.3);
  secLead(p, E, '18', 173, 222, 36, -14, elev(E, 170, 214), -0.3);
  secLead(p, E, '20', 165, 110, 40, 0, elev(E, 163, 110), -0.3);
  secLead(p, E, '22', 174, 24, 40, 10, elev(E, 170, 24), -0.3);
}

function sheet1(p: Parent, W: number): void {
  const P = L.obliqueProj({ preset: 'isometric', scale: 1.1, origin: [W / 2 - 40, 232] });
  perspective(p, P);
  perspectiveNumerals(p, P, W);
  L.figLabel(p, W - 50, 425, 'FIG. 1');
  const k = 0.78;
  const E: Elev = { k, ox: W / 2 - 100 * k, oy: 655 };
  section(p, E);
  sectionNumerals(p, E);
  L.figLabel(p, W / 2 + 150, E.oy - 60, 'FIG. 2');
}

function port(ports: Ports, k: string): Point {
  const v = ports[k];
  if (v === undefined) throw new Error(`no port ${k}`);
  return v;
}

function blockDiagram(p: Parent, W: number): void {
  L.pBox(p, 130, 110, 325, 210, undefined, '110', { numeralAt: 'top', lead: 22 });
  L.pBox(p, 165, 135, 115, 40, 'PROCESSOR', '112', { numeralAt: 'right', lead: 14 });
  L.pBox(p, 290, 225, 120, 84, undefined, '114', { numeralAt: 'right', lead: 10 });
  L.text(p, 350, 243, 'MEMORY', { anchor: 'middle', valign: 'middle', role: 'legend' });
  L.pBox(p, 302, 258, 96, 44, 'PROGRAM', '116', { dash: true, numeralAt: 'inside' });
  L.pBox(p, 165, 238, 115, 50, 'COMM.\nINTERFACE', '118', { numeralAt: 'bottom', lead: 16 });
  L.wire(p, [[145, 205], [440, 205]]);
  const stubs: readonly V3[] = [[222, 175, 205], [350, 205, 225], [222, 205, 238]];
  for (const [x, a, b] of stubs) L.wire(p, [[x, a], [x, b]]);
  L.junction(p, 222, 205);
  L.junction(p, 350, 205);
  lead(p, '119', [420, 186], [405, 205]);
  L.pBox(p, 0, 30, 100, 46, 'SENSOR', '102', { numeralAt: 'top', lead: 18 });
  L.flowLink(p, [50, 76], [130, 160], { via: [[50, 160]] });
  L.pBox(p, 0, 340, 110, 50, 'POWER\nSUPPLY', '130', { numeralAt: 'bottom', lead: 18 });
  L.flowLink(p, [110, 365], [180, 320], { via: [[180, 365]] });
  L.pBox(p, 330, 350, 130, 46, 'ACTUATOR', '120', { numeralAt: 'right', lead: 10 });
  L.flowLink(p, [395, 320], [395, 350]);
  lead(p, '100', [470, 40], [448, 100], 0.25, true);
  L.figLabel(p, W / 2, 445, 'FIG. 3');
}

function driverParts(p: Parent, y0: number, y1: number): void {
  L.battery(p, [40, y1], [40, y0], { len: 6 });
  L.wire(p, [[40, y0], [90, y0]]);
  L.switchSym(p, [90, y0], [150, y0]);
  L.resistor(p, [150, y0], [230, y0]);
  L.wire(p, [[230, y0], [380, y0]]);
  L.capacitor(p, [250, y0], [250, y1]);
  L.inductor(p, [320, y0], [320, y1 - 20]);
  L.wire(p, [[320, y1 - 20], [320, y1]]);
  L.diode(p, [380, y1 - 20], [380, y0]);
  L.wire(p, [[380, y1 - 20], [320, y1 - 20]]);
  L.wire(p, [[40, y1], [320, y1]]);
  for (const x of [250, 320]) L.junction(p, x, y0);
  L.junction(p, 250, y1);
  L.junction(p, 320, y1 - 20);
  L.groundSym(p, 200, y1);
}

function driverOpamp(p: Parent, y0: number, y1: number): number {
  const op = L.opamp(p, 100, 550, { size: 36 });
  const plus = port(op.ports, 'plus');
  const minus = port(op.ports, 'minus');
  L.wire(p, [port(op.ports, 'out'), [140, 550], [140, 520]]);
  L.wire(p, [[140, 520], [120, y0 - 4]], { dash: '4 3' });
  L.wire(p, [minus, [85, minus[1]], [85, y1]]);
  L.junction(p, 85, y1);
  L.wire(p, [plus, [70, plus[1]]]);
  L.circle(p, 67.5, plus[1], 2.5, { stroke: '#000', width: 0.9, fill: '#fff' });
  return plus[1];
}

function driver(p: Parent, W: number): void {
  const y0 = 490;
  const y1 = 610;
  driverParts(p, y0, y1);
  const plusY = driverOpamp(p, y0, y1);
  lead(p, '142', [16, 522], [34, 546], -0.3);
  lead(p, '144', [120, 462], [128, y0 - 8]);
  lead(p, '146', [190, 462], [194, y0 - 5]);
  lead(p, '152', [280, 530], [256, 547]);
  lead(p, '148', [355, 530], [326, 535], -0.3);
  lead(p, '150', [420, 560], [386, 555], -0.3);
  lead(p, '154', [140, 590], [118, 562]);
  lead(p, '156', [236, 650], [206, y1 + 12], -0.3);
  lead(p, '158', [62, 588], [67, plusY + 3], 0.2);
  L.figLabel(p, W / 2, 690, 'FIG. 4');
}

function sheet2(p0: Parent, W: number): void {
  const p = L.group(p0, { x: 4 });
  blockDiagram(p, W);
  driver(p, W);
}

function step(F: Figure, p: Parent, cx: number, y: number, h: number, s: string, n: string | undefined, o: L.FlowStepOpts): void {
  L.flowStep(p, cx, y, 230, h, s, n, { numeralAt: 'left', F, ...o });
}

function sheet3(F: Figure, p: Parent, W: number): void {
  const cx = W / 2 + 20;
  step(F, p, cx, 50, 38, 'START', undefined, { shape: 'terminal', name: 't0' });
  step(F, p, cx, 140, 56, 'CLOSE CLAMP', 'S202', { name: 's1' });
  step(F, p, cx, 240, 56, 'RECEIVE FORCE\nSIGNAL', 'S204', { name: 's2' });
  step(F, p, cx, 365, 120, 'FORCE ABOVE\nTHRESHOLD?', 'S206', { shape: 'decision', name: 's3' });
  step(F, p, cx, 490, 56, 'STOP ACTUATOR', 'S208', { name: 's4' });
  step(F, p, cx, 580, 56, 'STORE EVENT', 'S210', { name: 's5' });
  step(F, p, cx, 660, 38, 'END', undefined, { shape: 'terminal', name: 't1' });
  const names = ['t0', 's1', 's2', 's3', 's4', 's5', 't1'];
  for (let i = 0; i + 1 < names.length; i++) {
    const a = names[i];
    const b = names[i + 1];
    F.relate(`${a}.bottom`, `${b}.top`);
    L.flowLink(F.root, `${a}.bottom`, `${b}.top`, { F, label: a === 's3' ? 'YES' : undefined, labelSide: -1 });
  }
  const r = L.toLocal(F, F.root, F.at('s3.right'));
  const t = L.toLocal(F, F.root, F.at('s2.right'));
  F.relate('s3.right', 's2.right', 'feedback');
  L.flowLink(F.root, 's3.right', 's2.right', { F, via: [[r[0] + 45, r[1]], [r[0] + 45, t[1]]], label: 'NO', labelAt: [r[0] + 18, r[1] - 12] });
  lead(p, '200', [W - 30, 30], [cx + 128, 52], 0.3, true);
  L.figLabel(p, W - 50, 600, 'FIG. 5');
}

export default function draw(F: Figure): void {
  const p = F.drawing;
  const sight = F.sight;
  if (p === undefined || sight === undefined) throw new Error('patent figures need a drawing sight');
  if (SHEET === 1) sheet1(p, sight.w);
  else if (SHEET === 2) sheet2(p, sight.w);
  else sheet3(F, p, sight.w);
}
