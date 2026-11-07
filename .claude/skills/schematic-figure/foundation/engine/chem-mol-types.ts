// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Dash, Figure, Loose, Point } from './types.ts';
import { at } from './util.ts';

export type AtomTuple = readonly [string, number, number, number?];
export type AtomObj = { el: string; x: number; y: number } & Loose<{ hs: number; charge: number }>;
export type AtomIn = AtomTuple | AtomObj;
export type BondTuple = readonly [number, number, number?, string?];
export type BondObj = { i: number; j: number } & Loose<{ order: number; stereo: string }>;
export type BondIn = BondTuple | BondObj;
export interface Mol {
  atoms: readonly AtomIn[];
  bonds: readonly BondIn[];
}

export interface NAtom {
  el: string;
  x: number;
  y: number;
  hs: number;
  charge: number | undefined;
}
export interface NBond {
  i: number;
  j: number;
  order: number;
  stereo: string | undefined;
}
export interface NormMol {
  atoms: NAtom[];
  bonds: NBond[];
  nb: number[][];
}

export type LabelAlign = 'center' | 'first' | 'last' | 'below' | 'above';
export type LabelObj = { t: string } & Loose<{
  align: LabelAlign;
  sub: string;
  key: string;
  color: string;
  weight: string | number;
  pad: number;
  formula: boolean;
}>;
export type LabelSpec = string | LabelObj | null | false;
export type BondStyle = 'dash' | 'bold' | 'wavy' | 'wedge' | 'hash';
export type StubObj = { i: number } & Loose<{ angle: number; len: number; dash: false | Dash; width: number }>;
export type StubSpec = number | StubObj;
export type DotSpec = string | Loose<{ color: string; r: number }>;

export type MolOpts = Loose<{
  at: Point;
  anchor: number;
  bond: number;
  lw: number;
  size: number;
  color: string;
  orient: readonly [number, number, number];
  rotate: number;
  mirror: boolean | 'x' | 'y';
  flips: readonly (readonly [number, number])[];
  swings: readonly (readonly [number, number, number])[];
  aim: readonly (readonly [number, number, number])[];
  labels: Record<number, LabelSpec>;
  hide: readonly number[];
  dummy: Record<number, Point>;
  dots: Record<number, DotSpec>;
  dotR: number;
  doubleStyle: Record<string, string>;
  hetero: Record<string, string>;
  bondStyle: Record<string, BondStyle>;
  dash: Dash;
  stubs: readonly StubSpec[];
  trim: 'glyph' | 'box';
  minBond: number;
  labelPad: number;
  part: string;
  F: Figure;
  name: string;
}>;

export interface MolResult {
  node: SVGGElement;
  pos: Point[];
  box: { x: number; y: number; w: number; h: number };
  atoms: { el: string; xy: Point }[];
}

export interface LabelBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  hw: number;
  hh: number;
}

function normAtom(a: AtomIn): NAtom {
  if ('el' in a) return { el: a.el, x: a.x, y: a.y, hs: a.hs ?? 0, charge: a.charge };
  return { el: a[0], x: a[1], y: a[2], hs: a[3] ?? 0, charge: undefined };
}

function normBond(b: BondIn): NBond {
  if ('i' in b) return { i: b.i, j: b.j, order: b.order ?? 1, stereo: b.stereo };
  return { i: b[0], j: b[1], order: b[2] ?? 1, stereo: b[3] };
}

export function normMol(m: Mol): NormMol {
  const atoms: NAtom[] = [];
  for (const a of m.atoms) atoms.push(normAtom(a));
  const bonds: NBond[] = [];
  for (const b of m.bonds) bonds.push(normBond(b));
  let sum = 0;
  for (const b of bonds) {
    const a = at(atoms, b.i);
    const c = at(atoms, b.j);
    sum += Math.hypot(a.x - c.x, a.y - c.y);
  }
  const mean = sum / (bonds.length === 0 ? 1 : bonds.length);
  const Lm = mean === 0 || Number.isNaN(mean) ? 1 : mean;
  for (const a of atoms) {
    a.x /= Lm;
    a.y /= Lm;
  }
  const nb: number[][] = [];
  for (let i = 0; i < atoms.length; i++) nb.push([]);
  for (const b of bonds) {
    at(nb, b.i).push(b.j);
    at(nb, b.j).push(b.i);
  }
  return { atoms, bonds, nb };
}

export function sideOf(nb: readonly (readonly number[])[], a: number, b: number): Set<number> {
  const seen = new Set<number>([b]);
  const stk: number[] = [b];
  while (stk.length > 0) {
    const u = stk.pop() ?? 0;
    for (const v of at(nb, u)) {
      if ((u === b && v === a) || seen.has(v)) continue;
      seen.add(v);
      stk.push(v);
    }
  }
  return seen;
}

export function ringOf(nb: readonly (readonly number[])[], i: number, j: number): number[] | null {
  const prev = new Map<number, number>([[j, -1]]);
  const q: number[] = [j];
  for (let h = 0; h < q.length; h++) {
    const u = at(q, h);
    for (const v of at(nb, u)) {
      if (u === j && v === i) continue;
      if (v === i) return ringPath(prev, i, u);
      if (!prev.has(v)) {
        prev.set(v, u);
        q.push(v);
      }
    }
  }
  return null;
}

function ringPath(prev: ReadonlyMap<number, number>, i: number, u: number): number[] {
  const r = [i];
  let w = u;
  while (w !== -1) {
    r.push(w);
    w = prev.get(w) ?? -1;
  }
  return r;
}
