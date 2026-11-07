// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, path, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import type { Tones } from './illustrate.ts';
import { ball, contactShadow, finish, hashSeed, softSpot, tint, tones } from './illustrate.ts';
import type { Ill, IllOpts, Part, Rand, Reg, ShadowKind } from './bio-util.ts';
import { centroid, floorOf, fw, illOf, lineD, rad, reg, rnd, rng, sampleCurve } from './bio-util.ts';
import { MOUSE } from './bio-mouse-data.ts';
import type { MousePose, MouseTpl, TailPose } from './bio-mouse-data.ts';
import { taperAlong } from './bio-mouse-tail.ts';
import type { MouseM } from './bio-mouse-tail.ts';
import { mapAll, mouseTail, mpt } from './bio-mouse-tail.ts';

const C = STYLE.color;

export type MouseOpts = Reg &
  IllOpts &
  Loose<{
    pose: MousePose;
    facing: -1 | 1;
    angle: number;
    tail: number;
    tailPose: TailPose;
    fill: string;
    skin: string;
    stroke: string;
    width: number;
    whiskers: boolean;
    fur: boolean;
    seed: number;
    shadow: ShadowKind;
  }>;

function furPath(m: MouseM, T: MouseTpl): Point[] {
  const q = T.body.slice(3, 7);
  const pts: Point[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const k = Math.min(2, Math.floor(t * 3));
    const r = t * 3 - k;
    const q0 = at(q, k);
    const q1 = at(q, k + 1);
    const a = q0[0] + (q1[0] - q0[0]) * r;
    const b = q0[1] + (q1[1] - q0[1]) * r;
    pts.push(mpt(m, [a, b + 0.5]), mpt(m, [a + 1.5, b - 3.2 - (i % 2)]));
  }
  return pts;
}

function mousePorts(o: MouseOpts, p: Parent, m: MouseM, T: MouseTpl, top: boolean, tailPts: readonly Point[]): Part['ports'] {
  return reg(o, p, {
    nose: mpt(m, T.nose), eye: mpt(m, T.eye), ear: mpt(m, top ? at(T.ears, 0) : at(T.ear, 2)), head: mpt(m, T.head), back: mpt(m, T.back),
    rump: mpt(m, top ? [0, 0] : [0, -14]), tail: at(tailPts, tailPts.length - 1), chest: mpt(m, T.chest), ground: mpt(m, [50, 0]), center: mpt(m, top ? [50, 0] : [50, -18]),
  });
}

interface FlatCtx {
  g: Handle;
  K: number;
  m: MouseM;
  T: MouseTpl;
  fill: string;
  st: string;
  sw: number;
  whiskers: boolean;
}

function flatTop(c: FlatCtx): void {
  const { g, K, m, T, fill, st, sw } = c;
  const u = m.u;
  const ln = { stroke: st, width: sw, cap: 'round', join: 'round' };
  for (const q of T.feet) {
    const [cx, cy] = mpt(m, q);
    ellipse(g, cx, cy, 3 * u, 2 * u, { fill, ...ln, part: 'paw' });
  }
  path(g, smooth(mapAll(m, T.body), true, 0.5), { fill, ...ln, part: 'body' });
  for (const e of T.ears) {
    const [cx, cy] = mpt(m, e);
    circle(g, cx, cy, 8.5 * u, { fill, ...ln, part: 'ear' });
  }
  for (const e of [T.eye, T.eye2]) {
    const [cx, cy] = mpt(m, e);
    circle(g, cx, cy, 1.4 * u, { fill: st, part: 'eye' });
  }
  if (c.whiskers) {
    for (const s of [-1, 1]) {
      for (const [a, b] of [[107, 7], [109, 3.5]] as const) path(g, smooth([mpt(m, [97, s * 2]), mpt(m, [a, s * b])]), { stroke: st, width: fw(K, sw * 0.45), part: 'whisker' });
    }
  }
}

