// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/illustrate.js
import type { GradientStop, Loose, Parent, Point, Rect } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { defsOf } from './svgdefs.ts';
import { f3 } from './util.ts';
import { nextRand, rng, tones, varyTint, vary, TAU } from './illustrate-core.ts';
import type { Tones, VaryOpts } from './illustrate-core.ts';

let iid = 0;

function addStops(g: Element, stops: readonly GradientStop[]): void {
  for (const [o, c, op] of stops) el(g, 'stop', { offset: f3(o), 'stop-color': c, 'stop-opacity': op ?? 1 });
}

export function ellipseGradient(p: Parent, cx: number, cy: number, rx: number, ry: number, rot: number, stops: readonly GradientStop[]): string {
  iid += 1;
  const id = `il${iid}`;
  const g = el(defsOf(p), 'radialGradient', {
    id, gradientUnits: 'userSpaceOnUse', cx: 0, cy: 0, r: 1,
    gradientTransform: `translate(${f3(cx)} ${f3(cy)}) rotate(${f3(rot)}) scale(${f3(Math.max(rx, 1e-3))} ${f3(Math.max(ry, 1e-3))})`,
  });
  addStops(g, stops);
  return `url(#${id})`;
}

function lineGradient(p: Parent, a: Point, b: Point, stops: readonly GradientStop[]): string {
  iid += 1;
  const id = `il${iid}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  addStops(g, stops);
  return `url(#${id})`;
}

function clipOf(p: Parent, d: string): string {
  iid += 1;
  const id = `il${iid}`;
  const c = el(defsOf(p), 'clipPath', { id });
  el(c, 'path', { d });
  return `url(#${id})`;
}

function measure(p: Parent, d: string): Rect {
  const t = el(p, 'path', { d });
  const b = t.getBBox();
  t.remove();
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}

export type IllumLight = Loose<{ light: number }>;

function lightVec(o: IllumLight): [number, number, number] {
  const ill = STYLE.illustrate;
  const gl = typeof ill === 'object' ? ill['light'] : undefined;
  const a = ((o.light ?? (typeof gl === 'number' ? gl : undefined) ?? -135) * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), a];
}

export type ContactShadowOpts = Loose<{ opacity: number; color: string; rot: number }>;

export function contactShadow(p: Parent, cx: number, cy: number, rx: number, ry: number, o: ContactShadowOpts = {}): SVGEllipseElement {
  const c = o.color ?? '#1d2230';
  const op = o.opacity ?? 0.26;
  return el(p, 'ellipse', {
    cx: f3(cx), cy: f3(cy), rx: f3(rx), ry: f3(ry),
    fill: ellipseGradient(p, cx, cy, rx, ry, o.rot ?? 0, [[0, c, op], [0.5, c, op * 0.6], [1, c, 0]]),
    'data-part': 'contact-shadow',
  });
}

export function softSpot(p: Parent, cx: number, cy: number, rx: number, ry: number, rot: number, color: string = '#fff', op: number = 0.7): SVGEllipseElement {
  return el(p, 'ellipse', {
    cx: f3(cx), cy: f3(cy), rx: f3(rx), ry: f3(ry), transform: rot !== 0 ? `rotate(${f3(rot)} ${f3(cx)} ${f3(cy)})` : undefined,
    fill: ellipseGradient(p, cx, cy, rx, ry, 0, [[0, color, op], [0.45, color, op * 0.55], [1, color, 0]]),
    'data-part': 'highlight',
  });
}

export type ShadowKind = boolean | 'drop' | 'ground' | 'offset';
export type ShadowSpec = Loose<{ kind: 'drop' | 'ground' | 'offset'; opacity: number; dx: number; dy: number; y: number; rx: number; ry: number }>;

export type FinishOpts = IllumLight & Loose<{
  contrast: number; shadow: ShadowKind | ShadowSpec; rim: number | false; rimWidth: number; core: number; coreWidth: number;
  highlight: number | false; highlightAt: Point; highlightSize: Point; highlightRot: number; outline: string | false; width: number;
  mottle: number; seed: number; box: Rect; tones: Partial<Tones>; part: string; bodyPart: string; outlinePart: string;
}>;

export interface FinishResult {
  node: SVGGElement;
  inner: SVGGElement;
  over: SVGGElement;
  box: Rect;
  tones: Tones;
  clip: string;
  fill: string;
}

