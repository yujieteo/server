// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Paint, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, path, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import { finish, softSpot, tones, wobble } from './illustrate.ts';
import { userGradient } from './geo-vec.ts';
import type { Ill, IllOpts, Part, Rand, Reg } from './bio-util.ts';
import { bez, floorOf, fw, illOf, lightVec, lineD, pol, rad, reg, rnd, rng, sortByKey, vary, varyTint } from './bio-util.ts';
import { taperCurve } from './bio-arrows.ts';

const C = STYLE.color;

export type RootsOpts = Loose<{ depth: number; n: number; spread: number; color: string; width: number; branch: boolean; seed: number; opacity: number; part: string }>;

export function roots(p: Parent, x: number, yg: number, depth: number, o: RootsOpts = {}): { node: SVGGElement; tips: Point[] } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'roots', opacity: o.opacity });
  const n = o.n ?? 5;
  const spread = o.spread ?? 60;
  const R = rng(o.seed ?? Math.round(x * 3 + depth * 5));
  const col = o.color ?? '#8c7b6b';
  const w0 = o.width ?? Math.max(0.6, 0.07 * depth);
  const tips: Point[] = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
    const a = rad(90 + f * spread);
    const len = depth * (1 - 0.35 * f * f) * (0.9 + 0.2 * rnd(R));
    const s0: Point = [x + f * w0 * 0.6, yg];
    const end: Point = [x + Math.cos(a) * len * 1.1, yg + Math.sin(a) * len];
    const mid: Point = [x + Math.cos(a) * len * 0.35, yg + Math.sin(a) * len * 0.7 + (rnd(R) - 0.5) * 0.1 * len];
    taperCurve(g, [s0, mid, end], w0 * (1 - 0.3 * Math.abs(f)), 0.2, { fill: col, part: 'root' });
    tips.push(end);
    if (o.branch !== false && len > 6) {
      const b0 = bez([s0, mid, end], 0.5);
      const side = f === 0 ? (rnd(R) < 0.5 ? -1 : 1) : Math.sign(f);
      const bl = 0.35 * len;
      const ba = a - side * rad(35);
      taperCurve(g, [b0, [b0[0] + Math.cos(ba) * bl * 0.5, b0[1] + Math.sin(ba) * bl * 0.4], [b0[0] + Math.cos(ba) * bl, b0[1] + Math.sin(ba) * bl]], w0 * 0.45, 0.15, { fill: col, part: 'root' });
    }
  }
  return { node: g, tips };
}

export type TreeKind = 'broadleaf' | 'conifer' | 'palm' | 'seedling';
export type TreeOpts = Reg &
  IllOpts &
  Loose<{
    kind: TreeKind;
    k: number;
    rc: number;
    H: number;
    h0: number;
    ghost: boolean;
    ghostColor: string;
    dash: string;
    fill: string;
    dark: string;
    trunk: string;
    stem: string;
    tiers: number;
    fronds: number;
    lean: number;
    seed: number;
    width: number;
    roots: boolean | RootsOpts;
  }>;
export interface TreeResult extends Part {
  rc: number;
  cy: number;
  top: number;
}

interface TreeCtx {
  g: Handle;
  K: number;
  x: number;
  yg: number;
  h: number;
  rc: number;
  fill: string;
  dark: string;
  trunkCol: string;
  gs: Paint;
  ghost: boolean;
  R: Rand;
  seed: number;
  il: Ill | undefined;
  o: TreeOpts;
}

const TREE_K: Record<TreeKind, number> = { broadleaf: 0.27, conifer: 0.19, palm: 0.34, seedling: 0.3 };
const LOBES: readonly (readonly [number, number, number])[] = [
  [0, -0.35, 0.62], [-0.45, -0.1, 0.55], [0.45, -0.12, 0.55], [-0.2, 0.25, 0.6], [0.25, 0.22, 0.6], [0, 0, 0.7], [-0.6, 0.25, 0.4], [0.6, 0.25, 0.4],
];

function trunkD(x: number, yg: number, yTop: number, tw: number, fl: number): string {
  return (
    `M${f3(x - tw / 2 - fl)},${f3(yg)} Q${f3(x - tw / 2)},${f3(yg - fl * 0.6)} ${f3(x - tw * 0.32)},${f3(yTop)} L${f3(x + tw * 0.32)},${f3(yTop)} ` +
    `Q${f3(x + tw / 2)},${f3(yg - fl * 0.6)} ${f3(x + tw / 2 + fl)},${f3(yg)} Z`
  );
}