function flatSide(c: FlatCtx, fur: boolean): void {
  const { g, K, m, T, fill, st, sw } = c;
  const u = m.u;
  const ln = { stroke: st, width: sw, cap: 'round', join: 'round' };
  for (const l of T.far) path(g, smooth(mapAll(m, l)), { ...ln, stroke: shade(st, 0.35), part: 'leg-far' });
  path(g, smooth(mapAll(m, T.body), true, 0.45), { fill, ...ln, part: 'body' });
  path(g, smooth(mapAll(m, T.haunch)), { ...ln, part: 'haunch' });
  for (const l of T.legs) path(g, smooth(mapAll(m, l)), { ...ln, part: 'leg' });
  if (fur) path(g, lineD(furPath(m, T)), { ...ln, width: fw(K, sw * 0.8), part: 'fur' });
  path(g, smooth(mapAll(m, T.ear)), { fill, ...ln, part: 'ear' });
  path(g, smooth(mapAll(m, T.earIn)), { ...ln, width: fw(K, sw * 0.75), part: 'ear-fold' });
  const [ex, ey] = mpt(m, T.eye);
  circle(g, ex, ey, 1.5 * u, { fill: st, part: 'eye' });
  const ns = T.nose;
  const [nx, ny] = mpt(m, [ns[0] - 0.6, ns[1]]);
  circle(g, nx, ny, 1.1 * u, { fill: st, part: 'nose' });
  if (c.whiskers) {
    for (const [a, b] of [[109, ns[1] - 4.5], [110.5, ns[1] - 0.5], [108.5, ns[1] + 3]] as const) {
      path(g, smooth([mpt(m, [ns[0] - 3, ns[1] - 0.8]), mpt(m, [a, b])]), { stroke: st, width: fw(K, sw * 0.45), part: 'whisker' });
    }
  }
}

interface IllCtx {
  g: Handle;
  K: number;
  m: MouseM;
  T: MouseTpl;
  il: Ill;
  R: Rand;
  seed: number;
  TF: Tones;
  TS: Tones;
  line: string;
  sw: number;
  lx: number;
  ly: number;
  ang: number;
  skin: string;
  fur: string;
  furOn: boolean;
  whiskers: boolean;
}

function eyeAt(c: IllCtx, q: Point, s: number): void {
  const { g, K, m, TF, lx, ly } = c;
  const u = m.u;
  const [ex, ey] = mpt(m, q);
  ellipse(g, ex, ey, 1.75 * u * s, 1.55 * u * s, { fill: '#23212a', stroke: TF.deep, width: fw(K, 0.35 * u), part: 'eye' });
  circle(g, ex + lx * 0.6 * u * s, ey + ly * 0.6 * u * s, 0.55 * u * s, { fill: '#fff', opacity: 0.92, part: 'eye-glint' });
}

function whisk(c: IllCtx, from: Point, tips: readonly Point[]): void {
  const { g, K, m, TF, sw } = c;
  for (const t of tips) {
    const mid = mpt(m, [(from[0] + t[0]) / 2, (from[1] + t[1]) / 2 + 0.6]);
    path(g, smooth([mpt(m, from), mid, mpt(m, t)], false, 0.5), { stroke: TF.line, width: fw(K, sw * 0.4), opacity: 0.6, part: 'whisker' });
  }
}

function limb(c: IllCtx, l: readonly Point[], near: boolean): void {
  const { g, K, m, TF, TS, line, sw } = c;
  const u = m.u;
  const P = mapAll(m, l);
  const leg = P.slice(0, -1);
  const foot = P.slice(-2);
  if (leg.length > 1) taperAlong(g, leg, 3.8 * u, 2.2 * u, { fill: near ? TF.base : TF.dark, stroke: line, width: fw(K, sw * 0.75), part: near ? 'leg' : 'leg-far' });
  const a0 = at(foot, 0);
  const a1 = at(foot, 1);
  const fl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]);
  const fr = Math.min(fl * 0.5, 3.6 * u);
  const fa = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]);
  const pc: Point = [a0[0] + Math.cos(fa) * fr * 0.9, a0[1] + Math.sin(fa) * fr * 0.9 - 0.3 * u];
  el(g, 'ellipse', {
    cx: f3(pc[0]), cy: f3(pc[1]), rx: f3(fr), ry: f3(1.05 * u), transform: `rotate(${f3((fa * 180) / Math.PI)} ${f3(pc[0])} ${f3(pc[1])})`,
    fill: near ? TS.base : TS.dark, stroke: TS.line, 'stroke-width': f3(fw(K, sw * 0.55)), 'data-part': 'paw',
  });
}

