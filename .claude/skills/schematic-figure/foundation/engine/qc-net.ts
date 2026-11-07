// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { Loose, Parent, Point } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { blur, circle, line, path, polygon, rect } from './draw.ts';
import { at, f3, unit } from './util.ts';
import { p2, polyD } from './cs-base.ts';
import { C, shadowOf, w0 } from './qc-base.ts';

export type ModuleOpts = Loose<{
  part: string;
  n: number;
  ringR: number;
  qr: number;
  rotate: number;
  color: string;
  colors: readonly string[];
  highlight: Record<number, string>;
  edges: 'all' | 'ring' | 'none' | readonly (readonly [number, number])[];
  edgeColor: string;
  edgeWidth: number;
  fill: string;
  stroke: string;
  width: number;
  shadow: boolean | string;
  qubitShadow: boolean | string;
}>;

function modulePairs(E: NonNullable<ModuleOpts['edges']>, n: number): (readonly [number, number])[] {
  if (typeof E !== 'string') return [...E];
  const pairs: [number, number][] = [];
  if (E === 'ring') {
    for (let i = 0; i < n; i++) pairs.push([i, (i + 1) % n]);
  } else if (E === 'all') {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) pairs.push([i, j]);
    }
  }
  return pairs;
}

export function moduleNode(p: Parent, cx: number, cy: number, r: number, o: ModuleOpts = {}): { node: SVGGElement; qubits: Point[] } {
  const g = el(p, 'g', { 'data-part': o.part ?? 'module' });
  const n = o.n ?? 4;
  const rr = o.ringR ?? r * 0.52;
  const qr = o.qr ?? r * 0.24;
  const a0 = ((o.rotate ?? 90) * Math.PI) / 180;
  circle(g, cx, cy, r, { fill: o.fill ?? '#fff', stroke: o.stroke ?? C.ink, width: o.width ?? w0(), filter: shadowOf(p, o.shadow) });
  const q: Point[] = [];
  for (let k = 0; k < n; k++) q.push([cx + rr * Math.cos(a0 + (2 * Math.PI * k) / n), cy + rr * Math.sin(a0 + (2 * Math.PI * k) / n)]);
  for (const [i, j] of modulePairs(o.edges ?? 'all', n)) {
    line(g, at(q, i), at(q, j), { stroke: o.edgeColor ?? C.light, width: o.edgeWidth ?? STYLE.line.thin });
  }
  for (let k = 0; k < q.length; k++) {
    const [x, y] = at(q, k);
    circle(g, x, y, qr, { fill: o.highlight?.[k] ?? o.colors?.[k] ?? o.color ?? C.orange, filter: shadowOf(p, o.qubitShadow) });
  }
  return { node: g, qubits: q };
}

export type EnclosureOpts = Loose<{ part: string; angle: number; r: number; fill: string; stroke: string; width: number; dash: string; shadow: boolean | string }>;

export function enclosure(p: Parent, cx: number, cy: number, len: number, wid: number, o: EnclosureOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'enclosure', transform: `translate(${f3(cx)} ${f3(cy)}) rotate(${o.angle ?? 0})` });
  rect(g, -len / 2, -wid / 2, len, wid, { r: o.r ?? Math.min(len, wid) * 0.25, fill: o.fill ?? '#fff', stroke: o.stroke ?? C.ink, width: o.width ?? w0(), dash: o.dash, filter: shadowOf(p, o.shadow) });
  return g;
}

export type PhotonOpts = Loose<{ part: string; angle: number; len: number; amp: number; cycles: number; color: string; width: number; head: boolean; headLength: number }>;

export function photon(p: Parent, cx: number, cy: number, o: PhotonOpts = {}): SVGGElement {
  const len = o.len ?? 8;
  const amp = o.amp ?? 1.3;
  const cyc = o.cycles ?? 3.5;
  const a = ((o.angle ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts: Point[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60 - 0.5;
    const u = t * len;
    const v = -amp * Math.exp((-t * t) / 0.06) * Math.sin(2 * Math.PI * cyc * t);
    pts.push([cx + u * c - v * s, cy + u * s + v * c]);
  }
  const g = el(p, 'g', { 'data-part': o.part ?? 'photon' });
  const col = o.color ?? C.sky;
  path(g, polyD(pts), { stroke: col, width: o.width ?? STYLE.line.thin * 1.2 });
  if (o.head === true) {
    const L = o.headLength ?? 2;
    const t: Point = [cx + (len / 2 + L * 0.9) * c, cy + (len / 2 + L * 0.9) * s];
    const b: Point = [cx + (len / 2) * c, cy + (len / 2) * s];
    polygon(g, [t, [b[0] - s * L * 0.45, b[1] + c * L * 0.45], [b[0] + s * L * 0.45, b[1] - c * L * 0.45]], { fill: col });
  }
  return g;
}

export type EntangleOpts = Loose<{
  part: string;
  style: 'helix' | 'wavy';
  halfTurns: number;
  amp: number;
  color: string;
  width: number;
  glow: boolean;
  glowBlur: number;
  glowColor: string;
  glowWidth: number;
  dots: boolean;
  dotR: number;
}>;

function strandD(a: Point, b: Point, amp: number, ht: number, ph: number): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const [ux, uy] = unit(dx, dy);
  const pts: Point[] = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const v = amp * Math.sin(Math.PI * ht * t + ph);
    pts.push([a[0] + dx * t - uy * v, a[1] + dy * t + ux * v]);
  }
  return polyD(pts);
}

export function entangleLink(p: Parent, a: Point, b: Point, o: EntangleOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': o.part ?? 'entanglement' });
  const ht = o.halfTurns ?? 5;
  const amp = o.amp ?? 2.4;
  const col = o.color ?? C.sky;
  const phases = (o.style ?? 'helix') === 'helix' ? [0, Math.PI] : [0];
  if (o.glow !== false) {
    const f = blur(p, o.glowBlur ?? 1.1);
    for (const ph of phases) path(g, strandD(a, b, amp, ht, ph), { stroke: o.glowColor ?? shade(col, 0.45), width: o.glowWidth ?? 2, opacity: 0.6, filter: f });
  }
  for (const ph of phases) path(g, strandD(a, b, amp, ht, ph), { stroke: col, width: o.width ?? STYLE.line.thin * 1.3 });
  if (o.dots === true) {
    for (const q of [a, b]) circle(g, q[0], q[1], o.dotR ?? 1, { fill: col });
  }
  return g;
}

export type DetectorOpts = Loose<{ part: string; angle: number; fill: string; stroke: string; width: number }>;

export function photonDetector(p: Parent, cx: number, cy: number, r: number, o: DetectorOpts = {}): SVGPathElement {
  const a = ((o.angle ?? -45) * Math.PI) / 180;
  const a1 = a + Math.PI / 2;
  const a2 = a - Math.PI / 2;
  const p1: Point = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
  const p2v: Point = [cx + r * Math.cos(a2), cy + r * Math.sin(a2)];
  return path(p, `M${p2(p1)} A${f3(r)},${f3(r)} 0 0 0 ${p2(p2v)} Z`, { fill: o.fill ?? '#cdcdce', stroke: o.stroke ?? C.mid, width: o.width ?? STYLE.line.thin, part: o.part ?? 'detector' });
}
