// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el, group, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, path, radialGradient, rect } from './draw.ts';
import type { Frame, Part, Reg } from './bio-util.ts';
import { BIO, aff, floorOf, fpt, frame, fw, mapD, pol, reg } from './bio-util.ts';

export type AntibodyOpts = Reg &
  Loose<{
    style: 'chains' | 'flat';
    heavy: string;
    light: string;
    color: string;
    hinge: string;
    width: number;
    stalk: number;
    spread: number;
    opacity: number;
  }>;

function bar(g: Handle, K: number, col: string, w: number, a: Point, b: Point): void {
  line(g, a, b, { stroke: col, width: fw(K, w), cap: 'round' });
  line(g, a, b, { stroke: shade(col, 0.88), width: fw(K, w * 0.28), cap: 'round' });
}

function flatAntibody(g: Handle, T: Frame, s: number, K: number, o: AntibodyOpts): Record<string, Point> {
  const col = o.color ?? '#3d7fa6';
  const w = o.width ?? 0.15 * s;
  const st = o.stalk ?? 0;
  const sp = o.spread ?? 36;
  const j = st + 0.45 * s;
  if (st !== 0) {
    for (const k of [-1, 1]) {
      line(g, [0, k * 0.055 * s], [st, k * 0.055 * s], { stroke: shade(col, -0.25), width: fw(K, 0.095 * s), cap: 'butt' });
      line(g, [0, k * 0.055 * s], [st, k * 0.055 * s], { stroke: '#fff', width: fw(K, 0.04 * s), cap: 'butt' });
    }
  }
  bar(g, K, col, w, [st, 0], [j, 0]);
  const e0 = pol(j, 0, 0.55 * s, -sp);
  bar(g, K, col, w, [j, 0], e0);
  const e1 = pol(j, 0, 0.55 * s, sp);
  bar(g, K, col, w, [j, 0], e1);
  return {
    base: fpt(T, 0, 0), fc: fpt(T, st + 0.22 * s, 0), hinge: fpt(T, j, 0), fabL: fpt(T, e0[0], e0[1]), fabR: fpt(T, e1[0], e1[1]), tip: fpt(T, j + 0.5 * s, 0),
  };
}

function seg(g: Handle, w: number, col: string, a: Point, b: Point): void {
  line(g, a, b, { stroke: col, width: w, cap: 'round' });
}

function heavyAt(k: number, sg: number, t: number): Point {
  return [(150 + t * 55) * k, sg * (13 + t * 60) * k];
}

function lightAt(k: number, sg: number, t: number): Point {
  return [(132 + t * 54) * k, sg * (32 + t * 54) * k];
}

function chainAntibody(g: Handle, T: Frame, s: number, K: number, o: AntibodyOpts): Record<string, Point> {
  const k = s / 205;
  const H = o.heavy ?? '#083f92';
  const Lc = o.light ?? '#fa928c';
  const w = fw(K, o.width ?? 19 * k);
  for (const d of [-13, 13]) line(g, [119 * k, d * k], [147 * k, d * k], { stroke: o.hinge ?? '#7a7a7a', width: fw(K, 1.3 * k) });
  for (const d of [-13, 13]) {
    seg(g, w, H, [0, d * k], [48 * k, d * k]);
    seg(g, w, H, [67 * k, d * k], [111 * k, d * k]);
  }
  for (const sg of [-1, 1]) {
    seg(g, w, H, heavyAt(k, sg, 0.03), heavyAt(k, sg, 0.4));
    seg(g, w, H, heavyAt(k, sg, 0.6), heavyAt(k, sg, 0.97));
    seg(g, w, Lc, lightAt(k, sg, 0.03), lightAt(k, sg, 0.38));
    seg(g, w, Lc, lightAt(k, sg, 0.6), lightAt(k, sg, 0.97));
  }
  return {
    base: fpt(T, 0, 0), fc: fpt(T, 55 * k, 0), hinge: fpt(T, 133 * k, 0), fabL: fpt(T, 205 * k, -73 * k), fabR: fpt(T, 205 * k, 73 * k), tip: fpt(T, 205 * k, 0),
  };
}