function crownPts(lobes: readonly Point[], radii: readonly number[], x: number, cy: number, step: number): Point[] {
  const pts: Point[] = [];
  for (let a = 0; a < 360; a += step) {
    const t = rad(a);
    const ux = Math.cos(t);
    const uy = Math.sin(t);
    let best = 0;
    for (let i = 0; i < lobes.length; i++) {
      const [lx, ly] = at(lobes, i);
      const lr = at(radii, i);
      const px = lx - x;
      const py = ly - cy;
      const dd = px * ux + py * uy;
      const q = dd + Math.sqrt(Math.max(0, lr * lr - (px * px + py * py - dd * dd)));
      if (q > best) best = q;
    }
    pts.push([x + ux * best, cy + uy * best]);
  }
  return pts;
}

function crownIllustrated(c: TreeCtx, il: Ill, cy: number, lobes: readonly Point[], radii: readonly number[], tw: number, fl: number): void {
  const { g, K, x, yg, rc } = c;
  const v = vary(c.seed, 0, { hue: 6, lum: 0.04, sat: 0.05 });
  const base = varyTint(v, c.fill);
  const TT = tones(c.trunkCol);
  path(g, trunkD(x, yg, cy, tw, fl), {
    fill: userGradient(g, [x - tw, yg], [x + tw, yg], [[0, TT.light], [0.45, c.trunkCol], [1, TT.dark]]), stroke: TT.line, width: fw(K, STYLE.line.hair * 1.2), part: 'trunk',
  });
  const d = smooth(wobble(crownPts(lobes, radii, x, cy, 5), { amp: 0.025 * rc, seed: v.seed, harmonics: [5, 7, 9, 12] }), true, 0.5);
  const f = finish(g, d, base, { light: il.light, contrast: 1, rim: 0.5, core: 0.35, highlight: 0.3, width: fw(K, STYLE.line.thin), part: 'crown' });
  const T = f.tones;
  const [lx0, ly0] = lightVec(il);
  const ys: number[] = [];
  for (const q of lobes) ys.push(q[1]);
  const idx: number[] = [];
  for (let i = 0; i < lobes.length; i++) idx.push(i);
  for (const i of sortByKey(idx, ys)) {
    const [lx, ly] = at(lobes, i);
    const lr = at(radii, i);
    softSpot(f.inner, lx - lx0 * 0.3 * lr, ly - ly0 * 0.35 * lr, lr * 0.85, lr * 0.55, 0, T.dark, 0.5);
    softSpot(f.inner, lx + lx0 * 0.3 * lr, ly + ly0 * 0.3 * lr, lr * 0.55, lr * 0.4, -25, T.light, 0.7);
  }
  for (let j = 0; j < Math.min(5, lobes.length); j++) {
    const [lx, ly] = at(lobes, j);
    const arc: Point[] = [];
    for (let i = 0; i < 7; i++) arc.push(pol(lx, ly, at(radii, j) * 0.93, 25 + (130 * i) / 6));
    path(f.inner, smooth(arc), { stroke: T.dark, width: fw(K, STYLE.line.hair * 1.2), opacity: 0.55, part: 'clump' });
  }
}

function broadleaf(c: TreeCtx, cy: number): void {
  const { g, x, yg, h, rc } = c;
  const tw = Math.max(0.5, 0.075 * h);
  const fl = tw * 0.9;
  const lobes: Point[] = [];
  const radii: number[] = [];
  for (const [u, v, q] of LOBES) {
    const lx = x + (u + (rnd(c.R) - 0.5) * 0.08) * rc;
    const ly = cy + (v + (rnd(c.R) - 0.5) * 0.08) * rc;
    lobes.push([lx, ly]);
    radii.push(q * rc);
  }
  if (c.ghost) {
    path(g, smooth(crownPts(lobes, radii, x, cy, 10), true, 0.5), c.gs);
    const yb = cy + rc * 0.62;
    path(g, `M${f3(x - tw / 2 - fl)},${f3(yg)} Q${f3(x - tw / 2)},${f3(yg - fl * 0.6)} ${f3(x - tw * 0.32)},${f3(yb)} M${f3(x + tw * 0.32)},${f3(yb)} Q${f3(x + tw / 2)},${f3(yg - fl * 0.6)} ${f3(x + tw / 2 + fl)},${f3(yg)}`, c.gs);
  } else if (c.il !== undefined) crownIllustrated(c, c.il, cy, lobes, radii, tw, fl);
  else {
    path(g, trunkD(x, yg, cy, tw, fl), { fill: c.trunkCol, part: 'trunk' });
    for (let i = 0; i < lobes.length; i++) circle(g, at(lobes, i)[0], at(lobes, i)[1] + rc * 0.1, at(radii, i), { fill: c.dark, part: 'crown' });
    for (let i = 0; i < lobes.length; i++) circle(g, at(lobes, i)[0], at(lobes, i)[1], at(radii, i) * 0.97, { fill: c.fill, part: 'crown' });
  }
}

