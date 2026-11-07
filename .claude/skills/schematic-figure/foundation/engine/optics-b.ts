// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/optics.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, glow, line, linearGradient, path, polygon, rect, smooth } from './draw.ts';
import { at, linspace } from './util.ts';
import { finish, G } from './optics-a.ts';
import type { OpticOpts, OpticResult } from './optics-a.ts';

const C = STYLE.color;

function pts2(a: readonly Point[]): string {
  let out = '';
  for (let i = 0; i < a.length; i++) {
    const q = at(a, i);
    out += `${i > 0 ? ' L' : ''}${q[0].toFixed(2)},${q[1].toFixed(2)}`;
  }
  return out;
}

export type GaussianBeamOpts = Loose<{ w0: number; xw: number; zR: number; color: string; opacity: number; glowSd: number; core: boolean }>;

export function gaussianBeam(p: Parent, x0: number, x1: number, y: number, o: GaussianBeamOpts = {}): SVGGElement {
  const w0 = o.w0 ?? 1.2;
  const xw = o.xw ?? (x0 + x1) / 2;
  const zR = o.zR ?? 12;
  const color = o.color ?? C.beam;
  const opacity = o.opacity ?? 0.55;
  const g = el(p, 'g', { 'data-part': 'beam' });
  const up: Point[] = [];
  const dn: Point[] = [];
  for (const x of linspace(x0, x1, 80)) {
    const w = w0 * Math.sqrt(1 + ((x - xw) / zR) ** 2);
    up.push([x, y - w]);
    dn.push([x, y + w]);
  }
  const d = `M${pts2(up.concat(dn.toReversed()))}Z`;
  const fill = linearGradient(p, [[0, color, opacity * 0.6], [0.5, color, opacity], [1, color, opacity * 0.6]], 90);
  path(g, d, { fill, filter: glow(p, o.glowSd ?? 0.9) });
  if (o.core ?? true) line(g, [x0, y], [x1, y], { stroke: shade(color, 0.35), width: Math.max(STYLE.line.thin, w0 * 0.35), opacity: 0.9 });
  return g;
}

export type BeamOpts = Loose<{ color: string; width: number; opacity: number; glowSd: number }>;

export function beam(p: Parent, pts: readonly Point[], o: BeamOpts = {}): SVGGElement {
  const color = o.color ?? C.beam;
  const width = o.width ?? 1.6;
  const opacity = o.opacity ?? 0.9;
  const g = el(p, 'g', { 'data-part': 'beam' });
  const d = `M${pts2(pts)}`;
  path(g, d, { stroke: color, width: width * 2.2, opacity: opacity * 0.35, filter: glow(p, o.glowSd ?? 0.8), cap: 'butt' });
  path(g, d, { stroke: color, width, opacity, cap: 'butt' });
  path(g, d, { stroke: shade(color, 0.55), width: width * 0.3, opacity: 0.9, cap: 'butt' });
  return g;
}

export type LightConeOpts = Loose<{ color: string; opacity: number }>;

export function lightCone(p: Parent, x0: number, h0: number, x1: number, h1: number, y: number, o: LightConeOpts = {}): SVGPolygonElement {
  const color = o.color ?? C.beam;
  const opacity = o.opacity ?? 0.35;
  return polygon(p, [[x0, y - h0 / 2], [x1, y - h1 / 2], [x1, y + h1 / 2], [x0, y + h0 / 2]], {
    fill: linearGradient(p, [[0, color, opacity], [1, color, opacity * 0.7]], 0), part: 'beam',
  });
}

export type PulseTrainOpts = Loose<{ n: number; amp: number; width: number; color: string; carrier: number; stroke: number }>;

export function pulseTrain(p: Parent, x0: number, x1: number, y: number, o: PulseTrainOpts = {}): SVGPathElement {
  const n = o.n ?? 4;
  const amp = o.amp ?? 5;
  const width = o.width ?? 2.2;
  const carrier = o.carrier ?? 0;
  const T = (x1 - x0) / n;
  const pts: Point[] = [];
  for (const x of linspace(x0, x1, n * 40)) {
    let v = 0;
    for (let k = 0; k < n; k++) {
      const c = x0 + T * (k + 0.5);
      v += Math.exp(-(((x - c) / width) ** 2)) * (carrier !== 0 ? Math.cos((x - c) * carrier) : 1);
    }
    pts.push([x, y - amp * v]);
  }
  return path(p, smooth(pts, false, 0.5), { stroke: o.color ?? C.beam, width: o.stroke ?? STYLE.line.normal, part: 'pulses' });
}

