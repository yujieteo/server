// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/forms.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { ellipse, linearGradient, path, polygon, radialGradient } from './draw.ts';
import { at } from './util.ts';
import { affinePoint, f2, fp } from './forms-a.ts';
import type { Affine } from './forms-a.ts';

const C = STYLE.color;

export function regPorts(F: Figure | undefined, name: string | undefined, p: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, [x, y]] of Object.entries(ports)) F.anchor(`${name}.${k}`, p, x, y);
  }
  return ports;
}

export type ObliqueDiscOpts = Loose<{ tilt: number; thickness: number; top: string; rim: string; glass: boolean; stroke: string; width: number }>;

export interface ObliqueDiscResult {
  node: SVGGElement;
  ry: number;
  top: Point;
  bottom: Point;
  left: Point;
  right: Point;
}

export function obliqueDisc(p: Parent, cx: number, cy: number, r: number, o: ObliqueDiscOpts = {}): ObliqueDiscResult {
  const thickness = o.thickness ?? 2.2;
  const top = o.top ?? '#dfe3e8';
  const stroke = o.stroke ?? C.ink;
  const width = o.width ?? STYLE.line.thin;
  const glass = o.glass ?? false;
  const g = el(p, 'g', { 'data-part': 'oblique-disc' });
  const ry = r * Math.sin(((o.tilt ?? 35) * Math.PI) / 180);
  const rimC = o.rim ?? shade(top, -0.3);
  path(g, `M${f2(cx - r)},${f2(cy)} A${f2(r)},${f2(ry)} 0 0 0 ${f2(cx + r)},${f2(cy)} L${f2(cx + r)},${f2(cy + thickness)} A${f2(r)},${f2(ry)} 0 0 1 ${f2(cx - r)},${f2(cy + thickness)} Z`, {
    fill: linearGradient(p, [[0, shade(rimC, 0.25)], [0.5, rimC], [1, shade(rimC, -0.2)]], 0), stroke, width,
  });
  const faceFill = glass
    ? radialGradient(p, [[0, '#ffffff', 0.9], [0.7, top, 0.85], [1, shade(top, -0.15), 0.9]], { cx: 0.4, cy: 0.35, r: 0.7 })
    : linearGradient(p, [[0, shade(top, 0.3)], [1, shade(top, -0.08)]], 90);
  ellipse(g, cx, cy, r, ry, { fill: faceFill, stroke, width });
  if (glass) {
    path(g, `M${f2(cx - r * 0.6)},${f2(cy - ry * 0.55)} A${f2(r * 0.8)},${f2(ry * 0.8)} 0 0 1 ${f2(cx + r * 0.1)},${f2(cy - ry * 0.85)}`, { stroke: '#fff', width: 0.8, opacity: 0.8 });
  }
  return { node: g, ry, top: [cx, cy - ry], bottom: [cx, cy + ry + thickness], left: [cx - r, cy], right: [cx + r, cy] };
}

export type ObliquePanelOpts = Loose<{ tilt: number; skew: number; thickness: number; frame: string; side: string; inset: number }>;

export interface PanelGeom {
  cx: number;
  cy: number;
  w: number;
  d: number;
  skew: number;
  s: number;
  inset: number;
}

export interface ObliquePanelResult {
  node: SVGGElement;
  geom: PanelGeom;
  corners: Point[];
  top: Point;
  bottom: Point;
  center: Point;
}

function panelBase(q: PanelGeom, u: number, v: number): Point {
  return [q.cx + (u - 0.5) * q.w + (v - 0.5) * q.d * q.skew, q.cy + (v - 0.5) * q.d * q.s];
}

export function obliquePanelPoint(panel: { geom: PanelGeom }, u: number, v: number): Point {
  const q = panel.geom;
  return panelBase(q, q.inset + u * (1 - 2 * q.inset), q.inset + v * (1 - 2 * q.inset));
}

export function obliquePanel(p: Parent, cx: number, cy: number, w: number, d: number, o: ObliquePanelOpts = {}): ObliquePanelResult {
  const thickness = o.thickness ?? 2.5;
  const frame = o.frame ?? '#c9ced6';
  const side = o.side ?? '#2a3a66';
  const g = el(p, 'g', { 'data-part': 'oblique-panel' });
  const geom: PanelGeom = { cx, cy, w, d, skew: o.skew ?? 0.25, s: Math.sin(((o.tilt ?? 35) * Math.PI) / 180), inset: o.inset ?? 0.08 };
  const c: Point[] = [panelBase(geom, 0, 0), panelBase(geom, 1, 0), panelBase(geom, 1, 1), panelBase(geom, 0, 1)];
  const c1 = at(c, 1);
  const c2 = at(c, 2);
  const c3 = at(c, 3);
  polygon(g, [c3, c2, [c2[0], c2[1] + thickness], [c3[0], c3[1] + thickness]], { fill: side });
  polygon(g, [c1, c2, [c2[0], c2[1] + thickness], [c1[0], c1[1] + thickness]], { fill: shade(side, -0.2) });
  polygon(g, c, { fill: linearGradient(p, [[0, shade(frame, 0.35)], [1, frame]], 90), stroke: C.ink, width: STYLE.line.thin });
  const panel = { geom };
  polygon(g, [obliquePanelPoint(panel, 0, 0), obliquePanelPoint(panel, 1, 0), obliquePanelPoint(panel, 1, 1), obliquePanelPoint(panel, 0, 1)], { fill: '#1d2230' });
  return { node: g, geom, corners: c, top: panelBase(geom, 0.5, 0), bottom: [cx, c2[1] + thickness], center: [cx, cy] };
}

