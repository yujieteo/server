// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Dash, Parent, Point } from './types.ts';
import { STYLE } from './style.ts';
import { el } from './core.ts';
import { circle, line } from './draw.ts';
import { at, f3, unit } from './util.ts';
import { C, INK, chemText, ellDist, gOf, measure, plainOf, rad } from './chem-text.ts';
import type { ChemTextOpts } from './chem-text.ts';
import type { BondCtx } from './chem-bonds.ts';
import { drawBond } from './chem-bonds.ts';
import type { LabelBox, LabelObj, Mol, MolOpts, MolResult, NAtom, NormMol, StubObj } from './chem-mol-types.ts';
import { normMol, sideOf } from './chem-mol-types.ts';

type MPoint = [number, number];

function rotateSet(P: MPoint[], S: Iterable<number>, X: number, Y: number, d: number): void {
  const c = Math.cos(rad(d));
  const s = Math.sin(rad(d));
  for (const i of S) {
    const q = at(P, i);
    const x = q[0] - X;
    const y = q[1] - Y;
    P[i] = [X + x * c - y * s, Y + x * s + y * c];
  }
}

function bondAngle(P: readonly MPoint[], i: number, j: number): number {
  const a = at(P, i);
  const c = at(P, j);
  return (Math.atan2(c[1] - a[1], c[0] - a[0]) * 180) / Math.PI;
}

function flipAcross(P: MPoint[], nb: NormMol['nb'], a: number, b: number): void {
  const S = sideOf(nb, a, b);
  if (S.has(a)) throw new Error(`chem.molecule: flip bond ${a}-${b} is in a ring`);
  const A = at(P, a);
  const A0 = A[0];
  const A1 = A[1];
  const pb = at(P, b);
  const [dx, dy] = unit(pb[0] - A0, pb[1] - A1);
  for (const i of S) {
    const q = at(P, i);
    const t = (q[0] - A0) * dx + (q[1] - A1) * dy;
    P[i] = [2 * (A0 + t * dx) - q[0], 2 * (A1 + t * dy) - q[1]];
  }
}

function swingSide(P: MPoint[], nb: NormMol['nb'], piv: number, a: number, d: number): void {
  const S = sideOf(nb, piv, a);
  if (S.has(piv)) throw new Error(`chem.molecule: swing bond ${piv}-${a} is in a ring`);
  const q = at(P, piv);
  rotateSet(P, S, q[0], q[1], d);
}

function aimSide(P: MPoint[], nb: NormMol['nb'], i: number, j: number, d: number): void {
  const S = sideOf(nb, i, j);
  if (S.has(i)) throw new Error(`chem.molecule: aim bond ${i}-${j} is in a ring`);
  const q = at(P, i);
  rotateSet(P, S, q[0], q[1], d - bondAngle(P, i, j));
}

function layoutPoints(M: NormMol, o: MolOpts): MPoint[] {
  const P: MPoint[] = [];
  for (const a of M.atoms) P.push([a.x, a.y]);
  for (const [a, b] of o.flips ?? []) flipAcross(P, M.nb, a, b);
  for (const [piv, a, d] of o.swings ?? []) swingSide(P, M.nb, piv, a, d);
  if (o.mirror === true || o.mirror === 'x') for (let i = 0; i < P.length; i++) P[i] = [-at(P, i)[0], at(P, i)[1]];
  if (o.mirror === 'y') for (let i = 0; i < P.length; i++) P[i] = [at(P, i)[0], -at(P, i)[1]];
  const all: number[] = [];
  for (let i = 0; i < P.length; i++) all.push(i);
  if (o.orient !== undefined) {
    const [i, j, d] = o.orient;
    rotateSet(P, all, 0, 0, d - bondAngle(P, i, j));
  }
  if (o.rotate !== undefined && o.rotate !== 0) rotateSet(P, all, 0, 0, o.rotate);
  for (const [i, j, d] of o.aim ?? []) aimSide(P, M.nb, i, j, d);
  return P;
}

function originOf(P: readonly MPoint[], o: MolOpts, b: number, hide: ReadonlySet<number>): Point {
  const at0 = o.at ?? [0, 0];
  if (o.anchor !== undefined) {
    const q = at(P, o.anchor);
    return [at0[0] - q[0] * b, at0[1] - q[1] * b];
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < P.length; i++) {
    if (hide.has(i)) continue;
    const q = at(P, i);
    x0 = Math.min(x0, q[0]);
    x1 = Math.max(x1, q[0]);
    y0 = Math.min(y0, q[1]);
    y1 = Math.max(y1, q[1]);
  }
  return [at0[0] - ((x0 + x1) / 2) * b, at0[1] - ((y0 + y1) / 2) * b];
}

