// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { ellipse, path, smooth } from './draw.ts';
import { at } from './util.ts';
import type { Part, Reg } from './bio-util.ts';
import { BIO, floorOf, fw, rad, reg } from './bio-util.ts';

export type HumanOpts = Reg &
  Loose<{
    armAngle: number | readonly [number, number];
    shoulders: number;
    waist: number;
    hips: number;
    color: string;
    stroke: string;
    width: number;
  }>;

const ARM: readonly Point[] = [
  [-0.14, -0.12], [0.06, -0.2], [0.2, -0.05], [0.22, 0.4], [0.2, 1.0], [0.17, 1.45], [0.16, 1.9], [0.12, 2.55],
  [0.13, 2.7], [0.16, 2.95], [0.15, 3.25], [0.1, 3.42], [0.03, 3.45], [-0.04, 3.38], [-0.07, 3.1],
  [-0.1, 3.0], [-0.17, 2.9], [-0.16, 2.8], [-0.1, 2.72],
  [-0.1, 2.55], [-0.14, 1.9], [-0.15, 1.45], [-0.16, 0.9], [-0.18, 0.35],
];

interface Body {
  cx: number;
  top: number;
  u: number;
  S: number;
}

function bx(b: Body, dx: number): number {
  return b.cx + dx * b.u;
}

function by(b: Body, k: number): number {
  return b.top + k * b.u;
}

function arm(g: Parent, b: Body, sty: Loose<{ fill: string; stroke: string; width: number }>, side: number, ang: number): Point {
  const sx = bx(b, side * 0.74 * b.S);
  const sy = by(b, 1.62);
  const c = Math.cos(rad(-side * ang));
  const s = Math.sin(rad(-side * ang));
  const pts: Point[] = [];
  for (const [ax, ay] of ARM) {
    const px = side * ax * b.u;
    const py = ay * b.u;
    pts.push([sx + px * c - py * s, sy + px * s + py * c]);
  }
  path(g, smooth(pts, true, 0.5), { ...sty, part: 'arm' });
  return at(pts, 12);
}

function torso(g: Parent, b: Body, o: HumanOpts, sty: Loose<{ fill: string; stroke: string; width: number }>): void {
  const S = b.S;
  const Wa = o.waist ?? 1;
  const Hp = o.hips ?? 1;
  const half: Point[] = [
    [0.16, 0.98], [0.15, 1.2], [0.42, 1.33], [0.74 * S, 1.42], [0.9 * S, 1.6], [0.88 * S, 1.85], [0.72 * S, 2.2],
    [0.66, 2.7], [0.52 * Wa, 3.25], [0.58 * Hp, 3.75], [0.72 * Hp, 4.15], [0.66 * Hp, 4.7], [0.48, 5.55], [0.4, 5.85], [0.43, 6.4],
    [0.28, 7.2], [0.3, 7.42], [0.47, 7.56], [0.12, 7.6], [0.1, 7.3], [0.13, 6.4], [0.12, 5.85], [0.14, 5.55], [0.08, 4.6], [0, 4.25],
  ];
  const right: Point[] = [];
  for (const [dx, k] of half) right.push([bx(b, dx), by(b, k)]);
  const left: Point[] = [];
  for (let i = half.length - 2; i >= 0; i--) {
    const [dx, k] = at(half, i);
    left.push([bx(b, -dx), by(b, k)]);
  }
  path(g, smooth([...right, ...left], true, 0.45), { ...sty, part: 'torso' });
}

export function human(p: Parent, cx: number, top: number, h: number, o: HumanOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'human' });
  const b: Body = { cx, top, u: h / 7.6, S: o.shoulders ?? 1 };
  const sty = { fill: o.color ?? BIO.body, stroke: o.stroke, width: o.stroke !== undefined ? fw(K, o.width ?? STYLE.line.thin) : undefined };
  const aa = o.armAngle;
  const both: readonly [number, number] = aa === undefined ? [14, 14] : typeof aa === 'number' ? [aa, aa] : aa;
  const hL = arm(g, b, sty, -1, both[0]);
  const hR = arm(g, b, sty, 1, both[1]);
  torso(g, b, o, sty);
  ellipse(g, cx, by(b, 0.52), 0.37 * b.u, 0.52 * b.u, { ...sty, part: 'head' });
  const ports = reg(o, p, {
    head: [cx, by(b, 0.5)], chest: [cx, by(b, 2.2)], leftHand: hL, rightHand: hR, feet: [cx, by(b, 7.6)],
    leftArm: [bx(b, -1.0 * b.S), by(b, 2.6)], rightArm: [bx(b, 1.0 * b.S), by(b, 2.6)],
  });
  return { node: g, ports };
}

