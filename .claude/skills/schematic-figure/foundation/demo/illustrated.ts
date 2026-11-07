// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/illustrated.js
import type { Figure, FigureOpts, Parent, Point } from '../engine/types.ts';
import * as L from '../engine/lib.ts';
import * as D from '../engine/bio.ts';
import * as K from '../engine/chem.ts';
import { at } from '../engine/util.ts';

export const figure: FigureOpts = { width: 183, height: 214, name: 'illustrated' };

function T(a: Parent, x: number, y: number, s: string): void {
  L.text(a, x, y, s, { anchor: 'middle', size: 6, color: '#555' });
}

function H(a: Parent, x: number, s: string): void {
  L.text(a, x, 14, s, { anchor: 'middle', size: 7, weight: 'bold' });
}

function caption(a: Parent, mid: number, y: number, left: string, right: string): void {
  T(a, mid / 2, y, left);
  T(a, mid + mid / 2, y, right);
}

function cells(a: Parent, dx: number, il: boolean): void {
  D.cellCluster(a, dx + 62, 72, 44, { n: 13, palette: 't', flat: true, illustrate: il, seed: 4 });
  D.cellCluster(a, dx + 166, 72, 44, { n: 11, fill: D.BIO.tumour, lobes: 3, jitter: 0.05, illustrate: il, seed: 9, aspect: 1.25 });
  D.cell(a, dx + 232, 50, 13, { palette: 'myeloid', flat: true, illustrate: il, receptors: { n: 7, kind: 'antibody', size: 7, style: 'flat' } });
  D.cell(a, dx + 232, 102, 12, { vesicles: 10, illustrate: il });
}

function mice(a: Parent, dx: number, il: boolean): void {
  D.mouse(a, dx + 80, 214, 92, { pose: 'walk', tail: 0.5, illustrate: il });
  D.mouse(a, dx + 196, 184, 62, { pose: 'top', angle: -20, illustrate: il });
  D.mouse(a, dx + 206, 232, 48, { pose: 'crouch', tail: 0.6, illustrate: il, fill: il ? '#5b5d66' : undefined });
}

function tissue(a: Parent, dx: number, il: boolean): void {
  const base: Point[] = [];
  const shifted: Point[] = [];
  for (let i = 0; i < 9; i++) {
    const x = dx + 14 + i * 22;
    const y = 318 - 10 * Math.sin((i / 8) * Math.PI);
    base.push([x, y]);
    shifted.push([x, y + 2]);
  }
  D.cellLayer(a, base, { kind: 'dome', h: 16, illustrate: il });
  D.cellLayer(a, shifted, { kind: 'squamous', h: 5, side: -1, illustrate: il });
  D.lumen(a, dx + 228, 300, 26, { kind: 'cuboidal', illustrate: il });
}

function particles(a: Parent, dx: number, il: boolean): void {
  D.cytokines(a, dx + 18, 400, -10, 70, { illustrate: il, color: '#3f7fbf' });
  const pts: Point[] = [];
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 6; i++) pts.push([dx + 116 + i * 13 + (j % 2) * 6.5, 372 + j * 12]);
  }
  if (il) L.particles(a, pts, 5, '#d9853b', { seed: 3, vary: { size: 0.12, jitter: 1.2 } });
  else for (const [x, y] of pts) L.circle(a, x, y, 5, { fill: '#d9853b' });
  const colors = ['#6f45b8', '#2f8f6a', '#c0463a'];
  for (let i = 0; i < 3; i++) K.atomBall(a, dx + 222 + (i % 2) * 14, 380 + i * 16, 7, at(colors, i), { illustrate: il });
}

function organ(a: Parent, dx: number, il: boolean): void {
  D.brainSagittal(a, dx + 8, 452, 130, { regions: ['mPFC', 'BLA', 'VTA'], illustrate: il });
  const trees: readonly Point[] = [[160, 44], [196, 56], [232, 40]];
  for (let k = 0; k < trees.length; k++) {
    const [x, h] = at(trees, k);
    D.tree(a, dx + x, 560, h, { kind: k === 1 ? 'conifer' : 'broadleaf', illustrate: il });
  }
  D.ground(a, dx + 140, dx + 252, 560, { depth: 8 });
}

export default function draw(F: Figure): void {
  const a = F.panel('', { x: 0, y: 0, w: 183, h: 214 });
  const mid = a.w / 2;
  H(a, mid / 2, 'flat (default)');
  H(a, mid + mid / 2, 'illustrate: true');
  L.line(a, [mid, 8], [mid, 600], { stroke: '#ddd', width: 0.4 });
  cells(a, 0, false);
  cells(a, mid, true);
  caption(a, mid, 132, 'D.cellCluster, D.cell', 'organic outlines, per-cell size, tint, nucleus; shaded finish');
  mice(a, 0, false);
  mice(a, mid, true);
  caption(a, mid, 250, 'D.mouse (walk, top, crouch)', 'fur, pink skin, eye glint, ground shadow');
  tissue(a, 0, false);
  tissue(a, mid, true);
  caption(a, mid, 346, 'D.cellLayer, D.lumen', 'jittered widths and heights, leaning apices');
  particles(a, 0, false);
  particles(a, mid, true);
  caption(a, mid, 432, 'D.cytokines, circles, K.atomBall', 'L.particles: size, tint, position vary per item');
  organ(a, 0, false);
  organ(a, mid, true);
  caption(a, mid, 590, 'D.brainSagittal, D.tree', 'shaded tissue, clumped crowns, shaded trunks');
}
