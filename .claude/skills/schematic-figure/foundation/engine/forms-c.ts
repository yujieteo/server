// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/forms.js
import type { Figure, Loose, Parent, Point, Ports } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { blur, line, path, polygon, smooth } from './draw.ts';
import { userGradient } from './geo.ts';
import { at } from './util.ts';
import { affinePoint, f2 } from './forms-a.ts';
import type { Affine } from './forms-a.ts';
import { regPorts } from './forms-b.ts';

const C = STYLE.color;

export interface PortsResult<N> {
  node: N;
  ports: Ports;
}

export type BoltOpts = Loose<{ fill: string; stroke: string; width: number; flip: boolean; rot: number; F: Figure; name: string }>;

interface BoltFrame {
  cx: number;
  cy: number;
  w: number;
  h: number;
  c: number;
  s: number;
  flip: boolean;
}

function boltPoint(f: BoltFrame, a: number, b: number): Point {
  const dx = (f.flip ? 1 - a : a) * f.w - f.w / 2;
  const dy = b * f.h - f.h / 2;
  return [f.cx + dx * f.c - dy * f.s, f.cy + dx * f.s + dy * f.c];
}

export function bolt(p: Parent, x: number, y: number, w: number, h: number, o: BoltOpts = {}): PortsResult<SVGPolygonElement> {
  const rot = o.rot ?? 0;
  const f: BoltFrame = { cx: x + w / 2, cy: y + h / 2, w, h, c: Math.cos((rot * Math.PI) / 180), s: Math.sin((rot * Math.PI) / 180), flip: o.flip ?? false };
  const u: Point[] = [[0.52, 0], [1, 0.08], [0.62, 0.42], [0.74, 0.47], [0, 1], [0.36, 0.56], [0.24, 0.52]];
  const pts: Point[] = [];
  for (const [a, b] of u) pts.push(boltPoint(f, a, b));
  const node = polygon(p, pts, { fill: o.fill ?? '#fbf3c4', stroke: o.stroke ?? C.ink, width: o.width ?? STYLE.line.thin, join: 'miter', part: 'bolt' });
  return { node, ports: regPorts(o.F, o.name, p, { top: boltPoint(f, 0.76, 0.04), tip: boltPoint(f, 0, 1), center: [f.cx, f.cy] }) };
}

export type StreakSpec = Loose<{ n: number; len: number; side: number }>;
export type CloudOpts = Loose<{
  lobes: number; bulge: number; fill: string; stroke: string; width: number; seed: number; streaks: number | StreakSpec; part: string; F: Figure; name: string;
}>;

interface Lcg {
  s: number;
}

function lcg(r: Lcg): number {
  r.s = (r.s * 1664525 + 1013904223) >>> 0;
  return r.s / 4294967296;
}

function cloudPoints(cx: number, cy: number, w: number, h: number, n: number, seed: number): Point[] {
  const r: Lcg = { s: (seed * 2654435761) >>> 0 || 1 };
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * (i + 0.25 * (lcg(r) - 0.5))) / n - Math.PI / 2;
    const k = 0.9 + 0.12 * lcg(r);
    pts.push([cx + Math.cos(a) * w * 0.36 * k, cy + Math.sin(a) * h * 0.33 * k]);
  }
  return pts;
}

function cloudD(pts: readonly Point[], bulge: number): string {
  const n = pts.length;
  const first = at(pts, 0);
  let d = `M${f2(first[0])},${f2(first[1])}`;
  for (let i = 0; i < n; i++) {
    const q = at(pts, i);
    const e = at(pts, (i + 1) % n);
    const r = (Math.hypot(e[0] - q[0], e[1] - q[1]) * 0.55) / bulge;
    d += ` A${f2(r)},${f2(r)} 0 0 1 ${f2(e[0])},${f2(e[1])}`;
  }
  return `${d}Z`;
}

export function cloud(p: Parent, cx: number, cy: number, w: number, h: number, o: CloudOpts = {}): PortsResult<SVGGElement> {
  const g = el(p, 'g', { 'data-part': o.part ?? 'cloud' });
  const stroke = o.stroke ?? C.mid;
  const width = o.width ?? STYLE.line.thin;
  path(g, cloudD(cloudPoints(cx, cy, w, h, o.lobes ?? 8, o.seed ?? 3), o.bulge ?? 1), { fill: o.fill ?? '#fff', stroke, width, join: 'round', part: 'cloud-outline' });
  if (o.streaks !== undefined && o.streaks !== 0) {
    const st: StreakSpec = typeof o.streaks === 'object' ? o.streaks : { n: o.streaks };
    const k = st.n ?? 2;
    const side = st.side ?? 1;
    const len = st.len ?? 1.4 * w;
    for (let i = 0; i < k; i++) {
      const yy = cy + (i - (k - 1) / 2) * h * 0.14;
      const x0 = cx + side * w * 0.3;
      line(g, [x0, yy], [x0 + side * len, yy + h * 0.02 * i], { stroke, width, part: 'cloud-streak' });
    }
  }
  return { node: g, ports: regPorts(o.F, o.name, p, { center: [cx, cy], left: [cx - w / 2, cy], right: [cx + w / 2, cy], top: [cx, cy - h / 2], bottom: [cx, cy + h / 2] }) };
}

