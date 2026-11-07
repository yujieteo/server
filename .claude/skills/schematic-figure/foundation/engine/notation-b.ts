// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/notation.js
import type { Figure, Loose, Parent, Point, TextOpts } from './types.ts';
import { el, text } from './core.ts';
import { STYLE } from './style.ts';
import { circle, path, smooth, toLocal } from './draw.ts';
import { at, f3 } from './util.ts';

export type LeaderTarget = Point | string;
export type LeaderHead = false | 'solid' | 'arrow' | 'dot';

export type LeaderOpts = Loose<{
  c1: LeaderTarget; c2: LeaderTarget; bend: number; wavy: boolean; via: readonly LeaderTarget[]; head: LeaderHead; headLen: number; headHalf: number;
  dotR: number; stroke: string; width: number; gap1: number; tension: number; part: string; F: Figure;
}>;

export interface LeaderResult {
  node: SVGGElement;
  d: string;
  start: Point;
  end: Point;
  dir: Point;
  bezier: [Point, Point, Point, Point] | null;
}

function resolve(F: Figure | undefined, p: Parent, q: LeaderTarget): Point {
  if (typeof q !== 'string') return q;
  if (F === undefined) throw new Error('an anchor name needs the figure (pass F)');
  return toLocal(F, p, F.at(q));
}