interface Tier {
  yA: number;
  yB: number;
  hw: number;
}

function tierAt(rc: number, top: number, base: number, n: number, i: number): Tier {
  const f1 = Math.min(1, (i + 1.35) / n);
  return { yA: top + (base - top) * (i / n) * 0.92, yB: top + (base - top) * f1, hw: rc * (0.25 + 0.75 * f1) };
}

function tierD(x: number, t: Tier): string {
  const { yA, yB, hw } = t;
  return (
    `M${f3(x)},${f3(yA)} Q${f3(x - hw * 0.35)},${f3(yA + (yB - yA) * 0.55)} ${f3(x - hw)},${f3(yB)} Q${f3(x)},${f3(yB - (yB - yA) * 0.12)} ${f3(x + hw)},${f3(yB)} ` +
    `Q${f3(x + hw * 0.35)},${f3(yA + (yB - yA) * 0.55)} ${f3(x)},${f3(yA)} Z`
  );
}

function coniferGhost(c: TreeCtx, n: number, top: number, base: number): void {
  const { x } = c;
  const right: Point[] = [[x, top]];
  for (let i = 0; i < n; i++) {
    const t = tierAt(c.rc, top, base, n, i);
    right.push([x + t.hw, t.yB]);
    if (i < n - 1) right.push([x + 0.3 * tierAt(c.rc, top, base, n, i + 1).hw, t.yB - 0.12 * (t.yB - t.yA)]);
  }
  const left: Point[] = [];
  for (let i = right.length - 1; i >= 1; i--) left.push([2 * x - at(right, i)[0], at(right, i)[1]]);
  path(c.g, lineD([...right, ...left], true), c.gs);
  line(c.g, [x, c.yg], [x, base], c.gs);
}

function conifer(c: TreeCtx): number {
  const { g, x, yg, h } = c;
  const n = c.o.tiers ?? Math.max(3, Math.min(6, Math.round(h / 18) + 2));
  const base = yg - 0.14 * h;
  const top = yg - h;
  const tw = Math.max(0.5, 0.06 * h);
  if (!c.ghost) path(g, trunkD(x, yg, base - 0.05 * h, tw, tw * 0.6), { fill: c.trunkCol, part: 'trunk' });
  if (c.ghost) {
    coniferGhost(c, n, top, base);
    return (base + top) / 2;
  }
  for (let i = n - 1; i >= 0; i--) {
    const t = tierAt(c.rc, top, base, n, i);
    const tier = tierD(x, t);
    if (c.il !== undefined) {
      const col = varyTint(vary(c.seed, 0, { hue: 6, lum: 0.04 }), c.fill);
      finish(g, tier, col, { light: c.il.light, contrast: 0.9, rim: 0.45, core: 0.3, highlight: 0.3, highlightSize: [0.3, 0.14], width: fw(c.K, STYLE.line.hair * 1.2), part: 'crown' });
      continue;
    }
    path(g, tier, { fill: c.dark, part: 'crown' });
    el(g, 'path', { d: tier, fill: c.fill, transform: `translate(0 ${f3(-0.07 * (t.yB - t.yA))})`, 'data-part': 'crown' });
  }
  return (base + top) / 2;
}

