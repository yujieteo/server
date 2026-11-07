// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Figure, IllustrateSetting, Loose, Parent, Point, Ports } from './types.ts';
import { STYLE, shade } from './style.ts';
import { blur, circle, ellipse, radialGradient } from './draw.ts';
import { at } from './util.ts';
import { ball, illustrating } from './illustrate.ts';
import { chemText, formula, gOf, rad, reg } from './chem-text.ts';

export const ATOM_COLORS: Record<string, string> = {
  H: '#eeeeee', C: '#555b63', N: '#3f63d8', O: '#e0452f', S: '#e8c53a', P: '#f0902c', F: '#8fd46b', Cl: '#42b54a', Na: '#8a5cc7', e: '#f2d94e',
};
const ATOM_R: Record<string, number> = { H: 0.72, e: 0.55 };

export type BallAtom = readonly [string, number, number, number?, number?];

function linear(a: string, b: string, s: number): BallAtom[] {
  return [[a, -s / 2, 0, 0], [b, s / 2, 0, 0]];
}

function makeBalls(): Record<string, readonly BallAtom[]> {
  const d = 1.45;
  const dh = 1.25;
  const th = (52.25 * Math.PI) / 180;
  const t = 1 / Math.sqrt(3);
  const ch4: BallAtom[] = [['C', 0, 0, 0]];
  const corners: readonly (readonly [number, number, number])[] = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  for (const [a, b, c] of corners) ch4.push(['H', a * t * dh, b * t * dh, c * t * dh]);
  return {
    H2: linear('H', 'H', 1.05), O2: linear('O', 'O', d), N2: linear('N', 'N', d), CO: linear('C', 'O', d), Cl2: linear('Cl', 'Cl', d),
    H2O: [['O', 0, 0, 0], ['H', -dh * Math.sin(th), dh * Math.cos(th), 0.25], ['H', dh * Math.sin(th), dh * Math.cos(th), -0.25]],
    CO2: [['O', -d * 1.2, 0, 0], ['C', 0, 0, 0], ['O', d * 1.2, 0, 0]],
    CH4: ch4,
    NH3: [['N', 0, 0, 0], ['H', -1.12, 0.62, -0.3], ['H', 1.12, 0.62, -0.3], ['H', 0, 1.02, -0.5]],
  };
}

const BALLS: Record<string, readonly BallAtom[]> = makeBalls();

export type AtomBallOpts = Loose<{ highlight: number; stroke: string; width: number; part: string; illustrate: IllustrateSetting }>;

export function atomBall(p: Parent, cx: number, cy: number, r: number, color: string = '#6f45b8', o: AtomBallOpts = {}): { node: SVGGElement } {
  const g = gOf(p, o.part ?? 'atom');
  const IL = illustrating(o);
  const outline = o.stroke !== undefined && o.stroke !== '';
  const width = outline ? (o.width ?? STYLE.line.hair) : undefined;
  if (IL !== null) {
    const light = IL['light'];
    ball(g.node, cx, cy, r, color, { light: typeof light === 'number' ? light : undefined, contrast: 1.15, highlight: o.highlight ?? 0.8, core: 0.3, outline: o.stroke, width, part: 'atom-ball' });
    return { node: g.node };
  }
  const grd = radialGradient(g.node, [[0, shade(color, 0.55)], [0.45, color], [0.9, shade(color, -0.35)], [1, shade(color, -0.2)]], { cx: 0.38, cy: 0.3, r: 0.75 });
  circle(g.node, cx, cy, r, { fill: grd, stroke: o.stroke, width, part: 'atom-ball' });
  const hl = o.highlight ?? 0.45;
  if (hl > 0) ellipse(g.node, cx - r * 0.3, cy - r * 0.45, r * 0.3, r * 0.17, { fill: '#fff', opacity: hl, filter: blur(g.node, Math.max(r * 0.06, 0.05)), part: 'atom-spec' });
  return { node: g.node };
}

export interface BallPlaced {
  el: string;
  x: number;
  y: number;
  z: number;
  r: number;
}

export type Molecule3dOpts = Loose<{
  r: number;
  rot: number;
  colors: Record<string, string>;
  label: boolean | string;
  size: number;
  labelColor: string;
  labelAt: 'atom' | Point;
  highlight: number;
  stroke: string;
  part: string;
  F: Figure;
  name: string;
}>;

