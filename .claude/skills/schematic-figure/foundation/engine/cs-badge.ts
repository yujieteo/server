// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/cs.js
import type { Loose, Parent } from './types.ts';
import { el } from './core.ts';
import { STYLE } from './style.ts';
import { circle, line, path, rect } from './draw.ts';
import { at, f3 } from './util.ts';
import type { NodeOut } from './cs-base.ts';

const C = STYLE.color;

export type LockOpts = Loose<{ part: string; color: string; hole: boolean; holeColor: string; open: boolean }>;

export function lock(p: Parent, cx: number, cy: number, s: number, o: LockOpts = {}): NodeOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'lock' });
  const c = o.color ?? '#8a8a8a';
  const bh = s * 0.8;
  const sw = s * 0.2;
  const sr = s * 0.3;
  const top = cy - bh / 2;
  const lift = o.open === true ? s * 0.3 : 0;
  const lx = cx - sr;
  const rx = cx + sr;
  const legTop = top - sr * 0.8 - lift;
  const d = `M${f3(lx)},${f3(top + sw * 0.5 - lift * 1.6)} L${f3(lx)},${f3(legTop)} A${f3(sr)},${f3(sr)} 0 0 1 ${f3(rx)},${f3(legTop)} L${f3(rx)},${f3(top + sw * 0.5)}`;
  path(g, d, { stroke: c, width: sw, cap: 'butt', part: 'lock-shackle' });
  rect(g, cx - s / 2, top, s, bh, { r: s * 0.2, fill: c, part: 'lock-body' });
  if (o.hole !== false) {
    const hc = o.holeColor ?? C.paper;
    circle(g, cx, cy - bh * 0.06, s * 0.1, { fill: hc });
    rect(g, cx - s * 0.04, cy - bh * 0.06, s * 0.08, bh * 0.28, { fill: hc });
  }
  return { node: g };
}

export type SnowflakeOpts = Loose<{ part: string; color: string; width: number }>;

export function snowflake(p: Parent, cx: number, cy: number, s: number, o: SnowflakeOpts = {}): NodeOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'snowflake' });
  const c = o.color ?? C.sky;
  const w = o.width ?? Math.max(STYLE.line.thin, s * 0.09);
  const R = s / 2;
  const st = { stroke: c, width: w, cap: 'round' };
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    line(g, [cx, cy], [cx + ux * R, cy + uy * R], st);
    const bx = cx + ux * R * 0.55;
    const by = cy + uy * R * 0.55;
    const b = R * 0.32;
    for (const sg of [1, -1]) {
      const ang = a + (sg * Math.PI) / 4;
      line(g, [bx, by], [bx + Math.cos(ang) * b, by + Math.sin(ang) * b], st);
    }
  }
  return { node: g };
}

export type FlameOpts = Loose<{ part: string; color: string; inner: string | boolean }>;

const FLAME_POINTS: readonly (readonly [number, number])[] = [
  [0, 0.5],
  [-0.36, 0.5], [-0.42, 0.18], [-0.28, -0.04],
  [-0.2, -0.17], [-0.1, -0.26], [-0.06, -0.5],
  [0.14, -0.36], [0.36, -0.14], [0.36, 0.12],
  [0.36, 0.36], [0.2, 0.5], [0, 0.5],
];

function flamePath(cx: number, cy: number, s: number, k: number, dy: number): string {
  const parts: string[] = [];
  for (const [x, y] of FLAME_POINTS) parts.push(`${f3(cx + x * s * k)},${f3(cy + (y * k + dy) * s)}`);
  let d = `M${at(parts, 0)}`;
  for (let i = 0; i < 4; i++) d += ` C${at(parts, 1 + 3 * i)} ${at(parts, 2 + 3 * i)} ${at(parts, 3 + 3 * i)}`;
  return `${d} Z`;
}

export function flame(p: Parent, cx: number, cy: number, s: number, o: FlameOpts = {}): NodeOut {
  const g = el(p, 'g', { 'data-part': o.part ?? 'flame' });
  path(g, flamePath(cx, cy, s, 1, 0), { fill: o.color ?? '#E8590C', part: 'flame-outer' });
  if (o.inner !== false) {
    path(g, flamePath(cx, cy, s, 0.5, 0.24), { fill: typeof o.inner === 'string' ? o.inner : '#FFC34D', part: 'flame-inner' });
  }
  return { node: g };
}