function palm(c: TreeCtx): number {
  const { g, x, yg, h, rc, K } = c;
  const lean = c.o.lean ?? 0.12 * h;
  const topP: Point = [x + lean, yg - h + 0.08 * h];
  const tw = Math.max(0.6, 0.05 * h);
  const ctrl: Point = [x + lean * 0.1, yg - 0.55 * h];
  const spine: Point[] = [[x, yg], ctrl, topP];
  if (c.ghost) path(g, `M${f3(x)},${f3(yg)} Q${f3(ctrl[0])},${f3(ctrl[1])} ${f3(topP[0])},${f3(topP[1])}`, c.gs);
  else {
    taperCurve(g, spine, tw * 1.4, tw * 0.8, { fill: c.trunkCol, part: 'trunk' });
    for (let i = 1; i < 10; i++) {
      const q = bez(spine, i / 10);
      const wv = (tw * (1.4 - (0.6 * i) / 10)) / 2;
      line(g, [q[0] - wv, q[1]], [q[0] + wv, q[1] + wv * 0.25], { stroke: shade(c.trunkCol, -0.25), width: fw(K, 0.1 * tw), part: 'trunk-ring' });
    }
  }
  const nf = c.o.fronds ?? 7;
  for (let i = 0; i < nf; i++) {
    const a = -90 + (i - (nf - 1) / 2) * (160 / Math.max(1, nf - 1));
    const L1 = rc * (0.85 + 0.25 * rnd(c.R));
    const droop = 0.5 * L1 * Math.abs(Math.cos(rad(a)));
    const end: Point = [topP[0] + L1 * Math.cos(rad(a)), topP[1] + L1 * Math.sin(rad(a)) + droop];
    const mid: Point = [topP[0] + 0.55 * L1 * Math.cos(rad(a)), topP[1] + 0.55 * L1 * Math.sin(rad(a)) - 0.25 * droop];
    if (c.ghost) path(g, `M${f3(topP[0])},${f3(topP[1])} Q${f3(mid[0])},${f3(mid[1])} ${f3(end[0])},${f3(end[1])}`, c.gs);
    else taperCurve(g, [topP, mid, end], 0.2 * L1, 0.02 * L1, { fill: i % 2 !== 0 ? c.dark : c.fill, part: 'frond' });
  }
  return topP[1];
}

function seedling(c: TreeCtx): number {
  const { g, x, yg, h, K } = c;
  const top = yg - h;
  const lw = fw(K, c.o.width ?? Math.max(0.035 * h, STYLE.line.thin));
  const lf = c.rc;
  if (c.ghost) path(g, `M${f3(x)},${f3(yg)} L${f3(x)},${f3(top)}`, c.gs);
  else path(g, `M${f3(x)},${f3(yg)} Q${f3(x + 0.08 * h)},${f3(yg - 0.5 * h)} ${f3(x)},${f3(top)}`, { stroke: c.o.stem ?? shade(c.fill, -0.35), width: lw, part: 'stem' });
  for (const sgn of [-1, 1]) {
    const tip: Point = [x + sgn * lf, top - 0.35 * lf];
    const c1: Point = [x + sgn * 0.45 * lf, top - 0.75 * lf];
    const c2: Point = [x + sgn * 0.55 * lf, top + 0.2 * lf];
    const d = `M${f3(x)},${f3(top)} Q${f3(c1[0])},${f3(c1[1])} ${f3(tip[0])},${f3(tip[1])} Q${f3(c2[0])},${f3(c2[1])} ${f3(x)},${f3(top)} Z`;
    path(g, d, c.ghost ? c.gs : { fill: sgn < 0 ? c.dark : c.fill, part: 'leaf' });
  }
  return top;
}

export function tree(p: Parent, x: number, yg: number, h: number, o: TreeOpts = {}): TreeResult {
  const K = floorOf(p);
  const kind = o.kind ?? 'broadleaf';
  const seed = o.seed ?? Math.round(x * 7 + h * 13);
  const h0 = o.h0 ?? h;
  const rc = o.rc ?? (o.k ?? TREE_K[kind]) * h0 * (h / h0) ** (o.H ?? 1);
  const g = el(p, 'g', { 'data-part': o.part ?? 'tree' });
  const fill = o.fill ?? (kind === 'conifer' ? '#9fb89d' : '#b9c7b1');
  const gs: Paint = { stroke: o.ghostColor ?? C.mid, width: fw(K, o.width ?? STYLE.line.thin), dash: o.dash ?? '1.4 1.1', fill: 'none', part: 'ghost' };
  const c: TreeCtx = {
    g: { node: g }, K, x, yg, h, rc, fill, dark: o.dark ?? shade(fill, -0.16), trunkCol: o.trunk ?? '#8c7b6b', gs, ghost: o.ghost === true, R: rng(seed), seed, il: illOf(o), o,
  };
  if (o.roots !== undefined && o.roots !== false) {
    const ro = o.roots === true ? {} : o.roots;
    roots(g, x, yg, ro.depth ?? Math.min(0.3 * h, 3 + 0.2 * h), ro);
  }
  const cy0 = yg - h + rc;
  let cy = cy0;
  if (kind === 'broadleaf') broadleaf(c, cy0);
  else if (kind === 'conifer') cy = conifer(c);
  else if (kind === 'palm') cy = palm(c);
  else cy = seedling(c);
  const ports = reg(o, p, { base: [x, yg], top: [x, yg - h], crown: [x, cy], left: [x - rc, cy], right: [x + rc, cy] });
  return { node: g, ports, rc, cy, top: yg - h };
}