export function antibody(p: Parent, x: number, y: number, angle: number, s: number, o: AntibodyOpts = {}): Part {
  const K = floorOf(p);
  const g = group(p, { x, y, rotate: angle, part: o.part ?? 'antibody', opacity: o.opacity });
  const T = frame(x, y, angle);
  const ports = (o.style ?? 'chains') === 'flat' ? flatAntibody(g, T, s, K, o) : chainAntibody(g, T, s, K, o);
  reg(o, p, ports);
  return { node: g.node, ports };
}

export interface Band {
  at: number;
  h: number;
  color?: string | undefined;
}
export type DomainOpts = Reg & Loose<{ fill: string; flat: boolean; hi: number; r: number; stroke: string; width: number; bands: readonly Band[] }>;

export function domain(p: Parent, cx: number, cy: number, w: number, h: number, rot: number = 0, o: DomainOpts = {}): Part {
  const K = floorOf(p);
  const g = group(p, { x: cx, y: cy, rotate: rot, part: o.part ?? 'domain' });
  const base = o.fill ?? BIO.receptor;
  const T = frame(cx, cy, rot);
  const fill = o.flat === true ? base : radialGradient(g, [[0, shade(base, o.hi ?? 0.35)], [0.55, shade(base, 0.08)], [1, shade(base, -0.06)]], { cx: 0.5, cy: 0.5, r: 0.62 });
  const sw = fw(K, o.width ?? Math.max(0.035 * Math.min(w, h), STYLE.line.thin));
  const rr = o.r ?? Math.min(w, h) * 0.3;
  const st = o.stroke ?? shade(base, -0.45);
  rect(g, -w / 2, -h / 2, w, h, { r: rr, fill });
  for (const b of o.bands ?? []) {
    rect(g, -w / 2, -h / 2 + h * b.at - (h * b.h) / 2, w, h * b.h, { fill: b.color ?? '#f7ef9c', stroke: st, width: fw(K, sw * 0.8) });
  }
  rect(g, -w / 2, -h / 2, w, h, { r: rr, stroke: st, width: sw });
  const ports = reg(o, p, { center: [cx, cy], top: fpt(T, 0, -h / 2), bottom: fpt(T, 0, h / 2), left: fpt(T, -w / 2, 0), right: fpt(T, w / 2, 0) });
  return { node: g.node, ports };
}

export type PhosphoOpts = Loose<{ color: string; label: string | false; textColor: string; size: number; part: string }>;

export function phospho(p: Parent, x: number, y: number, r: number, o: PhosphoOpts = {}): { node: SVGGElement } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'phospho' });
  const col = o.color ?? '#c8182f';
  const fill = radialGradient(g, [[0, shade(col, 0.4)], [1, shade(col, -0.15)]], { cx: 0.4, cy: 0.35, r: 0.65 });
  circle(g, x, y, r, { fill, stroke: shade(col, -0.45), width: fw(K, 0.08 * r) });
  if (o.label !== false) text(g, x, y, o.label ?? 'P', { anchor: 'middle', valign: 'middle', size: o.size ?? 1.5 * r, color: o.textColor ?? '#fff' });
  return { node: g };
}

export type CarColors = Loose<{ vh: string; vl: string; linker: string; tm: string; costim: string; costim2: string; cd3z: string; itam: string }>;
export type CarStackOpts = Reg & Loose<{ flip: boolean; costim: 1 | 2; itams: number; flat: boolean; width: number; colors: CarColors }>;

interface CarCtx {
  g: Parent;
  m: Parameters<typeof aff>[0];
  u: number;
  k: number;
  sw: number;
  flat: boolean | undefined;
}

