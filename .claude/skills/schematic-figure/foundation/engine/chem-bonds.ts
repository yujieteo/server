// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Dash, Point } from './types.ts';
import { line, path, polygon } from './draw.ts';
import { at, f3, unit } from './util.ts';
import { ellDist } from './chem-text.ts';
import type { LabelBox, MolOpts, NBond } from './chem-mol-types.ts';
import { ringOf } from './chem-mol-types.ts';

export interface BondCtx {
  gb: SVGGElement;
  col: string;
  lw: number;
  b: number;
  dash: Dash;
  pos: readonly Point[];
  boxes: ReadonlyMap<number, LabelBox>;
  nb: readonly (readonly number[])[];
  hide: ReadonlySet<number>;
  o: MolOpts;
}

interface Seg {
  S: Point;
  E: Point;
  S0: Point;
  E0: Point;
  ti: number;
  tj: number;
  u: Point;
  n: Point;
}

function exitT(trim: string | undefined, S: Point, E: Point, bx: LabelBox): number {
  if (trim !== 'box') {
    const h = Math.hypot(E[0] - S[0], E[1] - S[1]);
    const L0 = h === 0 || Number.isNaN(h) ? 1 : h;
    return Math.min(ellDist(unit(E[0] - S[0], E[1] - S[1]), bx.hw * 1.12, bx.hh * 1.12) / L0, 0.45);
  }
  let t = 0;
  const axes: readonly (readonly [number, number, number, number])[] = [
    [S[0], E[0], bx.x0, bx.x1],
    [S[1], E[1], bx.y0, bx.y1],
  ];
  for (const [s, e, lo, hi] of axes) {
    const d = e - s;
    if (Math.abs(d) < 1e-9) continue;
    const ta = (lo - s) / d;
    const tb = (hi - s) / d;
    t = Math.max(t, Math.min(Math.max(ta, tb), 1));
  }
  return Math.min(t, 0.45);
}

function lineBond(c: BondCtx, a: Point, b: Point, w: number = c.lw, dash?: Dash): void {
  line(c.gb, a, b, { stroke: c.col, width: w, cap: dash !== undefined ? 'butt' : 'round', dash });
}

function offsetLine(c: BondCtx, S: Point, E: Point, n: Point, h: number, w: number, dash?: Dash): void {
  lineBond(c, [S[0] + n[0] * h, S[1] + n[1] * h], [E[0] + n[0] * h, E[1] + n[1] * h], w, dash);
}

function segmentOf(c: BondCtx, bd: NBond): Seg {
  const S0 = at(c.pos, bd.i);
  const E0 = at(c.pos, bd.j);
  const bi = c.boxes.get(bd.i);
  const bj = c.boxes.get(bd.j);
  let ti = bi !== undefined ? exitT(c.o.trim, S0, E0, bi) : 0;
  let tj = bj !== undefined ? exitT(c.o.trim, E0, S0, bj) : 0;
  const keep = c.o.minBond ?? 0.3;
  if (1 - ti - tj < keep && ti + tj > 0) {
    const f = (1 - keep) / (ti + tj);
    ti *= f;
    tj *= f;
  }
  const S: Point = [S0[0] + (E0[0] - S0[0]) * ti, S0[1] + (E0[1] - S0[1]) * ti];
  const E: Point = [E0[0] + (S0[0] - E0[0]) * tj, E0[1] + (S0[1] - E0[1]) * tj];
  const [ux, uy] = unit(E[0] - S[0], E[1] - S[1]);
  return { S, E, S0, E0, ti, tj, u: [ux, uy], n: [-uy, ux] };
}

function wavyBond(c: BondCtx, sg: Seg): void {
  const { S, E, n } = sg;
  const Lb = Math.hypot(E[0] - S[0], E[1] - S[1]);
  const nw = Math.max(2, Math.round(Lb / (c.b * 0.22)));
  const amp = c.b * 0.07;
  let d = 'M';
  for (let q = 0; q <= nw * 8; q++) {
    const t = q / (nw * 8);
    const s = Math.sin(t * nw * Math.PI * 2) * amp;
    d += `${q > 0 ? ' L' : ''}${f3(S[0] + (E[0] - S[0]) * t + n[0] * s)},${f3(S[1] + (E[1] - S[1]) * t + n[1] * s)}`;
  }
  path(c.gb, d, { stroke: c.col, width: c.lw });
}

function stereoBond(c: BondCtx, sg: Seg, stereo: string): void {
  const { S, E, n } = sg;
  const w = c.b * 0.12;
  if (stereo === 'wedge') {
    polygon(c.gb, [S, [E[0] + n[0] * w, E[1] + n[1] * w], [E[0] - n[0] * w, E[1] - n[1] * w]], { fill: c.col });
    return;
  }
  for (let q = 1; q <= 6; q++) {
    const t = q / 6;
    const hw = w * t;
    const m: Point = [S[0] + (E[0] - S[0]) * t, S[1] + (E[1] - S[1]) * t];
    lineBond(c, [m[0] + n[0] * hw, m[1] + n[1] * hw], [m[0] - n[0] * hw, m[1] - n[1] * hw], c.lw * 0.8);
  }
}

