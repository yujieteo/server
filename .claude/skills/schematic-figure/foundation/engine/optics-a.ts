// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/optics.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, line, linearGradient, path, polygon, rect, shaded } from './draw.ts';

const C = STYLE.color;

export interface OpticOpts {
  F?: Figure | undefined;
  name?: string | undefined;
}

export interface OpticResult {
  node: SVGGElement;
  ports: Ports;
}

export function finish(F: Figure | undefined, name: string | undefined, g: SVGGElement, ports: Ports): OpticResult {
  const parent = g.parentElement;
  if (F !== undefined && name !== undefined && name !== '' && parent !== null) {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, x, y);
  }
  return { node: g, ports };
}

export function G(p: Parent, x: number, y: number, rot: number, part: string): SVGGElement {
  return el(p, 'g', { transform: `translate(${x} ${y})${rot !== 0 ? ` rotate(${rot})` : ''}`, 'data-part': part });
}

export function rotPt(x: number, y: number, cx: number, cy: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [cx + x * c - y * s, cy + x * s + y * c];
}

export type LensKind = 'biconvex' | 'planoconvex' | 'biconcave' | 'cylindrical';
export type LensOpts = Loose<{ h: number; t: number; rot: number; kind: LensKind }> & OpticOpts;

function lensPath(kind: LensKind, t: number, hh: number): string {
  if (kind === 'biconvex') return `M0,${-hh} Q${t},0 0,${hh} Q${-t},0 0,${-hh}Z`;
  if (kind === 'planoconvex') return `M${-t * 0.25},${-hh} L${-t * 0.25},${hh} Q${t * 0.9},0 ${-t * 0.25},${-hh}Z`;
  if (kind === 'biconcave') {
    return `M${-t * 0.6},${-hh} L${t * 0.6},${-hh} Q${t * 0.1},0 ${t * 0.6},${hh} L${-t * 0.6},${hh} Q${-t * 0.1},0 ${-t * 0.6},${-hh}Z`;
  }
  return `M${-t / 2},${-hh} L${t / 2},${-hh} L${t / 2},${hh} L${-t / 2},${hh}Z`;
}

export function lens(p: Parent, x: number, y: number, o: LensOpts = {}): OpticResult {
  const h = o.h ?? 18;
  const t = o.t ?? h * 0.22;
  const rot = o.rot ?? 0;
  const kind = o.kind ?? 'biconvex';
  const g = G(p, x, y, rot, 'lens');
  const hh = h / 2;
  const fill = linearGradient(p, [[0, shade(C.glass, 0.5)], [0.5, C.glass], [1, shade(C.glass, -0.12)]], 0);
  path(g, lensPath(kind, t, hh), { fill, stroke: shade(C.glass, -0.45), width: STYLE.line.thin });
  path(g, `M${-t * 0.12},${-hh * 0.7} Q${t * 0.05},${-hh * 0.2} ${-t * 0.05},${hh * 0.15}`, { stroke: '#fff', width: 0.5, opacity: 0.8 });
  return finish(o.F, o.name, g, {
    in: rotPt(-t / 2, 0, x, y, rot),
    out: rotPt(t / 2, 0, x, y, rot),
    top: rotPt(0, -hh, x, y, rot),
    bottom: rotPt(0, hh, x, y, rot),
    center: [x, y],
  });
}

export type MirrorOpts = Loose<{ h: number; w: number; rot: number }> & OpticOpts;

export function mirror(p: Parent, x: number, y: number, o: MirrorOpts = {}): OpticResult {
  const h = o.h ?? 16;
  const w = o.w ?? 2.4;
  const rot = o.rot ?? 0;
  const g = G(p, x, y, rot, 'mirror');
  rect(g, 0, -h / 2, w, h, { fill: linearGradient(p, [[0, '#f4f6f8'], [1, C.metal]], 0), stroke: C.ink, width: STYLE.line.thin });
  line(g, [0, -h / 2], [0, h / 2], { stroke: C.ink, width: STYLE.line.normal * 1.3 });
  for (let yy = -h / 2 + 1.5; yy < h / 2; yy += 2) line(g, [w, yy], [w + 1.3, yy - 1.3], { stroke: C.mid, width: STYLE.line.hair });
  return finish(o.F, o.name, g, { center: [x, y], top: rotPt(0, -h / 2, x, y, rot), bottom: rotPt(0, h / 2, x, y, rot) });
}

export type BeamSplitterOpts = Loose<{ s: number; rot: number }> & OpticOpts;