function radii(b: Rect): [number, number, number, number, number] {
  const rx = b.w / 2 || 1;
  const ry = b.h / 2 || 1;
  return [b.x + rx, b.y + ry, rx, ry, Math.min(rx, ry)];
}

export function bodyGradient(p: Parent, b: Rect, T0: Tones | string, o: FinishOpts = {}): string {
  const T = typeof T0 === 'string' ? tones(T0, { contrast: o.contrast ?? 1 }) : T0;
  const [cx, cy, rx, ry] = radii(b);
  const [lx, ly] = lightVec(o);
  return ellipseGradient(p, cx + lx * 0.5 * rx, cy + ly * 0.5 * ry, rx * 1.6, ry * 1.6, 0, [[0, T.light], [0.33, T.base], [0.74, T.dark], [1, T.deep]]);
}

function shadowSpec(s: ShadowKind | ShadowSpec | undefined): ShadowSpec {
  if (typeof s === 'object') return s;
  if (s === undefined || s === true || s === false) return { kind: 'drop' };
  return { kind: s };
}

export function shapeShadow(p: Parent, d: string, b: Rect, T: Tones, o: FinishOpts = {}): SVGElement {
  const [cx, cy, rx, ry, rm] = radii(b);
  const [lx, ly] = lightVec(o);
  const sh = shadowSpec(o.shadow);
  const kind = sh.kind ?? 'drop';
  const op = sh.opacity ?? (kind === 'ground' ? 0.3 : 0.2);
  if (kind === 'ground') {
    return contactShadow(p, cx - lx * 0.1 * rx + (sh.dx ?? 0), sh.y ?? b.y + b.h, sh.rx ?? rx * 0.92, sh.ry ?? Math.max(0.09 * rx, 0.1 * ry), { opacity: op, color: T.shadow });
  }
  if (kind === 'offset') {
    return el(p, 'path', {
      d, fill: T.shadow, opacity: op, transform: `translate(${f3(sh.dx ?? -lx * 0.12 * rm)} ${f3(sh.dy ?? -ly * 0.12 * rm)})`, 'data-part': 'contact-shadow',
    });
  }
  return contactShadow(p, cx - lx * 0.13 * rm + (sh.dx ?? 0), cy - ly * 0.13 * rm + (sh.dy ?? 0), rx * 1.1, ry * 1.1, { opacity: op, color: T.shadow });
}

function mottle(p: Parent, b: Rect, T: Tones, n: number, seed: number | undefined): void {
  const [cx, cy, rx, ry, rm] = radii(b);
  const R = rng(seed ?? 3);
  for (let i = 0; i < n; i++) {
    const a = nextRand(R) * TAU;
    const q = Math.sqrt(nextRand(R)) * 0.75;
    const mx = cx + Math.cos(a) * q * rx;
    const my = cy + Math.sin(a) * q * ry;
    const mr = rm * (0.16 + 0.2 * nextRand(R));
    const w = mr * (1 + 0.5 * nextRand(R));
    const rot = nextRand(R) * 180;
    softSpot(p, mx, my, w, mr, rot, i % 2 !== 0 ? T.dark : T.light, 0.35);
  }
}

export type ShadingOpts = FinishOpts & Loose<{ clip: string }>;

function pickAmount(v: number | false | undefined, dflt: number): number {
  if (v === false) return 0;
  return typeof v === 'number' ? v : dflt;
}

function bandStroke(over: Element, d: string, stroke: string, width: number): void {
  el(over, 'path', { d, fill: 'none', stroke, 'stroke-width': f3(width), 'stroke-linejoin': 'round', 'data-part': 'shade-block' });
}