function positionsOf(P: readonly MPoint[], o: MolOpts, b: number, hide: ReadonlySet<number>): Point[] {
  const [ox, oy] = originOf(P, o, b, hide);
  const out: Point[] = [];
  for (let i = 0; i < P.length; i++) {
    const d = o.dummy?.[i];
    out.push(d ?? [ox + at(P, i)[0] * b, oy + at(P, i)[1] * b]);
  }
  return out;
}

function visibleNeighbours(M: NormMol, i: number, hide: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (const j of at(M.nb, i)) if (!hide.has(j)) out.push(j);
  return out;
}

function autoLabel(a: NAtom, i: number, M: NormMol, P: readonly MPoint[], hide: ReadonlySet<number>): LabelObj | null {
  const q = a.charge ?? 0;
  if (a.el === 'C' && q === 0) return null;
  const ch = q !== 0 ? `^{${Math.abs(q) > 1 ? Math.abs(q) : ''}${q > 0 ? '+' : '−'}}` : '';
  const H = a.hs !== 0 ? 'H' + (a.hs > 1 ? `_{${a.hs}}` : '') : '';
  if (H === '') return { t: a.el + ch, key: a.el };
  const ns = visibleNeighbours(M, i, hide);
  const pi = at(P, i);
  let sx = 0;
  let sy = 0;
  for (const j of ns) {
    sx += at(P, j)[0] - pi[0];
    sy += at(P, j)[1] - pi[1];
  }
  const mdx = sx / (ns.length === 0 ? 1 : ns.length);
  const mdy = sy / (ns.length === 0 ? 1 : ns.length);
  if (ns.length >= 2 && Math.abs(mdx) < 0.3) return { t: a.el + ch, sub: H, align: mdy > 0 ? 'above' : 'below', key: a.el };
  return mdx > 0.3 ? { t: H + a.el + ch, align: 'last', key: a.el } : { t: a.el + H + ch, align: 'first', key: a.el };
}

function labelsOf(M: NormMol, P: readonly MPoint[], o: MolOpts, hide: ReadonlySet<number>): Map<number, LabelObj> {
  const labels = new Map<number, LabelObj>();
  for (let i = 0; i < M.atoms.length; i++) {
    const a = at(M.atoms, i);
    if (hide.has(i) || a.el === '*' || o.dummy?.[i] !== undefined) continue;
    const u = o.labels?.[i];
    if (u !== undefined) {
      if (u !== null && u !== false) labels.set(i, typeof u === 'string' ? { t: u } : { ...u });
      continue;
    }
    const auto = autoLabel(a, i, M, P, hide);
    if (auto !== null) labels.set(i, auto);
  }
  return labels;
}

function keyOf(lb: LabelObj): string {
  if (lb.key !== undefined) return lb.key;
  const plain = plainOf(lb.t);
  if (lb.align === 'last') return plain.match(/[A-Z][a-z]?(?!.*[A-Z])/)?.[0] ?? plain.slice(-1);
  return plain.match(/^[A-Z][a-z]?/)?.[0] ?? plain.slice(0, 1);
}

function drawLabel(gl: SVGGElement, lb: LabelObj, xy: Point, hetero: string | undefined, o: MolOpts, size: number, col: string): LabelBox {
  const [x, y] = xy;
  const capH = size * 0.716;
  const base = y + capH / 2;
  const opt: ChemTextOpts = { size, color: lb.color ?? hetero ?? col, weight: lb.weight, formula: lb.formula };
  const kw = measure(gl, keyOf(lb), size, lb.weight);
  const al = lb.align ?? 'center';
  if (al === 'first') chemText(gl, x - kw / 2, base, lb.t, { ...opt, anchor: 'start' });
  else if (al === 'last') chemText(gl, x + kw / 2, base, lb.t, { ...opt, anchor: 'end' });
  else {
    chemText(gl, x, base, lb.t, { ...opt, anchor: 'middle' });
    if (lb.sub !== undefined && lb.sub !== '' && (al === 'below' || al === 'above')) {
      chemText(gl, x, base + (al === 'below' ? 1 : -1) * size * 1.0, lb.sub, { ...opt, anchor: 'middle' });
    }
  }
  const pad = lb.pad ?? o.labelPad ?? size * 0.14;
  return { x0: x - kw / 2 - pad, x1: x + kw / 2 + pad, y0: y - capH / 2 - pad, y1: y + capH / 2 + pad, hw: kw / 2 + pad, hh: capH / 2 + pad };
}

function sortAscending(a: number[]): number[] {
  const out = a.slice();
  for (let i = 1; i < out.length; i++) {
    const v = at(out, i);
    let j = i - 1;
    while (j >= 0 && at(out, j) > v) {
      out[j + 1] = at(out, j);
      j--;
    }
    out[j + 1] = v;
  }
  return out;
}