function placeAtoms(spec: readonly BallAtom[], x: number, y: number, r: number, rot: number): BallPlaced[] {
  const c = Math.cos(rad(rot));
  const s = Math.sin(rad(rot));
  const out: BallPlaced[] = [];
  for (const a of spec) {
    const ax = a[1];
    const ay = a[2];
    out.push({ el: a[0], x: x + (ax * c - ay * s) * r, y: y + (ax * s + ay * c) * r, z: a[3] ?? 0, r: (a[4] ?? ATOM_R[a[0]] ?? 1) * r });
  }
  return out;
}

function byDepth(atoms: readonly BallPlaced[]): BallPlaced[] {
  const out = atoms.slice();
  for (let i = 1; i < out.length; i++) {
    const v = at(out, i);
    let j = i - 1;
    while (j >= 0 && at(out, j).z > v.z) {
      out[j + 1] = at(out, j);
      j--;
    }
    out[j + 1] = v;
  }
  return out;
}

function labelAtom(atoms: readonly BallPlaced[], x: number, y: number, byRadius: boolean): BallPlaced {
  let m = at(atoms, 0);
  for (const a of atoms) {
    const better = byRadius ? a.r > m.r : Math.hypot(a.x - x, a.y - y) - 0.01 * a.z < Math.hypot(m.x - x, m.y - y) - 0.01 * m.z;
    if (better) m = a;
  }
  return m;
}

function drawBallLabel(g: SVGGElement, atoms: readonly BallPlaced[], x: number, y: number, mol: string | { atoms: readonly BallAtom[] }, cols: Record<string, string>, o: Molecule3dOpts, r: number): void {
  const str = o.label === true ? formula(typeof mol === 'string' ? mol : '') : (typeof o.label === 'string' ? o.label : '');
  const big = labelAtom(atoms, x, y, o.labelAt === 'atom');
  let pt: Point = [x, y];
  if (o.labelAt === 'atom') pt = [big.x, big.y];
  else if (o.labelAt !== undefined) pt = o.labelAt;
  const t = chemText(g, pt[0], pt[1], str, { size: o.size ?? Math.max(STYLE.text.min, r * 0.9), anchor: 'middle', valign: 'middle', color: o.labelColor ?? '#fff', weight: 'bold', halo: cols[big.el] ?? '#9aa0a8', haloWidth: 0.5 });
  t.setAttribute('data-inside', 'symbol');
}

export function molecule3d(p: Parent, x: number, y: number, mol: string | { atoms: readonly BallAtom[] }, o: Molecule3dOpts = {}): { node: SVGGElement; atoms: { el: string; x: number; y: number; r: number }[]; ports: Ports } {
  const g = gOf(p, o.part ?? 'molecule3d');
  const r = o.r ?? 6;
  const spec = typeof mol === 'string' ? BALLS[mol] : mol.atoms;
  if (spec === undefined) throw new Error(`molecule3d: unknown molecule "${typeof mol === 'string' ? mol : ''}"`);
  const cols: Record<string, string> = { ...ATOM_COLORS, ...o.colors };
  const atoms = placeAtoms(spec, x, y, r, o.rot ?? 0);
  for (const a of byDepth(atoms)) atomBall(g.node, a.x, a.y, a.r, cols[a.el] ?? '#9aa0a8', { highlight: o.highlight, stroke: o.stroke });
  if (o.label !== undefined && o.label !== false && o.label !== '') drawBallLabel(g.node, atoms, x, y, mol, cols, o, r);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const a of atoms) {
    x0 = Math.min(x0, a.x - a.r);
    x1 = Math.max(x1, a.x + a.r);
    y0 = Math.min(y0, a.y - a.r);
    y1 = Math.max(y1, a.y + a.r);
  }
  const ports = reg(o.F, o.name, p, { center: [x, y], left: [x0, y], right: [x1, y], top: [x, y0], bottom: [x, y1] });
  const placed: { el: string; x: number; y: number; r: number }[] = [];
  for (const a of atoms) placed.push({ el: a.el, x: a.x, y: a.y, r: a.r });
  return { node: g.node, atoms: placed, ports };
}
