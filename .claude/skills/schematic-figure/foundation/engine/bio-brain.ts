// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Dash, Handle, Loose, Parent, Point } from './types.ts';
import { el, group, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { clipPath, path, polygon, smooth } from './draw.ts';
import { userGradient } from './geo-vec.ts';
import { bodyGradient, contactShadow, shading, tint, tones } from './illustrate.ts';
import type { Ill, IllOpts, Part, Reg, ShadowKind } from './bio-util.ts';
import { floorOf, fpt, frame, fw, illOf, rad, reg, sumPt } from './bio-util.ts';
import { BRAIN_CB, BRAIN_CB_FLOOR, BRAIN_FISSURES, BRAIN_GROSS, BRAIN_LINES, BRAIN_OUTLINE, BRAIN_REGIONS, REGION_NAMES } from './bio-brain-data.ts';
import type { RegionName } from './bio-brain-data.ts';

const C = STYLE.color;

export type BrainOpts = Reg &
  IllOpts &
  Loose<{
    facing: -1 | 1;
    fill: string;
    stroke: string;
    width: number;
    cerebellum: boolean;
    arbor: string;
    regions: boolean | readonly RegionName[];
    regionFill: string;
    regionStroke: string;
    dash: Dash;
    labels: boolean;
    size: number;
    labelColor: string;
    contrast: number;
    shadow: ShadowKind;
  }>;
export interface BrainRegion {
  d: string;
  center: Point;
}
export interface BrainResult extends Part {
  node: SVGGElement;
  regions: Record<string, BrainRegion>;
  box: { x: number; y: number; w: number; h: number };
  h: number;
}

interface BrainM {
  x: number;
  y: number;
  u: number;
  fc: number;
}

function bm(m: BrainM, q: Point): Point {
  return [m.fc < 0 ? m.x + (q[0] - 26) * m.u : m.x + (1618 - q[0]) * m.u, m.y + (q[1] - 591) * m.u];
}

function bmAll(m: BrainM, pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) out.push(bm(m, q));
  return out;
}

function sm(m: BrainM, pts: readonly Point[], closed: boolean = false, t: number = 0.5): string {
  return smooth(bmAll(m, pts), closed, t);
}

export function brainAt(r: BrainResult, a: number, b: number): Point {
  return [r.box.x + a * r.box.w, r.box.y + b * r.h];
}

function cerebellum(g: Handle, m: BrainM, o: BrainOpts): void {
  const u = m.u;
  const cbD = sm(m, BRAIN_CB, true, 0.4);
  const cg = group(g, { clip: clipPath(g, cbD) });
  path(cg, cbD, { fill: o.arbor ?? '#eceef3', part: 'arbor-vitae' });
  const wt = { stroke: o.fill ?? '#fff', width: 30 * u, fill: 'none', cap: 'round', join: 'round', part: 'folia-block' };
  path(cg, cbD, wt);
  for (const f of BRAIN_FISSURES) path(cg, sm(m, f), { ...wt, width: 26 * u });
}

function namesOf(o: BrainOpts): readonly RegionName[] {
  if (o.regions === true) return REGION_NAMES;
  return o.regions === false || o.regions === undefined ? [] : o.regions;
}

function brainRegions(g: Handle, m: BrainM, o: BrainOpts, K: number): Record<string, BrainRegion> {
  const names = namesOf(o);
  const regions: Record<string, BrainRegion> = {};
  for (const k of REGION_NAMES) {
    const q = bmAll(m, BRAIN_REGIONS[k]);
    const d = smooth(q, true, 0.5);
    regions[k] = { d, center: sumPt(q) };
    if (names.includes(k)) {
      const hasStroke = o.regionStroke !== undefined && o.regionStroke !== '';
      path(g, d, { fill: o.regionFill ?? '#e2e6f4', stroke: o.regionStroke, width: hasStroke ? fw(K, STYLE.line.hair) : undefined, dash: o.dash, part: 'brain-region' });
    }
  }
  return regions;
}