function stubAngle(M: NormMol, pos: readonly Point[], i: number, hide: ReadonlySet<number>): number {
  const [x, y] = at(pos, i);
  const raw: number[] = [];
  for (const j of visibleNeighbours(M, i, hide)) raw.push((Math.atan2(at(pos, j)[1] - y, at(pos, j)[0] - x) * 180) / Math.PI);
  const dirs = sortAscending(raw);
  if (dirs.length === 0) return -90;
  if (dirs.length === 1) return at(dirs, 0) + 180;
  let best = -1;
  let ang = 0;
  for (let q = 0; q < dirs.length; q++) {
    const a = at(dirs, q);
    const gap = (q + 1 < dirs.length ? at(dirs, q + 1) : at(dirs, 0) + 360) - a;
    if (gap > best) {
      best = gap;
      ang = a + gap / 2;
    }
  }
  return ang;
}

function drawStubs(c: BondCtx, M: NormMol, o: MolOpts): void {
  for (const s0 of o.stubs ?? []) {
    const s: StubObj = typeof s0 === 'number' ? { i: s0 } : s0;
    const [x, y] = at(c.pos, s.i);
    const ang = s.angle ?? stubAngle(M, c.pos, s.i, c.hide);
    const u: Point = [Math.cos(rad(ang)), Math.sin(rad(ang))];
    const L0 = s.len ?? c.b * 0.8;
    const bx = c.boxes.get(s.i);
    const st = bx !== undefined ? ellDist(u, bx.hw * 1.12, bx.hh * 1.12) : 0;
    const sd = s.dash;
    const dash: Dash | undefined = sd === false ? undefined : (sd ?? c.dash);
    const w = s.width ?? c.lw;
    line(c.gb, [x + u[0] * st, y + u[1] * st], [x + u[0] * (st + L0), y + u[1] * (st + L0)], { stroke: c.col, width: w, cap: dash !== undefined ? 'butt' : 'round', dash });
  }
}

function drawDots(g: SVGGElement, pos: readonly Point[], o: MolOpts, b: number): void {
  for (const [k, c] of Object.entries(o.dots ?? {})) {
    const [x, y] = at(pos, Number(k));
    const cc = typeof c === 'string' ? { color: c, r: undefined } : c;
    circle(g, x, y, cc.r ?? o.dotR ?? b * 0.2, { fill: cc.color ?? C.orange, part: 'atom-dot' });
  }
}

export function molPoint(m: MolResult, i: number): Point {
  return at(m.pos, i);
}

export function molCenter(m: MolResult, list: readonly number[]): Point {
  let x = 0;
  let y = 0;
  for (const q of list) {
    x += at(m.pos, q)[0] / list.length;
    y += at(m.pos, q)[1] / list.length;
  }
  return [x, y];
}

export function molecule(p: Parent, mol: Mol, o: MolOpts = {}): MolResult {
  const M = normMol(mol);
  const P = layoutPoints(M, o);
  const size = o.size ?? STYLE.text.label;
  const b = o.bond ?? size * 1.75;
  const col = o.color ?? INK;
  const hide = new Set(o.hide ?? []);
  const pos = positionsOf(P, o, b, hide);
  const g = gOf(p, o.part ?? 'molecule');
  const gb = el(g.node, 'g', { 'data-part': 'bonds' });
  const gl = el(g.node, 'g', { 'data-part': 'atom-labels' });
  const boxes = new Map<number, LabelBox>();
  for (const [i, lb] of labelsOf(M, P, o, hide)) {
    boxes.set(i, drawLabel(gl, lb, at(pos, i), o.hetero?.[at(M.atoms, i).el], o, size, col));
  }
  const ctx: BondCtx = { gb, col, lw: o.lw ?? STYLE.line.normal, b, dash: o.dash ?? [f3(b * 0.13), f3(b * 0.1)], pos, boxes, nb: M.nb, hide, o };
  for (let k = 0; k < M.bonds.length; k++) drawBond(ctx, k, at(M.bonds, k));
  drawStubs(ctx, M, o);
  drawDots(g.node, pos, o, b);
  if (o.F !== undefined && o.name !== undefined && o.name !== '') {
    for (let i = 0; i < pos.length; i++) o.F.anchor(`${o.name}.a${i}`, p, at(pos, i)[0], at(pos, i)[1]);
  }
  const bb = g.node.getBBox();
  const atoms: MolResult['atoms'] = [];
  for (let i = 0; i < pos.length; i++) atoms.push({ el: at(M.atoms, i).el, xy: at(pos, i) });
  return { node: g.node, pos, box: { x: bb.x, y: bb.y, w: bb.width, h: bb.height }, atoms };
}