export function beamSplitter(p: Parent, x: number, y: number, o: BeamSplitterOpts = {}): OpticResult {
  const s = o.s ?? 10;
  const g = G(p, x, y, o.rot ?? 0, 'beamsplitter');
  rect(g, -s / 2, -s / 2, s, s, { fill: linearGradient(p, [[0, shade(C.glass, 0.4)], [1, C.glass]], 45), stroke: shade(C.glass, -0.5), width: STYLE.line.thin });
  line(g, [-s / 2, s / 2], [s / 2, -s / 2], { stroke: shade(C.glass, -0.55), width: STYLE.line.thin });
  return finish(o.F, o.name, g, { in: [x - s / 2, y], out: [x + s / 2, y], up: [x, y - s / 2], down: [x, y + s / 2], center: [x, y] });
}

export type LaserOpts = Loose<{ w: number; h: number; rot: number; color: string; beam: string; label: string; labelSize: number }> & OpticOpts;

export function laser(p: Parent, x: number, y: number, o: LaserOpts = {}): OpticResult {
  const w = o.w ?? 22;
  const h = o.h ?? 10;
  const g = G(p, x, y, o.rot ?? 0, 'laser');
  rect(g, 0, -h / 2, w, h, { r: 1.2, fill: shaded(p, o.color ?? '#4a5563', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, w, -h * 0.18, 1.6, h * 0.36, { fill: '#2b2f36', stroke: C.ink, width: STYLE.line.hair });
  circle(g, w * 0.18, -h * 0.22, 0.9, { fill: o.beam ?? C.beam });
  if (o.label !== undefined && o.label !== '') {
    text(g, w / 2, 0, o.label, { anchor: 'middle', valign: 'middle', color: '#fff', size: o.labelSize ?? STYLE.text.small });
  }
  return finish(o.F, o.name, g, { out: [x + w + 1.6, y], top: [x + w / 2, y - h / 2], bottom: [x + w / 2, y + h / 2] });
}

export type CameraOpts = Loose<{ w: number; h: number; rot: number; color: string; label: string; labelSize: number }> & OpticOpts;

export function camera(p: Parent, x: number, y: number, o: CameraOpts = {}): OpticResult {
  const w = o.w ?? 16;
  const h = o.h ?? 12;
  const g = G(p, x, y, o.rot ?? 0, 'camera');
  rect(g, -3.5, -h * 0.28, 3.5, h * 0.56, { fill: shaded(p, '#3a3f47', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, 0, -h / 2, w, h, { r: 1.2, fill: shaded(p, o.color ?? '#5b6573', 90), stroke: C.ink, width: STYLE.line.thin });
  if (o.label !== undefined && o.label !== '') {
    text(g, w / 2, 0, o.label, { anchor: 'middle', valign: 'middle', color: '#fff', size: o.labelSize ?? STYLE.text.small });
  }
  return finish(o.F, o.name, g, { in: [x - 3.5, y], top: [x + w / 2, y - h / 2], bottom: [x + w / 2, y + h / 2], out: [x + w, y] });
}

export type DetectorOpts = Loose<{ r: number; rot: number }> & OpticOpts;

export function detector(p: Parent, x: number, y: number, o: DetectorOpts = {}): OpticResult {
  const r = o.r ?? 4;
  const g = G(p, x, y, o.rot ?? 0, 'detector');
  path(g, `M0,${-r} A${r},${r} 0 0 1 0,${r} Z`, { fill: shaded(p, '#51606f', 90), stroke: C.ink, width: STYLE.line.thin });
  rect(g, -1.2, -r, 1.2, 2 * r, { fill: '#26303a' });
  return finish(o.F, o.name, g, { in: [x - 1.2, y], out: [x + r, y], center: [x, y] });
}

export type ObjectiveOpts = Loose<{ l: number; h: number; rot: number; band: string }> & OpticOpts;

export function objective(p: Parent, x: number, y: number, o: ObjectiveOpts = {}): OpticResult {
  const L = o.l ?? 14;
  const h = o.h ?? 11;
  const g = G(p, x, y, o.rot ?? 0, 'objective');
  polygon(g, [[0, -h / 2], [L * 0.62, -h / 2], [L, -h * 0.22], [L, h * 0.22], [L * 0.62, h / 2], [0, h / 2]], {
    fill: shaded(p, '#c2c8d0', 90), stroke: C.ink, width: STYLE.line.thin,
  });
  rect(g, L * 0.2, -h / 2, 1.2, h, { fill: o.band ?? C.vermillion });
  return finish(o.F, o.name, g, { in: [x, y], out: [x + L, y], center: [x + L / 2, y] });
}