export interface WaistSegment {
  x0: number;
  x1: number;
  h: number;
  fill?: string | undefined;
}

export type WaistOpts = Loose<{ r: number; smoothLen: number }>;

function waistSegmentD(cy: number, sg: WaistSegment, h0: number, h1: number, smoothLen: number): string {
  const a = sg.x0;
  const b = sg.x1;
  const L = Math.min(smoothLen, (b - a) / 3);
  const top = `M${f2(a)},${f2(cy - h0 / 2)} C${f2(a + L)},${f2(cy - h0 / 2)} ${f2(a + L)},${f2(cy - sg.h / 2)} ${f2(a + 2 * L)},${f2(cy - sg.h / 2)} L${f2(b - 2 * L)},${f2(cy - sg.h / 2)} C${f2(b - L)},${f2(cy - sg.h / 2)} ${f2(b - L)},${f2(cy - h1 / 2)} ${f2(b)},${f2(cy - h1 / 2)}`;
  const bot = ` L${f2(b)},${f2(cy + h1 / 2)} C${f2(b - L)},${f2(cy + h1 / 2)} ${f2(b - L)},${f2(cy + sg.h / 2)} ${f2(b - 2 * L)},${f2(cy + sg.h / 2)} L${f2(a + 2 * L)},${f2(cy + sg.h / 2)} C${f2(a + L)},${f2(cy + sg.h / 2)} ${f2(a + L)},${f2(cy + h0 / 2)} ${f2(a)},${f2(cy + h0 / 2)} Z`;
  return top + bot;
}

export function waistBand(p: Parent, cy: number, segments: readonly WaistSegment[], o: WaistOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'waist-band' });
  for (let i = 0; i < segments.length; i++) {
    const sg = at(segments, i);
    const prev = segments[i - 1];
    const next = segments[i + 1];
    const h0 = prev !== undefined ? (prev.h + sg.h) / 2 : sg.h;
    const h1 = next !== undefined ? (next.h + sg.h) / 2 : sg.h;
    path(g, waistSegmentD(cy, sg, h0, h1, o.smoothLen ?? 8), { fill: sg.fill ?? C.tintGrey });
  }
  return g;
}

export type BitColumnOpts = Loose<{ cell: number; on: string; off: string; stroke: string; horizontal: boolean; width: number }>;

function rectPoly(p: Parent, x: number, y: number, w: number, h: number, fill: string, stroke: string, width: number): SVGPolygonElement {
  return polygon(p, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { fill, stroke, width });
}

export function bitColumn(p: Parent, x: number, y: number, bits: readonly number[], o: BitColumnOpts = {}): SVGGElement {
  const cell = o.cell ?? 3;
  const horizontal = o.horizontal ?? false;
  const g = el(p, 'g', { 'data-part': 'bits' });
  for (let i = 0; i < bits.length; i++) {
    const cx = horizontal ? x + i * cell : x;
    const cy = horizontal ? y : y + i * cell;
    rectPoly(g, cx, cy, cell, cell, at(bits, i) !== 0 ? (o.on ?? C.green) : (o.off ?? '#ffffff'), o.stroke ?? C.ink, o.width ?? STYLE.line.hair * 1.4);
  }
  return g;
}

export type ProjectorOpts = Loose<{ w: number; h: number; d: number; color: string }>;

export function projector(p: Parent, x: number, y: number, o: ProjectorOpts = {}): { node: SVGGElement; lens: Point } {
  const w = o.w ?? 22;
  const h = o.h ?? 9;
  const d = o.d ?? 10;
  const color = o.color ?? '#e4e6ea';
  const g = el(p, 'g', { 'data-part': 'projector' });
  const dx = d * 0.55;
  const dy = -d * 0.35;
  const st = { stroke: C.ink, width: STYLE.line.thin };
  polygon(g, [[x, y], [x + w, y], [x + w + dx, y + dy], [x + dx, y + dy]], { fill: shade(color, 0.3), ...st });
  polygon(g, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], { fill: color, ...st });
  polygon(g, [[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + dy + h], [x + w, y + h]], { fill: shade(color, -0.18), ...st });
  for (let k = 0; k < 4; k++) path(g, `M${f2(x + 2 + k * 1.6)},${f2(y + h * 0.3)} l0,${f2(h * 0.4)}`, { stroke: shade(color, -0.4), width: 0.5 });
  const lx = x + w + dx * 0.5;
  const ly = y + h * 0.5 + dy * 0.5;
  ellipse(g, lx, ly, 1.6, 2.8, { fill: radialGradient(p, [[0, '#bfe8ff'], [1, '#2a6f97']], { cx: 0.4, cy: 0.4, r: 0.7 }), ...st });
  return { node: g, lens: [lx + 1.6, ly] };
}