function brainFlat(p: Parent, x: number, y: number, w: number, o: BrainOpts): BrainResult {
  const K = floorOf(p);
  const u = w / 1592;
  const m: BrainM = { x, y, u, fc: o.facing ?? -1 };
  const h = 683 * u;
  const g = el(p, 'g', { 'data-part': o.part ?? 'brain' });
  const gh: Handle = { node: g };
  const st = o.stroke ?? C.ink;
  const ln = { stroke: st, width: fw(K, o.width ?? Math.max(1.8 * u, STYLE.line.thin)), cap: 'round', join: 'round' };
  path(g, sm(m, BRAIN_OUTLINE, true, 0.5), { fill: o.fill ?? '#fff', part: 'brain-fill' });
  if (o.cerebellum !== false) cerebellum(gh, m, o);
  const regions = brainRegions(gh, m, o, K);
  path(g, sm(m, BRAIN_OUTLINE, true, 0.5), { ...ln, part: 'brain-outline' });
  for (const l of BRAIN_LINES) path(g, sm(m, l), { ...ln, part: 'brain-line' });
  if (o.cerebellum !== false) {
    path(g, sm(m, BRAIN_CB_FLOOR, false, 0.4), { ...ln, part: 'brain-line' });
    for (const f of BRAIN_FISSURES) path(g, sm(m, f), { ...ln, part: 'folium' });
  }
  if (o.labels === true) {
    for (const k of namesOf(o)) {
      const c = (regions[k] ?? { center: [0, 0] }).center;
      text(g, c[0], c[1], k, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.labelColor ?? '#4d4d4d', halo: o.regionFill ?? '#e2e6f4', haloWidth: 0.6 });
    }
  }
  const pp: Record<string, Point> = {};
  for (const [k, v] of Object.entries(BRAIN_GROSS)) pp[k] = bm(m, v);
  for (const k of REGION_NAMES) pp[k] = (regions[k] ?? { center: [0, 0] }).center;
  return { node: g, ports: reg(o, p, pp), regions, box: { x, y, w, h }, h };
}

function brainIllustrated(p: Parent, x: number, y: number, w: number, o: BrainOpts, il: Ill): BrainResult {
  const m: BrainM = { x, y, u: w / 1592, fc: o.facing ?? -1 };
  const base = o.fill ?? '#efd3cf';
  const T = tones(base, { contrast: o.contrast ?? il.contrast ?? 0.9 });
  const lo = { light: il.light };
  const d = smooth(bmAll(m, BRAIN_OUTLINE), true, 0.5);
  const wrap = el(p, 'g', { 'data-part': o.part ?? 'brain' });
  const tmp = path(wrap, d, {});
  const bb = tmp.getBBox();
  const box = { x: bb.x, y: bb.y, w: bb.width, h: bb.height };
  tmp.remove();
  const sh = o.shadow ?? il.shadow;
  if (sh !== undefined && sh !== false) contactShadow(wrap, box.x + box.w * 0.52, box.y + box.h * 0.54, box.w * 0.54, box.h * 0.56, { opacity: 0.18, color: T.shadow });
  const fill = bodyGradient(wrap, box, T, lo);
  const r = brainFlat(wrap, x, y, w, {
    ...o, illustrate: false, fill, stroke: o.stroke ?? T.line, arbor: o.arbor ?? tint(base, { l: 0.07, s: -0.15 }), regionFill: o.regionFill ?? tint(base, { l: -0.06, s: 0.1 }), part: 'brain-body',
  });
  const over = shading(wrap, d, box, T, { ...lo, rim: 0.6, highlight: 0.55, highlightSize: [0.5, 0.18], core: 0.3 });
  r.node.insertBefore(over, r.node.querySelector('[data-part=brain-outline]'));
  return { ...r, node: wrap };
}

export function brainSagittal(p: Parent, x: number, y: number, w: number, o: BrainOpts = {}): BrainResult {
  const il = illOf(o);
  return il !== undefined ? brainIllustrated(p, x, y, w, o, il) : brainFlat(p, x, y, w, o);
}

export type RegionOpts = Reg &
  Loose<{ fill: string; stroke: string; width: number; dash: boolean | string; tension: number; label: string; size: number; color: string; labelAt: Point }>;