export type FiberOpts = Loose<{ clad: number; core: number; color: string; coreColor: string; glowCore: boolean; part: string }>;

export function fiber(p: Parent, pts: readonly Point[], o: FiberOpts = {}): SVGGElement {
  const clad = o.clad ?? 2.6;
  const core = o.core ?? 0.9;
  const color = o.color ?? '#f0c36a';
  const g = el(p, 'g', { 'data-part': o.part ?? 'fiber' });
  const d = smooth(pts, false, 0.5);
  path(g, d, { stroke: shade(color, -0.35), width: clad + 0.5 });
  path(g, d, { stroke: color, width: clad });
  path(g, d, { stroke: shade(color, 0.45), width: clad * 0.35, opacity: 0.9 });
  if (o.glowCore ?? false) path(g, d, { stroke: o.coreColor ?? C.beam, width: core, opacity: 0.9, filter: glow(p, 0.6) });
  return g;
}

export type FiberCoilOpts = Loose<{ r: number; turns: number; pitch: number; color: string }> & OpticOpts;

export function fiberCoil(p: Parent, cx: number, cy: number, o: FiberCoilOpts = {}): OpticResult {
  const r = o.r ?? 9;
  const turns = o.turns ?? 5;
  const pitch = o.pitch ?? 1.4;
  const color = o.color ?? '#f0c36a';
  const g = el(p, 'g', { 'data-part': 'fiber-coil' });
  const base = r + turns * pitch * 0.5 + 1.5;
  ellipse(g, cx, cy, base, base * 0.42, { fill: '#e7e7e7', stroke: C.mid, width: STYLE.line.thin });
  for (let k = 0; k < turns; k++) {
    const rr = r + (k - turns / 2) * pitch * 0.5;
    const yy = cy + (k - turns / 2) * pitch;
    ellipse(g, cx, yy, rr, rr * 0.42, { stroke: shade(color, -0.3), width: 1.4 });
    ellipse(g, cx, yy, rr, rr * 0.42, { stroke: color, width: 0.9 });
  }
  return finish(o.F, o.name, g, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy] });
}

export type SlmOpts = Loose<{
  w: number; h: number; n: number; m: number; skew: number; values: readonly (readonly number[])[]; colors: readonly [string, string]; frame: string;
}> & OpticOpts;

function mixHex(c0: string, c1: string, t: number): string {
  let out = '#';
  for (const k of [1, 3, 5]) {
    const a = parseInt(c0.slice(k, k + 2), 16);
    const b = parseInt(c1.slice(k, k + 2), 16);
    out += Math.round(a * (1 - t) + b * t).toString(16).padStart(2, '0');
  }
  return out;
}

function slmValue(values: readonly (readonly number[])[] | undefined, i: number, j: number): number {
  if (values === undefined) return 0.5 + 0.5 * Math.sin(i * 1.3 + j * 0.7);
  return at(at(values, i), j);
}

interface SlmGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  skew: number;
}

function slmPoint(q: SlmGeom, u: number, v: number): Point {
  return [q.x + u * q.w * (1 - q.skew * 0.5), q.y + v * q.h + u * q.h * q.skew * 0.5 - q.h / 2];
}

function slmQuad(q: SlmGeom, u0: number, v0: number, u1: number, v1: number): Point[] {
  return [slmPoint(q, u0, v0), slmPoint(q, u1, v0), slmPoint(q, u1, v1), slmPoint(q, u0, v1)];
}

export function slm(p: Parent, x: number, y: number, o: SlmOpts = {}): OpticResult {
  const q: SlmGeom = { x, y, w: o.w ?? 16, h: o.h ?? 20, skew: o.skew ?? 0.35 };
  const n = o.n ?? 8;
  const m = o.m ?? 10;
  const colors = o.colors ?? ['#1b2a41', '#e8eef7'];
  const g = el(p, 'g', { 'data-part': 'slm' });
  polygon(g, slmQuad(q, -0.06, -0.05, 1.06, 1.05), { fill: o.frame ?? '#2b2f36', stroke: C.ink, width: STYLE.line.thin });
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const col = mixHex(colors[0], colors[1], slmValue(o.values, i, j));
      polygon(g, slmQuad(q, i / n + 0.008, j / m + 0.008, (i + 1) / n - 0.008, (j + 1) / m - 0.008), { fill: col });
    }
  }
  return finish(o.F, o.name, g, {
    center: slmPoint(q, 0.5, 0.5), top: slmPoint(q, 0.5, -0.05), bottom: slmPoint(q, 0.5, 1.05), left: slmPoint(q, 0, 0.5), right: slmPoint(q, 1, 0.5),
  });
}