export function shading(p: Parent, d: string, b: Rect, T0: Tones | string, o: ShadingOpts = {}): SVGGElement {
  const T = typeof T0 === 'string' ? tones(T0, { contrast: o.contrast ?? 1 }) : T0;
  const [cx, cy, rx, ry, rm] = radii(b);
  const [lx, ly, la] = lightVec(o);
  const over = el(p, 'g', { 'clip-path': o.clip ?? clipOf(p, d), 'data-part': 'shading' });
  const A: Point = [cx + lx * rx, cy + ly * ry];
  const B: Point = [cx - lx * rx, cy - ly * ry];
  const core = o.core ?? 0.35;
  if (core !== 0) bandStroke(over, d, lineGradient(p, A, B, [[0, T.deep, 0], [0.5, T.deep, 0], [1, T.deep, core]]), Math.max(0.26, o.coreWidth ?? rm * 0.55));
  const rim = pickAmount(o.rim, 0.7);
  if (rim !== 0) bandStroke(over, d, lineGradient(p, A, B, [[0, T.glow, 0], [0.45, T.glow, 0], [1, T.glow, rim]]), Math.max(0.26, o.rimWidth ?? rm * 0.16));
  const hl = pickAmount(o.highlight, 0.75);
  if (hl !== 0) {
    const [hx, hy] = o.highlightAt ?? [cx + lx * 0.46 * rx, cy + ly * 0.46 * ry];
    const [sx, sy] = o.highlightSize ?? [0.42, 0.24];
    softSpot(over, hx, hy, sx * Math.max(rm, Math.min(rx, ry * 1.6)), sy * Math.max(rm, Math.min(ry, rx * 1.6)), o.highlightRot ?? (la * 180) / Math.PI + 90, T.spec, hl);
  }
  return over;
}

function mergeTones(base: Tones, over: Partial<Tones> | undefined): Tones {
  const out: Tones = { ...base };
  if (over === undefined) return out;
  for (const k of ['base', 'light', 'glow', 'dark', 'deep', 'line', 'shadow', 'spec'] as const) {
    const v = over[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

export function finish(p: Parent, d: string, base: string, o: FinishOpts = {}): FinishResult {
  const g = el(p, 'g', { 'data-part': o.part ?? 'illustrated' });
  const b = o.box ?? measure(g, d);
  const T = mergeTones(tones(base, { contrast: o.contrast ?? 1 }), o.tones);
  if (o.shadow !== undefined && o.shadow !== false) shapeShadow(g, d, b, T, o);
  const fill = bodyGradient(g, b, T, o);
  el(g, 'path', { d, fill, 'data-part': o.bodyPart ?? 'body' });
  const clip = clipOf(g, d);
  const inner = el(g, 'g', { 'clip-path': clip });
  if (o.mottle !== undefined && o.mottle !== 0) mottle(inner, b, T, o.mottle, o.seed);
  const over = shading(g, d, b, T, { ...o, clip });
  if (o.outline !== false) {
    el(g, 'path', {
      d, fill: 'none', stroke: o.outline ?? T.line, 'stroke-width': f3(o.width ?? STYLE.line.thin), 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-part': o.outlinePart ?? 'outline',
    });
  }
  return { node: g, inner, over, box: b, tones: T, clip, fill };
}

export function ball(p: Parent, cx: number, cy: number, r: number, color: string, o: FinishOpts = {}): FinishResult {
  const d = `M${f3(cx - r)},${f3(cy)} a${f3(r)},${f3(r)} 0 1,0 ${f3(2 * r)},0 a${f3(r)},${f3(r)} 0 1,0 ${f3(-2 * r)},0Z`;
  return finish(p, d, color, {
    core: 0.25, rimWidth: r * 0.2, highlightSize: [0.46, 0.3],
    width: Math.max(STYLE.line.min * 1.04, Math.min(STYLE.line.thin, r * 0.12)), part: 'ball', ...o,
    box: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r },
  });
}

export type ParticlesOpts = FinishOpts & Loose<{ vary: VaryOpts; colors: readonly string[] }>;

export interface ParticleItem {
  x: number;
  y: number;
  r: number;
  color: string;
}

export function particles(p: Parent, pts: readonly Point[], r: number, color: string, o: ParticlesOpts = {}): { node: SVGGElement; items: ParticleItem[] } {
  const { vary: vo, colors, seed, part, ...bo } = o;
  const g = el(p, 'g', { 'data-part': part ?? 'particles' });
  const items: ParticleItem[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i] ?? [0, 0];
    const v = vary(seed ?? 1, i, { size: 0.15, lum: 0.05, ...vo });
    const c = varyTint(v, colors !== undefined ? (colors[i % colors.length] ?? color) : color);
    const rr = r * v.k;
    ball(g, x + v.dx, y + v.dy, rr, c, { ...bo, part: 'particle' });
    items.push({ x: x + v.dx, y: y + v.dy, r: rr, color: c });
  }
  return { node: g, items };
}