export function region(p: Parent, pts: readonly Point[], o: RegionOpts = {}): Part & { d: string } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'region' });
  const d = smooth(pts, true, o.tension ?? 0.55);
  const dashOn = o.dash === true || (typeof o.dash === 'string' && o.dash !== '');
  const st = o.stroke ?? (dashOn ? '#3a3a3a' : undefined);
  path(g, d, {
    fill: o.fill ?? '#e2e6f4', stroke: st, width: st !== undefined && st !== '' ? fw(K, o.width ?? STYLE.line.thin) : undefined, dash: o.dash === true ? '1.2 0.9' : typeof o.dash === 'string' && o.dash !== '' ? o.dash : undefined,
  });
  const xs: number[] = [];
  const ys: number[] = [];
  for (const q of pts) {
    xs.push(q[0]);
    ys.push(q[1]);
  }
  const c = sumPt(pts);
  if (o.label !== undefined && o.label !== '') {
    const [lx, ly] = o.labelAt ?? c;
    text(g, lx, ly, o.label, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.color ?? '#4d4d4d' });
  }
  const ports = reg(o, p, { center: c, top: [c[0], Math.min(...ys)], bottom: [c[0], Math.max(...ys)], left: [Math.min(...xs), c[1]], right: [Math.max(...xs), c[1]] });
  return { node: g, d, ports };
}

export type CannulaOpts = Reg &
  Loose<{
    angle: number;
    w: number;
    h: number;
    fibre: number;
    fibreW: number;
    fibreFill: string;
    collar: number;
    body: string;
    light: string;
    glow: boolean;
    spread: number;
    glowLen: number;
    glowFibre: boolean;
  }>;

export function cannula(p: Parent, x: number, y: number, o: CannulaOpts = {}): Part {
  const w = o.w ?? 6;
  const h = o.h ?? 2.2 * w;
  const fib = o.fibre ?? 1.6 * w;
  const fwd = o.fibreW ?? 0.22 * w;
  const ang = o.angle ?? 90;
  const T = frame(x, y, ang - 180);
  const F = frame(x, y, ang);
  const light = o.light ?? '#4aa3df';
  const body = o.body ?? '#6e6e6e';
  const g = el(p, 'g', { 'data-part': o.part ?? 'cannula' });
  const gl = o.glowLen ?? 1.4 * w;
  const spr = Math.tan(rad(o.spread ?? 14));
  if (o.glow !== false) {
    const q: Point[] = [fpt(F, 0, -fwd / 2), fpt(F, gl, -fwd / 2 - gl * spr), fpt(F, gl, fwd / 2 + gl * spr), fpt(F, 0, fwd / 2)];
    polygon(g, q, { fill: userGradient(g, fpt(F, 0, 0), fpt(F, gl, 0), [[0, light, 0.85], [1, light, 0]]), part: 'light-cone' });
  }
  if (o.glowFibre === true) polygon(g, [fpt(T, 0, -fwd * 1.6), fpt(T, fib, -fwd * 1.6), fpt(T, fib, fwd * 1.6), fpt(T, 0, fwd * 1.6)], { fill: light, opacity: 0.35, part: 'fibre-glow' });
  polygon(g, [fpt(T, 0, -fwd / 2), fpt(T, fib, -fwd / 2), fpt(T, fib, fwd / 2), fpt(T, 0, fwd / 2)], { fill: o.fibreFill ?? '#8a8a8a', part: 'fibre' });
  const cl = o.collar ?? 0.1 * h;
  const f0 = fib + cl;
  const f1 = f0 + h;
  polygon(g, [fpt(T, fib, -0.36 * w), fpt(T, f0, -0.36 * w), fpt(T, f0, 0.36 * w), fpt(T, fib, 0.36 * w)], { fill: shade(body, -0.2), part: 'collar' });
  const fg = userGradient(g, fpt(T, f0, -w / 2), fpt(T, f0, w / 2), [[0, shade(body, 0.28)], [0.45, body], [1, shade(body, -0.3)]]);
  polygon(g, [fpt(T, f0, -w / 2), fpt(T, f1, -w / 2), fpt(T, f1, w / 2), fpt(T, f0, w / 2)], { fill: fg, part: 'ferrule' });
  const ports = reg(o, p, { tip: [x, y], top: fpt(T, f1, 0), ferrule: fpt(T, (f0 + f1) / 2, 0), cone: fpt(F, gl, 0) });
  return { node: g, ports };
}