function illTop(c: IllCtx): void {
  const { g, K, m, T, il, R, seed, TF, TS, line, sw, ang, skin, fur } = c;
  const u = m.u;
  const lo = { light: il.light };
  for (const q of T.feet) {
    const [cx, cy] = mpt(m, q);
    ball(g, cx, cy, 2.6 * u, skin, { ...lo, contrast: 0.8, width: fw(K, sw * 0.6), outline: TS.line, part: 'paw' });
  }
  const body = finish(g, smooth(mapAll(m, T.body), true, 0.5), fur, {
    ...lo, contrast: 1, rim: 0.6, highlight: 0.6, highlightAt: mpt(m, [46, -6]), highlightSize: [0.55, 0.2], highlightRot: ang, width: sw, outline: line, seed, part: 'body',
  });
  for (let i = 0; i < 26; i++) {
    const a = 12 + 70 * rnd(R);
    const s = (rnd(R) - 0.5) * 30;
    const p0 = mpt(m, [a, s]);
    const p1 = mpt(m, [a - 3.2, s * 1.04]);
    path(body.inner, `M${f3(p0[0])},${f3(p0[1])} L${f3(p1[0])},${f3(p1[1])}`, { stroke: TF.dark, width: fw(K, 0.3 * u + 0.1), opacity: 0.5, part: 'fur' });
  }
  for (const e of T.ears) {
    const [cx, cy] = mpt(m, e);
    const ear = ball(g, cx, cy, 8.5 * u, tint(fur, { l: 0.02 }), { ...lo, contrast: 0.8, width: sw, outline: line, part: 'ear' });
    ball(ear.inner, cx + 1.2 * u, cy, 5.6 * u, skin, { ...lo, contrast: 0.8, outline: false, rim: false, highlight: 0.35, part: 'ear-inner' });
  }
  eyeAt(c, T.eye, 0.9);
  eyeAt(c, T.eye2, 0.9);
  const [nx, ny] = mpt(m, T.nose);
  ball(g, nx, ny, 1.4 * u, TS.dark, { ...lo, outline: false, rim: false, highlight: 0.6, part: 'nose' });
  if (c.whiskers) for (const s of [-1, 1]) whisk(c, [97, s * 2], [[107, s * 7], [109, s * 3.5]]);
}

