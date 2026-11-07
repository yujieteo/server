// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/illustrate.js
import type { IllustrateSetting, IllustrateValue, Loose, Point } from './types.ts';
import { STYLE } from './style.ts';
import { at } from './util.ts';

export const TAU: number = Math.PI * 2;

export function clamp(v: number, a: number = 0, b: number = 1): number {
  return Math.min(b, Math.max(a, v));
}

export function illustrating(o: { illustrate?: IllustrateSetting | undefined } = {}): Record<string, IllustrateValue> | null {
  const v = o.illustrate ?? STYLE.illustrate;
  if (v === false) return null;
  const g = typeof STYLE.illustrate === 'object' ? STYLE.illustrate : {};
  return { ...g, ...(typeof v === 'object' ? v : {}) };
}

export function isHex(c: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
}

export function hexToHsl(hex: string): [number, number, number] {
  let c = hex.slice(1);
  if (c.length === 3) c = `${c.charAt(0)}${c.charAt(0)}${c.charAt(1)}${c.charAt(1)}${c.charAt(2)}${c.charAt(2)}`;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let h = 0;
  let s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = 60 * (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  }
  return [h, s, l];
}

function hslChannel(n: number, h: number, a: number, l: number): number {
  const k = (n + h / 30) % 12;
  return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
}

export function hslToHex(h0: number, s0: number, l0: number): string {
  const h = ((h0 % 360) + 360) % 360;
  const s = clamp(s0);
  const l = clamp(l0);
  const a = s * Math.min(l, 1 - l);
  let out = '#';
  for (const n of [0, 8, 4]) out += Math.round(hslChannel(n, h, a, l) * 255).toString(16).padStart(2, '0');
  return out;
}

function toward(h: number, target: number, amt: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(Math.abs(d), amt);
}

export type TintOpts = Loose<{ h: number; s: number; l: number }>;

export function tint(hex: string, o: TintOpts = {}): string {
  if (!isHex(hex)) return hex;
  const [H, S, L] = hexToHsl(hex);
  return hslToHex(H + (o.h ?? 0), S + (o.s ?? 0), L + (o.l ?? 0));
}

export interface Tones {
  base: string;
  light: string;
  glow: string;
  dark: string;
  deep: string;
  line: string;
  shadow: string;
  spec: string;
}

function toneAt(hh: number, k: number, ll0: number, C: number): string {
  const ll = clamp(ll0);
  const room = 1 - Math.abs(2 * ll - 1);
  return hslToHex(hh, room > 1e-6 ? Math.min(1, (C * k) / room) : 0, ll);
}

export function tones(base: string, o: Loose<{ contrast: number }> = {}): Tones {
  if (!isHex(base)) return { base, light: base, glow: '#ffffff', dark: base, deep: base, line: '#555b66', shadow: '#1d2230', spec: '#ffffff' };
  const [h, s, l] = hexToHsl(base);
  const c = o.contrast ?? 1;
  const hs = Math.min(1, s * 3);
  const C = s * (1 - Math.abs(2 * l - 1));
  const warm = toward(h, 50, 7 * c * hs);
  const cool = toward(h, 235, 10 * c * hs);
  return {
    base,
    light: toneAt(warm, 1 - 0.1 * c, l + Math.min(0.5 * (1 - l), 0.16) * c, C),
    glow: toneAt(warm, 0.6, l + (1 - l) * 0.75, C),
    dark: toneAt(cool, 1 + 0.12 * c, l - Math.min(0.16, 0.24 * l) * c, C),
    deep: toneAt(cool, 1 + 0.2 * c, l - Math.min(0.28, 0.4 * l) * c, C),
    line: toneAt(toward(h, 235, 8 * hs), 1.15, l * 0.58, C),
    shadow: hslToHex(toward(h, 235, 25), Math.min(0.3, s * 0.5), 0.2),
    spec: toneAt(warm, 0.2, 0.985, C),
  };
}

export interface Mulberry {
  a: number;
}

export function rng(seed: number = 1): Mulberry {
  const v = (Math.floor(Math.abs(seed) * 1000003) ^ 0x9e3779b9) >>> 0;
  return { a: v === 0 ? 1 : v };
}