export function cubicAt(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
  const m = 1 - t;
  return [
    m * m * m * a[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * b[0],
    m * m * m * a[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * b[1],
  ];
}

export function leaderAt(l: LeaderResult, t: number): Point | null {
  if (l.bezier === null) return null;
  return cubicAt(l.bezier[0], l.bezier[1], l.bezier[2], l.bezier[3], t);
}

function joinPts3(pts: readonly Point[]): string {
  let s = '';
  for (let i = 0; i < pts.length; i++) {
    const q = at(pts, i);
    s += `${i > 0 ? ' L' : ''}${f3(q[0])},${f3(q[1])}`;
  }
  return s;
}

function headPath(b: Point, ux: number, uy: number, hl: number, hh: number, arrow: boolean): string {
  const bx = b[0] - ux * hl;
  const by = b[1] - uy * hl;
  const nt = arrow ? 0.18 : 0;
  const tri: Point[] = [[b[0], b[1]], [bx - uy * hh, by + ux * hh], [b[0] - ux * hl * (1 - nt), b[1] - uy * hl * (1 - nt)], [bx + uy * hh, by - ux * hh]];
  return `M${joinPts3(tri)}Z`;
}

interface Controls {
  pts: Point[] | null;
  c1: Point;
  c2: Point;
}

function leaderControls(o: LeaderOpts, p: Parent, a: Point, b: Point): Controls {
  if (o.via !== undefined && o.via.length > 0) {
    const mid: Point[] = [];
    for (const q of o.via) mid.push(resolve(o.F, p, q));
    return { pts: [a, ...mid, b], c1: a, c2: b };
  }
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const Lc = Math.hypot(dx, dy) || 1;
  const n: Point = [-dy / Lc, dx / Lc];
  const bend = o.bend ?? 0.22;
  const b2 = o.wavy === true ? -bend : bend;
  const c1: Point = o.c1 !== undefined ? resolve(o.F, p, o.c1) : [a[0] + dx / 3 + n[0] * bend * Lc, a[1] + dy / 3 + n[1] * bend * Lc];
  const c2: Point = o.c2 !== undefined ? resolve(o.F, p, o.c2) : [a[0] + (2 * dx) / 3 + n[0] * b2 * Lc, a[1] + (2 * dy) / 3 + n[1] * b2 * Lc];
  return { pts: null, c1, c2 };
}

export function leader(p: Parent, from: LeaderTarget, to: LeaderTarget, o: LeaderOpts = {}): LeaderResult {
  const a = resolve(o.F, p, from);
  let b = resolve(o.F, p, to);
  const stroke = o.stroke ?? STYLE.color.ink;
  const g = el(p, 'g', { 'data-part': o.part ?? 'leader' });
  const { pts, c1, c2 } = leaderControls(o, p, a, b);
  const prev = pts !== null ? at(pts, pts.length - 2) : Math.hypot(b[0] - c2[0], b[1] - c2[1]) > 1e-6 ? c2 : c1;
  let ux = b[0] - prev[0];
  let uy = b[1] - prev[1];
  const un = Math.hypot(ux, uy) || 1;
  ux /= un;
  uy /= un;
  if (o.gap1 !== undefined && o.gap1 !== 0) b = [b[0] - ux * o.gap1, b[1] - uy * o.gap1];
  const head = o.head ?? false;
  const hl = o.headLen ?? (head === 'arrow' ? STYLE.arrow.head : 2.6);
  const hh = o.headHalf ?? (head === 'arrow' ? hl * 0.42 : 0.9);
  const trim = head === 'solid' || head === 'arrow' ? hl * 0.8 : 0;
  const e: Point = [b[0] - ux * trim, b[1] - uy * trim];
  let d = `M${f3(a[0])},${f3(a[1])} C${f3(c1[0])},${f3(c1[1])} ${f3(c2[0])},${f3(c2[1])} ${f3(e[0])},${f3(e[1])}`;
  if (pts !== null) d = smooth([...pts.slice(0, pts.length - 1), e], false, o.tension ?? 0.5);
  path(g, d, { stroke, width: o.width ?? STYLE.line.thin, cap: 'round', part: 'leader-line' });
  if (head === 'solid' || head === 'arrow') path(g, headPath(b, ux, uy, hl, hh, head === 'arrow'), { fill: stroke, part: 'arrowhead' });
  else if (head === 'dot') circle(g, b[0], b[1], o.dotR ?? 0.7, { fill: stroke, part: 'leader-dot' });
  return { node: g, d, start: a, end: b, dir: [ux, uy], bezier: pts === null ? [a, c1, c2, e] : null };
}

export type LeaderSpec = LeaderOpts & { to: LeaderTarget };
export type NumeralTarget = LeaderTarget | LeaderSpec | readonly (LeaderTarget | LeaderSpec)[];

export type NumeralOpts = LeaderOpts & Loose<{
  to: NumeralTarget; underline: boolean; size: number; anchor: 'start' | 'middle' | 'end'; valign: TextOpts['valign']; color: string; gap: number;
  family: string; weight: string | number; italic: boolean; role: string; curve: number | 'S' | 'wavy' | false; assembly: boolean;
}>;

export interface NumeralBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface NumeralResult {
  node: SVGGElement;
  text: SVGTextElement;
  box: NumeralBox;
  leaders: LeaderResult[];
}

function isList(v: NumeralTarget): v is readonly (LeaderTarget | LeaderSpec)[] {
  return typeof v === 'object' && 'length' in v && typeof v[0] !== 'number';
}

function isSpec(v: LeaderTarget | LeaderSpec): v is LeaderSpec {
  return typeof v === 'object' && !('length' in v);
}

function edgeOf(box: NumeralBox, q: Point): Point {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const dx = q[0] - cx;
  const dy = q[1] - cy;
  const sx = dx !== 0 ? ((dx > 0 ? box.x1 - cx : box.x0 - cx) / dx) : Infinity;
  const sy = dy !== 0 ? ((dy > 0 ? box.y1 - cy : box.y0 - cy) / dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

function curved(o: NumeralOpts): NumeralOpts {
  const out: NumeralOpts = { ...o };
  const curve = o.curve;
  if (curve === 'S' || curve === 'wavy') out.wavy = true;
  else if (typeof curve === 'number') out.bend = curve;
  else if (curve === false) out.bend = 0;
  if (o.assembly === true && out.head === undefined) out.head = 'arrow';
  return out;
}

function leaderPart(o: NumeralOpts): LeaderOpts {
  return {
    c1: o.c1, c2: o.c2, bend: o.bend, wavy: o.wavy, via: o.via, head: o.head, headLen: o.headLen, headHalf: o.headHalf, dotR: o.dotR,
    stroke: o.stroke, width: o.width, gap1: o.gap1, tension: o.tension, F: o.F,
  };
}

function numeralTargets(to: NumeralTarget | undefined): (LeaderTarget | LeaderSpec)[] {
  if (to === undefined) return [];
  if (isList(to)) return [...to];
  return [to];
}

function drawLeaders(g: SVGGElement, p: Parent, box: NumeralBox, o: NumeralOpts): LeaderResult[] {
  const lo = leaderPart(o);
  const leaders: LeaderResult[] = [];
  for (const tg of numeralTargets(o.to)) {
    const spec: LeaderSpec = isSpec(tg) ? tg : { to: tg };
    const opts: LeaderOpts = { ...lo, ...spec };
    const T = resolve(opts.F, p, spec.to);
    let toward = T;
    if (opts.c1 !== undefined) toward = resolve(opts.F, p, opts.c1);
    else if (opts.via !== undefined && opts.via.length > 0) toward = resolve(opts.F, p, at(opts.via, 0));
    leaders.push(leader(g, edgeOf(box, toward), T, opts));
  }
  return leaders;
}

export function numeral(p: Parent, x: number, y: number, str: string, o0: NumeralOpts = {}): NumeralResult {
  const o = o0.curve !== undefined || o0.assembly === true ? curved(o0) : o0;
  const pat = STYLE.format === 'patent';
  const g = el(p, 'g', { 'data-part': o.part ?? 'numeral' });
  const t = text(g, x, y, str, {
    size: o.size, anchor: o.anchor ?? 'middle', valign: o.valign ?? 'middle', color: o.color, underline: o.underline,
    family: o.family, weight: o.weight, italic: o.italic, role: o.role ?? (pat ? 'numeral' : undefined),
  });
  const b = t.getBBox();
  const m = t.transform.baseVal.consolidate();
  const ty = m !== null ? m.matrix.f : 0;
  const gp = o.gap ?? 0.8;
  const box: NumeralBox = { x0: b.x - gp, x1: b.x + b.width + gp, y0: b.y + ty - gp, y1: b.y + ty + b.height + gp };
  const leaders = drawLeaders(g, p, box, o);
  if (pat) {
    g.setAttribute('data-leads', String(leaders.length));
    if (o.underline === true) g.setAttribute('data-under', '1');
  }
  return { node: g, text: t, box, leaders };
}

export function numeralTo(p: Parent, x: number, y: number, str: string, target: NumeralTarget, o: NumeralOpts = {}): NumeralResult {
  return numeral(p, x, y, str, { ...o, to: target });
}
