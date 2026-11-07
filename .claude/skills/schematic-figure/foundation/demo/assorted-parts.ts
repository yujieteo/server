// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/assorted-parts.js
import type { Figure, FigureOpts, Parent, Point } from '../engine/types.ts';
import * as B from '../engine/bio.ts';
import * as K from '../engine/chem.ts';
import * as I from '../engine/ind.ts';
import * as L from '../engine/lib.ts';
import { at } from '../engine/util.ts';

export const figure: FigureOpts = { width: 183, height: 150, name: 'assorted-parts' };

const C = L.STYLE.color;

function lab(p: Parent, x: number, y: number, s: string): void {
  L.text(p, x, y, s, { size: 5, anchor: 'middle', color: C.mid });
}

function panelA(F: Figure): void {
  const a = F.panel('a', { x: 1, y: 1, w: 88, h: 46 });
  B.mouse(a, 42, 40, 36, { pose: 'walk', tail: 0.6, F, name: 'm1' });
  lab(a, 42, 50, "pose 'walk'");
  B.mouse(a, 108, 40, 38, { pose: 'run', tail: 0.5 });
  lab(a, 108, 50, "'run'");
  B.mouse(a, 166, 40, 36, { pose: 'crouch', fur: true, tailPose: 'raised', tail: 1 });
  lab(a, 166, 50, "'crouch', fur, tailPose 'raised'");
  B.mouse(a, 226, 26, 30, { pose: 'top', angle: -30, tail: 0.7 });
  lab(a, 226, 50, "'top', angle -30");
  const hd = L.toLocal(F, a, F.at('m1.head'));
  L.circle(a, hd[0], hd[1], 0.9, { fill: C.vermillion });
  L.bolt(a, 12, 70, 16, 22);
  lab(a, 20, 100, 'bolt');
  L.cloud(a, 62, 80, 22, 16, { streaks: 2 });
  lab(a, 70, 100, 'cloud, streaks');
  L.lamp(a, 128, 76, { angle: 120, size: 8 });
  lab(a, 124, 100, 'lamp');
  B.mouse(a, 190, 100, 30, { pose: 'walk', facing: -1, tailPose: 'straight', whiskers: false });
  lab(a, 190, 110, "facing -1, tailPose 'straight'");
  L.bolt(a, 150, 78, 12, 18, { flip: true, rot: 15 });
}

function panelB(F: Figure): void {
  const b = F.panel('b', { x: 91, y: 1, w: 91, h: 46 });
  const br = B.brainSagittal(b, 8, 16, 200, { regions: ['mPFC', 'ACC', 'BLA', 'NAc', 'HY', 'VTA', 'PAG', 'LHb'], labels: true, size: 5, F, name: 'br' });
  const bla = I.portOf(br.ports, 'BLA');
  const mpfc = I.portOf(br.ports, 'mPFC');
  const vta = I.portOf(br.ports, 'VTA');
  const lhb = I.portOf(br.ports, 'LHb');
  const acc = I.portOf(br.ports, 'ACC');
  const toMpfc: Point[] = [[bla[0], bla[1] - 6], [bla[0] - 10, bla[1] - 24], [mpfc[0] + 16, mpfc[1] + 8], [mpfc[0] + 5, mpfc[1] + 6]];
  const toLhb: Point[] = [[vta[0], vta[1] - 5], [vta[0] - 20, vta[1] - 34], [lhb[0] + 24, lhb[1] - 8], [lhb[0] + 10, lhb[1] - 1]];
  B.curveArrow(b, toMpfc, { color: '#0f6b36', width: 0.8, head: 3 });
  B.curveArrow(b, toLhb, { color: '#eea21b', width: 0.8, head: 3 });
  const cn = B.cannula(b, acc[0] + 12, acc[1] + 4, { w: 5, F, name: 'cn' });
  const top = I.portOf(cn.ports, 'top');
  L.text(b, top[0] + 5, top[1] + 4, '473 nm', { size: 5, color: '#4c9fd6' });
  B.cannula(b, 238, 64, { w: 5, angle: 60, light: '#f5b400' });
  lab(b, 234, 100, 'angle 60, light');
  B.region(b, [[222, 18], [240, 14], [254, 22], [250, 36], [230, 38]], { dash: true, label: 'target' });
  lab(b, 108, 112, 'brainSagittal(regions, labels) + curveArrow between region ports');
}

function panelC(F: Figure): void {
  const c = F.panel('c', { x: 1, y: 49, w: 60, h: 48 });
  const P = L.obliqueProj({ preset: 'angles', angle: 58, depth: 0.55, origin: [14, 112] });
  const bx = L.wireBox3(c, P, [130, 60, 62], { divide: [0.5], tint: ['#f5f3e3', '#edf5fc'], floorLines: { n: 7, cells: [0] }, F, name: 'box' });
  const fl = L.wireFloor(bx, 1, 0.45, 0.55);
  B.mouse(c, fl[0], fl[1], 30, { pose: 'walk' });
  const t0 = L.wireFloor(bx, 0, 0.5, 0.5);
  B.mouse(c, t0[0], t0[1], 26, { pose: 'crouch', facing: -1 });
  B.cannula(c, 118, 40, { w: 6 });
  lab(c, 80, 126, 'wireBox3: divide, tint, floorLines; cell(i).floor');
}