export function nextRand(r: Mulberry): number {
  r.a = (r.a + 0x6d2b79f5) >>> 0;
  let t = r.a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function hashSeed(...v: number[]): number {
  let h = 2166136261;
  for (const x of v) {
    h = Math.imul(h ^ (Math.round(x * 1000) | 0), 2654435761) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return (h % 1000003) + 1;
}

export type VaryOpts = Loose<{ size: number; rot: number; aspect: number; hue: number; lum: number; sat: number; jitter: number }>;

export interface VaryResult {
  k: number;
  rot: number;
  aspect: number;
  dx: number;
  dy: number;
  dh: number;
  dl: number;
  ds: number;
  seed: number;
  r: Mulberry;
}

function sym(r: Mulberry): number {
  return 2 * nextRand(r) - 1;
}

export function vary(seed: number, i: number, o: VaryOpts = {}): VaryResult {
  const r = rng(hashSeed(seed, i, 17));
  const k = 1 + (o.size ?? 0.08) * sym(r);
  const rot = (o.rot ?? 12) * sym(r);
  const aspect = 1 + (o.aspect ?? 0.08) * sym(r);
  const dx = (o.jitter ?? 0) * sym(r);
  const dy = (o.jitter ?? 0) * sym(r);
  const dh = (o.hue ?? 5) * sym(r);
  const dl = (o.lum ?? 0.04) * sym(r);
  const ds = (o.sat ?? 0.04) * sym(r);
  return { k, rot, aspect, dx, dy, dh, dl, ds, seed: Math.floor(nextRand(r) * 999983) + 1, r };
}

export function varyTint(v: VaryResult, hex: string): string {
  return tint(hex, { h: v.dh, s: v.ds, l: v.dl });
}

export type WobbleOpts = Loose<{
  amp: number; seed: number; harmonics: readonly number[]; closed: boolean; fine: number; weights: readonly number[];
}>;

interface Harmonic {
  k: number;
  a: number;
  ph: number;
}

function harmonics(ks: readonly number[], R: Mulberry, power: number, scale: number): Harmonic[] {
  const out: Harmonic[] = [];
  for (const k of ks) {
    const a = (0.5 + nextRand(R)) / k ** power;
    out.push({ k, a: a * scale, ph: nextRand(R) * TAU });
  }
  return out;
}

function fineRipples(fine: number, R: Mulberry): Harmonic[] {
  const out: Harmonic[] = [];
  for (const k of [11, 13, 17]) {
    const a = (fine * (0.5 + nextRand(R))) / 3;
    out.push({ k, a, ph: nextRand(R) * TAU });
  }
  return out;
}

function wave(hs: readonly Harmonic[], t: number, v0: number): number {
  let v = v0;
  for (const h of hs) v += h.a * Math.sin(TAU * h.k * t + h.ph);
  return v;
}

export function wobble(pts: readonly Point[], o: WobbleOpts = {}): Point[] {
  const n = pts.length;
  const closed = o.closed ?? true;
  if (n < 3) return copyPoints(pts);
  const cum = [0];
  for (let i = 1; i < n; i++) {
    const a = at(pts, i);
    const b = at(pts, i - 1);
    cum.push(at(cum, i - 1) + Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  const p0 = at(pts, 0);
  const pn = at(pts, n - 1);
  const L = at(cum, n - 1) + (closed ? Math.hypot(p0[0] - pn[0], p0[1] - pn[1]) : 0) || 1;
  const amp = o.amp ?? (closed ? (0.035 * L) / TAU : 0.02 * L);
  const R = rng(o.seed ?? 1);
  const H = harmonics(o.harmonics ?? [2, 3, 4, 5, 7], R, 0.9, 1);
  const F = o.fine !== undefined && o.fine !== 0 ? fineRipples(o.fine, R) : [];
  let hsum = 0;
  for (const h of H) hsum += h.a;
  const norm = hsum / 1.7 || 1;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const q = at(pts, i);
    const a = at(pts, closed ? (i - 1 + n) % n : Math.max(0, i - 1));
    const b = at(pts, closed ? (i + 1) % n : Math.min(n - 1, i + 1));
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const m = Math.hypot(tx, ty) || 1;
    const t = at(cum, i) / L;
    const v = wave(F, t, wave(H, t, 0) / norm);
    const w = (o.weights !== undefined ? at(o.weights, i) : 1) * amp * v;
    out.push([q[0] - (ty / m) * w, q[1] + (tx / m) * w]);
  }
  return out;
}

function copyPoints(pts: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const q of pts) out.push([q[0], q[1]]);
  return out;
}

export type BlobOpts = Loose<{ seed: number; amp: number; n: number; aspect: number; rot: number; harmonics: readonly number[] }>;

export function blob(cx: number, cy: number, r: number, o: BlobOpts = {}): Point[] {
  const R = rng(o.seed ?? 1);
  const n = o.n ?? 48;
  const amp = o.amp ?? 0.06;
  const as = o.aspect ?? 1;
  const rot = ((o.rot ?? 0) * Math.PI) / 180;
  const H = harmonics(o.harmonics ?? [2, 3, 4, 5], R, 0.8, 1);
  let hsum = 0;
  for (const h of H) hsum += h.a;
  const norm = hsum / 1.6;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    let k = 0;
    for (const h of H) k += h.a * Math.cos(h.k * t + h.ph);
    const rr = r * (1 + (amp * k) / norm);
    const x = rr * Math.cos(t) * Math.sqrt(as);
    const y = (rr * Math.sin(t)) / Math.sqrt(as);
    out.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return out;
}