export type GratingOpts = Loose<{ h: number; teeth: number; depth: number; rot: number }> & OpticOpts;

export function grating(p: Parent, x: number, y: number, o: GratingOpts = {}): OpticResult {
  const h = o.h ?? 16;
  const teeth = o.teeth ?? 8;
  const depth = o.depth ?? 1.6;
  const g = G(p, x, y, o.rot ?? 0, 'grating');
  const s = h / teeth;
  let d = `M0,${-h / 2}`;
  for (let k = 0; k < teeth; k++) d += ` l${-depth},${s * 0.8} l${depth},${s * 0.2}`;
  d += ` L2,${h / 2} L2,${-h / 2}Z`;
  path(g, d, { fill: linearGradient(p, [[0, '#f2f2f2'], [1, C.metal]], 0), stroke: C.ink, width: STYLE.line.thin });
  return finish(o.F, o.name, g, { center: [x, y] });
}

export interface Rng {
  s: number;
}

export function rnd(r: Rng): number {
  r.s = (r.s * 16807) % 2147483647;
  return r.s / 2147483647;
}

export type ScattererOpts = Loose<{ w: number; h: number; seed: number; color: string }> & OpticOpts;

export function scatterer(p: Parent, x: number, y: number, o: ScattererOpts = {}): OpticResult {
  const w = o.w ?? 3;
  const h = o.h ?? 18;
  const color = o.color ?? '#c9c3b8';
  const g = G(p, x, y, 0, 'scatterer');
  rect(g, -w / 2, -h / 2, w, h, { fill: color, stroke: C.ink, width: STYLE.line.thin });
  const r: Rng = { s: o.seed ?? 3 };
  for (let k = 0; k < h * 1.4; k++) {
    const cx = -w / 2 + rnd(r) * w;
    const cy = -h / 2 + rnd(r) * h;
    circle(g, cx, cy, 0.25 + rnd(r) * 0.35, { fill: shade(color, -0.4) });
  }
  return finish(o.F, o.name, g, { in: [x - w / 2, y], out: [x + w / 2, y], center: [x, y], top: [x, y - h / 2], bottom: [x, y + h / 2] });
}

export type SpeckleOpts = Loose<{
  w: number; h: number; n: number; seed: number; palette: readonly string[]; blobs: number; r: number;
}> & OpticOpts;

interface Blob {
  bx: number;
  by: number;
  a: number;
}

export function speckle(p: Parent, x: number, y: number, o: SpeckleOpts = {}): OpticResult {
  const w = o.w ?? 14;
  const h = o.h ?? 14;
  const n = o.n ?? 18;
  const palette = o.palette ?? ['#000004', '#51127c', '#b73779', '#fc8961', '#fcfdbf'];
  const r = o.r ?? 0.16;
  const g = el(p, 'g', { 'data-part': 'speckle' });
  const rg: Rng = { s: o.seed ?? 7 };
  const B: Blob[] = [];
  for (let k = 0; k < (o.blobs ?? 26); k++) {
    const bx = rnd(rg);
    const by = rnd(rg);
    B.push({ bx, by, a: 0.4 + rnd(rg) * 0.6 });
  }
  const cw = w / n;
  const ch = h / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = (i + 0.5) / n;
      const v = (j + 0.5) / n;
      let val = 0;
      for (const b of B) val += b.a * Math.exp(-(((u - b.bx) ** 2 + (v - b.by) ** 2) / (r * r * 0.25)));
      val = Math.min(1, val);
      const k = Math.min(palette.length - 1, Math.floor(val * (palette.length - 1) + 0.5));
      rect(g, x + i * cw, y + j * ch, cw + 0.05, ch + 0.05, { fill: at(palette, k) });
    }
  }
  rect(g, x, y, w, h, { stroke: C.ink, width: STYLE.line.thin });
  return finish(o.F, o.name, g, { center: [x + w / 2, y + h / 2], left: [x, y + h / 2], right: [x + w, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h] });
}