export type LampOpts = Loose<{
  angle: number; size: number; beam: number; spread: number; color: string; body: string; stroke: string; width: number; part: string; F: Figure; name: string;
}>;

export function lamp(p: Parent, x: number, y: number, o: LampOpts = {}): PortsResult<SVGGElement> {
  const s = o.size ?? 8;
  const a = ((o.angle ?? 90) * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const T: Affine = { o: [x, y], eu: [ux, uy], ev: [-uy, ux] };
  const g = el(p, 'g', { 'data-part': o.part ?? 'lamp' });
  const bl = o.beam ?? 1.6 * s;
  const sp = Math.tan(((o.spread ?? 18) * Math.PI) / 180);
  const col = o.color ?? '#fce77e';
  polygon(g, [affinePoint(T, 0, -0.42 * s), affinePoint(T, bl, -0.42 * s - bl * sp), affinePoint(T, bl, 0.42 * s + bl * sp), affinePoint(T, 0, 0.42 * s)], {
    fill: userGradient(g, affinePoint(T, 0, 0), affinePoint(T, bl, 0), [[0, col, 1], [1, col, 0.15]]), part: 'lamp-beam',
  });
  const body = o.body ?? '#8d8d8d';
  const st = o.stroke !== undefined && o.stroke !== '' ? { stroke: o.stroke, width: o.width ?? STYLE.line.thin } : {};
  polygon(g, [affinePoint(T, -1.1 * s, -s / 2), affinePoint(T, 0, -s / 2), affinePoint(T, 0, s / 2), affinePoint(T, -1.1 * s, s / 2)], {
    fill: userGradient(g, affinePoint(T, 0, -s / 2), affinePoint(T, 0, s / 2), [[0, shade(body, 0.25)], [0.5, body], [1, shade(body, -0.25)]]), ...st, part: 'lamp-head',
  });
  return { node: g, ports: regPorts(o.F, o.name, p, { face: [x, y], back: affinePoint(T, -1.1 * s, 0), beam: affinePoint(T, bl, 0) }) };
}

export type TrailOpts = Loose<{ w: number; color: string; bend: number; blur: number; opacity: number; core: boolean; part: string; F: Figure; name: string }>;

interface TrailFrame {
  tail: Point;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  bend: number;
  len: number;
  w: number;
}

function trailMid(f: TrailFrame, t: number): Point {
  return [
    f.tail[0] + f.dx * t + f.nx * Math.sin(Math.PI * t) * f.bend * f.len * -1,
    f.tail[1] + f.dy * t + f.ny * Math.sin(Math.PI * t) * f.bend * f.len * -1,
  ];
}

function trailSide(f: TrailFrame, t: number, s: number): Point {
  const [cx, cy] = trailMid(f, t);
  const hw = (f.w / 2) * Math.pow(t, 0.8);
  return [cx + f.nx * hw * s, cy + f.ny * hw * s];
}

export function trail(p: Parent, head: Point, tail: Point, o: TrailOpts = {}): PortsResult<SVGGElement> {
  const w = o.w ?? 6;
  const color = o.color ?? '#39a6ff';
  const bl = o.blur ?? 0.18 * w;
  const g = el(p, 'g', { 'data-part': o.part ?? 'trail' });
  const dx = head[0] - tail[0];
  const dy = head[1] - tail[1];
  const len = Math.hypot(dx, dy) || 1;
  const f: TrailFrame = { tail, dx, dy, nx: -dy / len, ny: dx / len, bend: o.bend ?? 0.18, len, w };
  const N = 16;
  const pts: Point[] = [];
  for (let i = 0; i <= N; i++) pts.push(trailSide(f, i / N, 1));
  for (let i = N; i >= 0; i--) pts.push(trailSide(f, i / N, -1));
  path(g, smooth(pts, true, 0.3), {
    fill: userGradient(g, tail, head, [[0, color, 0], [0.55, color, 0.55], [1, color, 1]]), opacity: o.opacity ?? 0.9, filter: bl > 0 ? blur(g, bl) : undefined, part: 'trail-band',
  });
  if (o.core !== false) {
    const core: Point[] = [];
    for (let i = 3; i <= N; i++) core.push(trailMid(f, i / N));
    path(g, smooth(core, false, 0.4), {
      stroke: userGradient(g, tail, head, [[0, '#ffffff', 0], [1, '#ffffff', 0.85]]), width: w * 0.18, cap: 'round', filter: bl > 0 ? blur(g, bl * 0.5) : undefined, part: 'trail-core',
    });
  }
  return { node: g, ports: regPorts(o.F, o.name, p, { head: [head[0], head[1]], tail: [tail[0], tail[1]], mid: trailMid(f, 0.5) }) };
}