const BACK: readonly Point[] = [
  [0.02, 0], [0.26, 0.06], [0.4, 0.24], [0.42, 0.46], [0.34, 0.7], [0.24, 0.86], [0.22, 1.02], [0.3, 1.2], [0.5, 1.34], [0.66, 1.5],
  [0.72, 1.8], [0.68, 2.4], [0.62, 3.1],
];
const FRONT: readonly Point[] = [
  [-0.56, 3.1], [-0.62, 2.5], [-0.66, 1.95], [-0.58, 1.58], [-0.4, 1.36], [-0.22, 1.24], [-0.17, 1.06], [-0.2, 0.93],
  [-0.31, 0.9], [-0.36, 0.85], [-0.355, 0.78], [-0.385, 0.74], [-0.37, 0.7], [-0.385, 0.66], [-0.38, 0.62], [-0.46, 0.56], [-0.4, 0.44],
  [-0.41, 0.37], [-0.37, 0.2], [-0.2, 0.04], [0.02, 0],
];
const ARM_FORWARD: readonly Point[] = [
  [-0.1, 1.42], [0.26, 1.46], [0.36, 1.9], [0.3, 2.36], [0.1, 2.5], [-0.4, 2.46], [-0.66, 2.42], [-0.82, 2.4], [-0.9, 2.46], [-0.86, 2.52],
  [-0.78, 2.53], [-0.84, 2.6], [-0.78, 2.66], [-0.6, 2.64], [-0.4, 2.68], [0.02, 2.72], [0.12, 2.7], [-0.02, 2.3], [-0.14, 1.9],
];
const ARM_DOWN: readonly Point[] = [
  [-0.12, 1.42], [0.24, 1.46], [0.34, 1.9], [0.3, 2.5], [0.24, 2.9], [0.26, 3.1], [0.16, 3.26], [0.04, 3.24], [0.02, 3.1], [-0.04, 3.0],
  [0.0, 2.92], [0.04, 2.9], [0.04, 2.5], [-0.08, 1.9],
];

interface Bust {
  x: number;
  y: number;
  u: number;
  f: number;
}

function bm(m: Bust, q: Point): Point {
  return [m.x + (m.f < 0 ? q[0] : -q[0]) * m.u, m.y + q[1] * m.u];
}

function bmAll(m: Bust, pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) out.push(bm(m, q));
  return out;
}

export type HumanBustOpts = Reg &
  Loose<{ facing: -1 | 1; arm: 'forward' | 'down' | 'none'; fill: string; stroke: string; width: number; ear: boolean }>;

export function humanBust(p: Parent, x: number, y: number, h: number, o: HumanBustOpts = {}): Part {
  const K = floorOf(p);
  const f = o.facing ?? -1;
  const m: Bust = { x, y, u: h / 3.1, f };
  const fill = o.fill ?? BIO.paper;
  const st = o.stroke ?? BIO.outline;
  const sw = fw(K, o.width ?? Math.max(0.012 * h, STYLE.line.thin));
  const g = el(p, 'g', { 'data-part': o.part ?? 'human-bust' });
  const dB = smooth(bmAll(m, BACK), false, 0.5);
  const dF = smooth(bmAll(m, FRONT), false, 0.5);
  path(g, dB + ' L' + dF.slice(1) + 'Z', { fill });
  path(g, dB, { stroke: st, width: sw });
  path(g, dF, { stroke: st, width: sw });
  if (o.ear !== false) path(g, smooth(bmAll(m, [[0.06, 0.44], [0.13, 0.4], [0.16, 0.5], [0.12, 0.62], [0.06, 0.64]])), { stroke: st, width: sw });
  path(g, smooth(bmAll(m, [[-0.3, 0.46], [-0.26, 0.45]])), { stroke: st, width: fw(K, sw * 1.4) });
  const armKind = o.arm ?? 'forward';
  let hand = bm(m, [0, 2.9]);
  if (armKind !== 'none') {
    const pts = bmAll(m, armKind === 'forward' ? ARM_FORWARD : ARM_DOWN);
    path(g, smooth(pts, true, 0.5), { fill, stroke: st, width: sw, part: 'arm' });
    hand = armKind === 'forward' ? bm(m, [-0.86, 2.5]) : bm(m, [0.14, 3.2]);
  }
  const ports = reg(o, p, {
    head: bm(m, [0, 0.5]), face: bm(m, [-0.46, 0.56]), chest: bm(m, [-0.62, 2.0]), arm: bm(m, [0.3, 2.0]), hand, shoulder: bm(m, [0.1, 1.4]),
  });
  return { node: g, ports };
}