function carDomain(c: CarCtx, px: number, py: number, w: number, h: number, rot: number, fill: string, hi: number, r: number | undefined, stroke: string | undefined, bands?: readonly Band[]): void {
  const [x, y] = aff(c.m, px, py);
  domain(c.g, x, y, w * c.u, h * c.u, c.k * rot, { fill, hi, r: r === undefined ? undefined : r * c.u, stroke, width: c.sw, flat: c.flat, bands });
}

interface CarPal {
  vh: string;
  vl: string;
  linker: string;
  tm: string;
  costim: string;
  costim2: string;
  cd3z: string;
  itam: string;
}

function carColors(cc: CarColors): CarPal {
  return {
    vh: cc.vh ?? '#11479e', vl: cc.vl ?? '#ff8c85', linker: cc.linker ?? '#123f8c', tm: cc.tm ?? '#17a285', costim: cc.costim ?? '#c9dff2',
    costim2: cc.costim2 ?? '#e3cde9', cd3z: cc.cd3z ?? '#5fa8d8', itam: cc.itam ?? '#f7ef9c',
  };
}

export function carStack(p: Parent, x: number, y: number, s: number, o: CarStackOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'car' });
  const k = o.flip === true ? -1 : 1;
  const u = s / 35;
  const C0 = carColors(o.colors ?? {});
  const m = { x0: x, y0: y, sx: k * u, sy: u, ax: 344.5, ay: 413 };
  const sw = fw(K, o.width ?? 1.3 * u);
  const lw = fw(K, 3.4 * u);
  path(g, mapD('M434,172 C436,150 460,143 466,160 C474,192 480,262 492,304 C500,332 518,340 530,339 C541,338 544,328 541,318', m), { stroke: C0.linker, width: lw, part: 'linker' });
  path(g, mapD('M384,316 C382,345 360,350 350,362 C344,370 343,376 344,382', m), { stroke: C0.linker, width: lw, part: 'hinge' });
  const c: CarCtx = { g, m, u, k, sw, flat: o.flat };
  carDomain(c, 412, 242, 42, 164, 21, C0.vh, 0.28, undefined, undefined);
  carDomain(c, 519, 245, 42, 166, -15, C0.vl, 0.28, undefined, shade(C0.vl, -0.5));
  const itams = o.itams ?? 3;
  const bands: Band[] = [];
  for (let i = 0; i < itams; i++) bands.push({ at: ((i + 0.5) / itams) * 0.9 + 0.05, h: 0.12, color: C0.itam });
  carDomain(c, 344.5, 653, 35, 136, 0, C0.cd3z, 0.3, 12, shade(C0.cd3z, -0.45), bands);
  if ((o.costim ?? 1) === 2) {
    carDomain(c, 344.5, 482, 35, 68, 0, C0.costim, 0.6, 12, shade(C0.costim, -0.4));
    carDomain(c, 344.5, 550, 35, 68, 0, C0.costim2, 0.6, 12, shade(C0.costim2, -0.4));
  } else carDomain(c, 344.5, 516, 35, 136, 0, C0.costim, 0.6, 13, shade(C0.costim, -0.4));
  carDomain(c, 344.5, 413, 35, 70, 0, C0.tm, 0.25, 11, shade(C0.tm, -0.5));
  const e = 344.5 + 17.5;
  const first = bands[0];
  const ports = reg(o, p, {
    vh: aff(m, 412, 242), vl: aff(m, 519, 245), scfv: aff(m, 466, 150), linker: aff(m, 466, 160), hinge: aff(m, 372, 340), tm: aff(m, e, 413),
    costim: aff(m, e, 516), costim1: aff(m, e, 482), costim2: aff(m, e, 550), cd3z: aff(m, e, 653),
    itam: aff(m, e, 585 + 136 * (first === undefined ? Number.NaN : first.at)), top: aff(m, 466, 140), bottom: aff(m, 344.5, 721),
  });
  return { node: g, ports };
}