function panelD(F: Figure): void {
  const d = F.panel('d', { x: 63, y: 49, w: 60, h: 48 });
  L.rect(d, 8, 12, 150, 48, { fill: '#e8f3fb' });
  B.porousMembrane(d, 8, 158, 34, 3.5, { F, name: 'pm' });
  B.cellLayer(d, [[8, 34], [158, 34]], { kind: 'dome', h: 10, F, name: 'epi' });
  B.cellLayer(d, [[8, 37.5], [158, 37.5]], { kind: 'squamous', h: 3.6, side: -1 });
  lab(d, 83, 68, "cellLayer 'dome' / porousMembrane / 'squamous' side -1");
  B.lumen(d, 24, 94, 17, { label: 'Flow', size: 5 });
  B.lumen(d, 64, 94, 17, { kind: 'dome', t: 6, lumen: '#c9e4f7' });
  const rl: Point[] = [[88, 78], [124, 78], [124, 110], [88, 110]];
  L.polygon(d, rl, { fill: '#f1b6b3' });
  B.cellLayer(d, rl, { kind: 'cuboidal', h: 4, closed: true, smooth: false, side: -1 });
  B.cellSheet(d, [[144, 80], [168, 80], [162, 110], [136, 110]], { nu: 5, nv: 5 });
  lab(d, 83, 124, 'lumen (squamous, dome) / polyline cellLayer / cellSheet');
}

function wellPlate(e: Parent): void {
  const Q = L.projFromCorners([36, 84], [74, 106], [8, 100], 120, 60, { z: [0, -0.5] });
  L.obliqueBox(e, Q, [120, 60, 12], { pos: [0, 0, -12], fill: '#c9cfda', stroke: '#8a93a8', width: 0.3 });
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 2; j++) L.hole3(e, Q, [18 + i * 28, 16 + j * 28, 0], 'z', 9, 4, { wall: '#8f98ad', rim: '#6d7890', width: 0.3 });
  }
  lab(e, 42, 135, 'projFromCorners + hole3');
}

function panelE(F: Figure): void {
  const e = F.panel('e', { x: 125, y: 49, w: 57, h: 48 });
  B.wellSection(e, 6, 14, 52, 44, {});
  lab(e, 32, 66, 'wellSection');
  const ws = B.wellSection(e, 64, 14, 58, 44, { insert: { endothelium: true }, F, name: 'tw' });
  lab(e, 93, 66, 'insert: {endothelium}');
  L.text(e, 124, I.portOf(ws.ports, 'membrane')[1] + 2, 'membrane', { size: 5, color: C.mid });
  wellPlate(e);
  const Pp = L.obliqueProj({ preset: 'isometric', scale: 0.36, origin: [124, 80] });
  const tp = L.tilePlate3(e, Pp, [110, 72, 8], { nu: 6, nv: 4, border: 5, gap: 1.6, manual: true });
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      const T = L.tilePlateDraw(tp, i, j);
      const q = L.faceAt(T, 0.5, 0.5);
      L.polyline(tp.node, [L.faceAt(T, 0.2, 0.3), L.faceAt(T, 0.5, 0.5), L.faceAt(T, 0.8, 0.3)], { stroke: '#ea8f8e', width: 0.5, fill: 'none' });
      L.circle(tp.node, q[0], q[1], 0.7, { fill: '#ea8f8e' });
    }
  }
  lab(e, 124, 132, 'tilePlate3');
}

type MolSpec = readonly [string, K.Molecule3dOpts];

const MOLS: readonly MolSpec[] = [
  ['H2', { colors: { H: '#3b6fd6' } }],
  ['O2', { colors: { O: '#6f45b8' }, rot: -30 }],
  ['H2O', { colors: { O: '#6f45b8', H: '#3b6fd6' } }],
  ['CO2', {}],
  ['CH4', {}],
  ['NH3', {}],
];

function panelF(F: Figure): void {
  const f = F.panel('f', { x: 1, y: 99, w: 88, h: 50 });
  L.rect(f, 4, 10, 240, 120, { fill: '#8fa4a8', r: 3 });
  for (let i = 0; i < MOLS.length; i++) {
    const [m, o] = at(MOLS, i);
    const x = 40 + (i % 3) * 78;
    const y = 42 + Math.floor(i / 3) * 50;
    L.trail(f, [x - 12, y + 2], [x - 50, y + 12], { w: 9, color: '#39a6ff', bend: 0.15 });
    K.molecule3d(f, x, y, m, { r: 8, label: true, size: 6, ...o });
    L.text(f, x, y + 22, `molecule3d('${m}')`, { size: 5, anchor: 'middle', color: '#fff' });
  }
  K.atomBall(f, 214, 122, 4, '#f2d94e');
  L.text(f, 214, 122, 'e^{−}', { size: 5, anchor: 'middle', valign: 'middle', color: '#5a4b00', halo: '#f2d94e', haloWidth: 0.4 });
}

function panelG(F: Figure): void {
  const g = F.panel('g', { x: 91, y: 99, w: 91, h: 50 });
  I.flowFieldPlate(g, [[36, 24], [86, 36], [86, 124], [36, 112]], [[26, 28], [27, 114]], { channels: 9, F, name: 'bp' });
  lab(g, 58, 134, 'flowFieldPlate');
  I.fibres(g, { x: 104, y: 30, w: 30, h: 90 }, { kind: 'rods', poly: [[104, 26], [132, 34], [132, 124], [104, 116]], n: 700, len: [3, 8], width: [0.9, 1.4] });
  lab(g, 118, 134, "fibres kind 'rods'");
  I.bulb(g, 176, 50, { r: 12, F, name: 'bulb' });
  lab(g, 176, 88, 'bulb');
  I.bulb(g, 226, 50, { r: 12, style: 'line' });
  lab(g, 226, 88, "bulb style 'line'");
  I.bulb(g, 200, 104, { r: 8, lit: false });
  lab(g, 200, 136, 'lit: false');
}

export default function draw(F: Figure): void {
  panelA(F);
  panelB(F);
  panelC(F);
  panelD(F);
  panelE(F);
  panelF(F);
  panelG(F);
}