function tripleBond(c: BondCtx, sg: Seg): void {
  const h = c.b * 0.15;
  lineBond(c, sg.S, sg.E);
  for (const s of [1, -1]) offsetLine(c, sg.S, sg.E, sg.n, h * s, c.lw);
}

function visible(c: BondCtx, i: number): boolean {
  return !c.hide.has(i);
}

function atomPos(c: BondCtx, i: number): Point {
  return at(c.pos, i);
}

interface DoubleKind {
  style: string;
  side: number;
  ringC: Point | null;
}

function ringCentre(c: BondCtx, ring: readonly number[]): Point {
  let x = 0;
  let y = 0;
  for (const q of ring) {
    x += atomPos(c, q)[0] / ring.length;
    y += atomPos(c, q)[1] / ring.length;
  }
  return [x, y];
}

function sideKind(c: BondCtx, bd: NBond, sg: Seg): DoubleKind {
  const nbi = at(c.nb, bd.i);
  const nbj = at(c.nb, bd.j);
  const others: number[] = [];
  for (const q of nbi) if (q !== bd.j && visible(c, q)) others.push(q);
  for (const q of nbj) if (q !== bd.i && visible(c, q)) others.push(q);
  const terminalLabel = (nbi.length === 1 && c.boxes.has(bd.i)) || (nbj.length === 1 && c.boxes.has(bd.j));
  let sum = 0;
  for (const q of others) sum += (atomPos(c, q)[0] - sg.S0[0]) * sg.n[0] + (atomPos(c, q)[1] - sg.S0[1]) * sg.n[1];
  if (terminalLabel || Math.abs(sum) < 1e-6 || (nbi.length >= 3 && nbj.length >= 3 && others.length === 4)) {
    return { style: 'center', side: 0, ringC: null };
  }
  return { style: 'side', side: Math.sign(sum), ringC: null };
}

function doubleKind(c: BondCtx, bd: NBond, sg: Seg, given: string | undefined): DoubleKind {
  if (given !== undefined && given !== '') return { style: given, side: 0, ringC: null };
  const ring = ringOf(c.nb, bd.i, bd.j);
  if (ring !== null && allVisible(c, ring)) return { style: 'ring', side: 0, ringC: ringCentre(c, ring) };
  return sideKind(c, bd, sg);
}

function allVisible(c: BondCtx, ring: readonly number[]): boolean {
  for (const q of ring) if (!visible(c, q)) return false;
  return true;
}

function doubleBond(c: BondCtx, bd: NBond, sg: Seg, given: string | undefined, bs: string | undefined): void {
  const { S, E, S0, E0, ti, tj, u, n } = sg;
  const kind = doubleKind(c, bd, sg, given);
  const d2 = bs === 'dash' ? c.dash : undefined;
  if (kind.style === 'center') {
    const h = c.b * 0.08;
    for (const s of [1, -1]) offsetLine(c, S, E, n, h * s, c.lw, s < 0 ? d2 : undefined);
    return;
  }
  lineBond(c, S, E);
  let side = kind.side;
  if (kind.style === 'ring' && kind.ringC !== null) {
    const m: Point = [(S0[0] + E0[0]) / 2, (S0[1] + E0[1]) / 2];
    const sd = Math.sign((kind.ringC[0] - m[0]) * n[0] + (kind.ringC[1] - m[1]) * n[1]);
    side = sd === 0 || Number.isNaN(sd) ? 1 : sd;
  } else if (kind.style === 'left' || kind.style === 'right') side = kind.style === 'left' ? 1 : -1;
  const off = c.b * 0.18;
  const sh = c.b * 0.14;
  const s2: Point = [S[0] + n[0] * off * side + u[0] * (ti !== 0 ? 0 : sh), S[1] + n[1] * off * side + u[1] * (ti !== 0 ? 0 : sh)];
  const e2: Point = [E[0] + n[0] * off * side - u[0] * (tj !== 0 ? 0 : sh), E[1] + n[1] * off * side - u[1] * (tj !== 0 ? 0 : sh)];
  lineBond(c, s2, e2, c.lw, d2);
}

function keyed<V>(rec: Record<string, V> | undefined, k: number, bd: NBond): V | undefined {
  return rec?.[k] ?? rec?.[`${bd.i}-${bd.j}`] ?? rec?.[`${bd.j}-${bd.i}`];
}

export function drawBond(c: BondCtx, k: number, bd: NBond): void {
  if (!visible(c, bd.i) || !visible(c, bd.j)) return;
  const sg = segmentOf(c, bd);
  const bs: string | undefined = keyed(c.o.bondStyle, k, bd) ?? bd.stereo;
  if (bs === 'dash' && bd.order !== 2) return lineBond(c, sg.S, sg.E, c.lw, c.dash);
  if (bs === 'bold') return lineBond(c, sg.S, sg.E, c.lw * 3.2);
  if (bs === 'wavy') return wavyBond(c, sg);
  const stereo = bs === 'wedge' || bs === 'hash' ? bs : bd.stereo;
  if (stereo === 'wedge' || stereo === 'hash') return stereoBond(c, sg, stereo);
  if (bd.order === 3) return tripleBond(c, sg);
  if (bd.order !== 2) return lineBond(c, sg.S, sg.E);
  return doubleBond(c, bd, sg, keyed(c.o.doubleStyle, k, bd), bs);
}