export type SpringOpts = Loose<{ n: number; amp: number; lead: number; style: 'zigzag' | 'coil'; stroke: string; width: number; F: Figure; name: string }>;

export function spring(p: Parent, a: Point, b: Point, o: SpringOpts = {}): { node: SVGPolylineElement; ports: Ports } {
  const n = o.n ?? 6;
  const amp = o.amp ?? 2.2;
  const lead = o.lead ?? 0.18;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const frame: Affine = { o: a, eu: [ux, uy], ev: [-uy, ux] };
  const s0 = lead * len;
  const s1 = (1 - lead) * len;
  const pts: Point[] = [a, affinePoint(frame, s0, 0)];
  if (o.style === 'coil') {
    const N = n * 24;
    const back = Math.min(1.1 * amp, (0.6 * (s1 - s0)) / n);
    for (let i = 1; i < N; i++) {
      const th = (2 * Math.PI * n * i) / N;
      pts.push(affinePoint(frame, s0 + ((s1 - s0) * i) / N + back * (1 - Math.cos(th)), amp * Math.sin(th)));
    }
  } else {
    for (let i = 0; i < 2 * n; i++) pts.push(affinePoint(frame, s0 + ((s1 - s0) * (i + 0.5)) / (2 * n), amp * (i % 2 !== 0 ? -1 : 1)));
  }
  pts.push(affinePoint(frame, s1, 0), b);
  let points = '';
  for (let i = 0; i < pts.length; i++) points += `${i > 0 ? ' ' : ''}${fp(at(pts, i))}`;
  const node = el(p, 'polyline', {
    points, fill: 'none', stroke: o.stroke ?? C.mid, 'stroke-width': o.width ?? STYLE.line.normal, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'data-part': 'spring',
  });
  const ports = regPorts(o.F, o.name, p, { a: [a[0], a[1]], b: [b[0], b[1]], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  return { node, ports };
}

export type FlowArrowOpts = Loose<{
  width: number; head: number; headWidth: number; radius: number; fill: string; opacity: number; part: string; F: Figure; from: string; to: string; kind: string;
}>;

function flowD(P: readonly Point[], r: number): string {
  const n = P.length;
  const first = at(P, 0);
  let d = `M${f2(first[0])},${f2(first[1])}`;
  for (let i = 1; i < n - 1; i++) {
    const [px, py] = at(P, i);
    const prev = at(P, i - 1);
    const nxt = at(P, i + 1);
    const la = Math.hypot(px - prev[0], py - prev[1]) || 1;
    const lb = Math.hypot(nxt[0] - px, nxt[1] - py) || 1;
    const rr = Math.min(r, la / 2, lb / 2);
    const ua = [(px - prev[0]) / la, (py - prev[1]) / la];
    const ub = [(nxt[0] - px) / lb, (nxt[1] - py) / lb];
    d += ` L${f2(px - at(ua, 0) * rr)},${f2(py - at(ua, 1) * rr)} Q${f2(px)},${f2(py)} ${f2(px + at(ub, 0) * rr)},${f2(py + at(ub, 1) * rr)}`;
  }
  const last = at(P, n - 1);
  return `${d} L${f2(last[0])},${f2(last[1])}`;
}

export function flowArrow(p: Parent, pts: readonly Point[], o: FlowArrowOpts = {}): { node: SVGGElement } {
  const width = o.width ?? 6;
  const fill = o.fill ?? C.light;
  const g = el(p, 'g', { 'data-part': o.part ?? 'flow-arrow', opacity: o.opacity });
  const hl = o.head ?? Math.max(3, 0.8 * width);
  const hw = o.headWidth ?? width + 5;
  const n = pts.length;
  const e = at(pts, n - 1);
  const q = at(pts, n - 2);
  const dl = Math.hypot(e[0] - q[0], e[1] - q[1]) || 1;
  const u: Point = [(e[0] - q[0]) / dl, (e[1] - q[1]) / dl];
  const nn: Point = [-u[1], u[0]];
  const bb: Point = [e[0] - u[0] * hl, e[1] - u[1] * hl];
  const P: Point[] = [];
  for (const v of pts) P.push([v[0], v[1]]);
  P[n - 1] = [bb[0] + u[0] * 0.3, bb[1] + u[1] * 0.3];
  path(g, flowD(P, o.radius ?? width), { stroke: fill, width, cap: 'butt', join: 'round', part: 'block-flow' });
  polygon(g, [e, [bb[0] + (nn[0] * hw) / 2, bb[1] + (nn[1] * hw) / 2], [bb[0] - (nn[0] * hw) / 2, bb[1] - (nn[1] * hw) / 2]], { fill, part: 'block-flow-head' });
  if (o.F !== undefined && o.from !== undefined && o.from !== '' && o.to !== undefined && o.to !== '') o.F.drawn.push({ from: o.from, to: o.to, kind: o.kind ?? 'flow' });
  return { node: g };
}