function illFur(c: IllCtx, inner: Parent, ni: number): void {
  const { K, m, T, R, TF } = c;
  const u = m.u;
  const top = sampleCurve(inner, mapAll(m, T.body.slice(1, ni + 1)), 1.9 * u).pts;
  const [ccx, ccy] = mpt(m, [50, -18]);
  for (let i = 0; i < top.length; i++) {
    const q = at(top, i);
    if (i / top.length > 0.86 || i < 2) continue;
    let nx = -q.ty;
    let ny = q.tx;
    if (nx * (ccx - q.x) + ny * (ccy - q.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const L1 = (1.8 + 1.6 * rnd(R)) * u;
    const L2 = (1.2 + 0.8 * rnd(R)) * u;
    const a: Point = [q.x + nx * 0.5 * u, q.y + ny * 0.5 * u];
    const b: Point = [q.x + nx * L1 - q.tx * L2, q.y + ny * L1 - q.ty * L2];
    path(inner, `M${f3(a[0])},${f3(a[1])} L${f3(b[0])},${f3(b[1])}`, { stroke: TF.dark, width: fw(K, 0.28 * u + 0.08), opacity: 0.55, part: 'fur' });
  }
}

function illSide(c: IllCtx): void {
  const { g, K, m, T, il, seed, TF, TS, line, sw, ang, skin, fur } = c;
  const u = m.u;
  const lo = { light: il.light };
  for (const l of T.far) limb(c, l, false);
  let ni = 0;
  for (let i = 0; i < T.body.length; i++) if (at(T.body, i)[0] === T.nose[0] && at(T.body, i)[1] === T.nose[1]) { ni = i; break; }
  const body = finish(g, smooth(mapAll(m, T.body), true, 0.45), fur, {
    ...lo, contrast: 1, rim: 0.6, highlight: 0.6, highlightAt: mpt(m, [T.back[0] + 4, T.back[1] + 6]), highlightSize: [0.62, 0.2], highlightRot: ang - 6 * m.f, width: sw, outline: line, seed, part: 'body',
  });
  illFur(c, body.inner, ni);
  const hc = centroid(T.haunch);
  const [hx, hy] = mpt(m, [hc[0] + 3, hc[1] + 3]);
  softSpot(body.inner, hx, hy, 10 * u, 7 * u, ang, TF.deep, 0.28);
  path(body.inner, smooth(mapAll(m, T.haunch)), { stroke: TF.dark, width: fw(K, sw * 0.9), opacity: 0.85, part: 'haunch' });
  const [kx, ky] = mpt(m, [T.eye[0] - 1, T.eye[1] + 5]);
  softSpot(body.inner, kx, ky, 6 * u, 3.6 * u, ang, TF.glow, 0.45);
  if (c.furOn) path(g, lineD(furPath(m, T)), { stroke: line, width: fw(K, sw * 0.8), part: 'fur' });
  for (const l of T.legs) limb(c, l, true);
  const ear = finish(g, smooth(mapAll(m, T.ear), false, 0.5) + 'Z', tint(fur, { l: 0.02 }), { ...lo, contrast: 0.8, rim: 0.5, highlight: 0.3, width: sw, outline: line, part: 'ear' });
  const ec = centroid(T.ear);
  const small: Point[] = [];
  for (const [a, b] of T.ear) small.push(mpt(m, [ec[0] + (a - ec[0]) * 0.64 + 0.6, ec[1] + (b - ec[1]) * 0.66 + 0.4]));
  finish(ear.inner, smooth(small, true, 0.5), skin, { ...lo, contrast: 0.9, rim: false, highlight: 0.35, outline: false, part: 'ear-inner' });
  eyeAt(c, T.eye, 1);
  const ns = T.nose;
  const [nx, ny] = mpt(m, [ns[0] - 0.8, ns[1]]);
  ball(g, nx, ny, 1.35 * u, TS.dark, { ...lo, outline: false, rim: false, highlight: 0.6, part: 'nose' });
  if (c.whiskers) whisk(c, [ns[0] - 3, ns[1] - 0.8], [[109, ns[1] - 4.5], [110.5, ns[1] - 0.5], [108.5, ns[1] + 3]]);
}

function mouseIllustrated(p: Parent, x: number, y: number, len: number, o: MouseOpts, il: Ill, m: MouseM, T: MouseTpl, tailPts: readonly Point[]): Part {
  const K = floorOf(p);
  const pose = o.pose ?? 'walk';
  const g = el(p, 'g', { 'data-part': o.part ?? 'mouse' });
  const seed = o.seed ?? hashSeed(x, y, len);
  const fur0 = o.fill ?? '#cdd0d8';
  const fur = /^#f{3}(f{3})?$/i.test(fur0) ? '#f1efec' : fur0;
  const skin = o.skin ?? '#eeb0b5';
  const TF = tones(fur);
  const TS = tones(skin);
  const sw = fw(K, o.width ?? Math.max(0.011 * len, STYLE.line.thin));
  const lr = rad(il.light ?? -135);
  const c: IllCtx = {
    g: { node: g }, K, m, T, il, R: rng(seed), seed, TF, TS, line: o.stroke ?? TF.line, sw, lx: Math.cos(lr), ly: Math.sin(lr), ang: o.angle ?? 0, skin, fur, furOn: o.fur === true,
    whiskers: o.whiskers !== false,
  };
  const sh = o.shadow ?? il.shadow ?? true;
  const [gx, gy] = mpt(m, [52, 0]);
  const u = m.u;
  if (sh !== false && pose === 'top') contactShadow(g, gx + 2 * u, gy + 3 * u, 0.55 * len, 0.23 * len, { opacity: 0.2, rot: c.ang, color: TF.shadow });
  else if (sh !== false) contactShadow(g, gx, gy, 0.5 * len, 0.05 * len, { opacity: 0.3, rot: c.ang, color: TF.shadow });
  taperAlong(g, tailPts, 3.4 * u, 0.6 * u, { fill: TS.base, stroke: TS.line, width: fw(K, sw * 0.55), part: 'tail' });
  const lit: Point[] = [];
  for (const [a, b] of tailPts) lit.push([a + c.lx * 0.55 * u, b + c.ly * 0.55 * u]);
  path(g, smooth(lit, false, 0.5), { stroke: TS.glow, width: fw(K, 0.9 * u), opacity: 0.75, part: 'tail-light' });
  if (pose === 'top') illTop(c);
  else illSide(c);
  return { node: g, ports: mousePorts(o, p, m, T, pose === 'top', tailPts) };
}

export function mouse(p: Parent, x: number, y: number, len: number, o: MouseOpts = {}): Part {
  const K = floorOf(p);
  const pose = o.pose ?? 'walk';
  const T = MOUSE[pose];
  const ang = o.angle ?? 0;
  const m: MouseM = { x, y, u: len / 100, f: o.facing ?? 1, ca: Math.cos(rad(ang)), sa: Math.sin(rad(ang)) };
  const tailPts = mapAll(m, mouseTail(T.tail0, 100 * (o.tail ?? 0.85), o.tailPose ?? T.tail));
  const il = illOf(o);
  if (il !== undefined) return mouseIllustrated(p, x, y, len, o, il, m, T, tailPts);
  const g = el(p, 'g', { 'data-part': o.part ?? 'mouse' });
  const st = o.stroke ?? C.ink;
  const c: FlatCtx = {
    g: { node: g }, K, m, T, fill: o.fill ?? '#fff', st, sw: fw(K, o.width ?? Math.max(0.014 * len, STYLE.line.thin)), whiskers: o.whiskers !== false,
  };
  taperAlong(g, tailPts, 3.4 * m.u, 0.5 * m.u, { fill: st, part: 'tail' });
  if (pose === 'top') flatTop(c);
  else flatSide(c, o.fur === true);
  return { node: g, ports: mousePorts(o, p, m, T, pose === 'top', tailPts) };
}
