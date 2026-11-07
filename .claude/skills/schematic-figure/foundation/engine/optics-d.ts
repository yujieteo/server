// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/optics.js
import type { Loose, Parent } from './types.ts';
import { el } from './core.ts';
import { STYLE, shade } from './style.ts';
import { line, linearGradient, rect } from './draw.ts';
import { defsOf } from './svgdefs.ts';
import { finish, G, rotPt } from './optics-a.ts';
import type { OpticOpts, OpticResult } from './optics-a.ts';

const C = STYLE.color;

export type PlateKind = 'filter' | 'dichroic' | 'glass' | 'mask';
export type PlateOpts = Loose<{
  angle: number; t: number; kind: PlateKind; tint: string; coat: string; side: -1 | 1; open: readonly [number, number]; stroke: string;
}> & OpticOpts;

function plateFill(p: Parent, kind: PlateKind, tint: string | undefined): string {
  if (tint !== undefined) return tint;
  if (kind === 'glass') return linearGradient(p, [[0, shade(C.glass, 0.5)], [1, C.glass]], 90);
  return kind === 'dichroic' ? '#eef5f9' : '#e9f1f6';
}

export function plate(p: Parent, x: number, y: number, len: number, o: PlateOpts = {}): OpticResult {
  const ang = o.angle ?? 0;
  const t = o.t ?? 1.6;
  const kind = o.kind ?? 'filter';
  const side = o.side ?? -1;
  const st = o.stroke ?? C.ink;
  const sw = STYLE.line.thin;
  const g = G(p, x, y, ang, 'plate');
  if (kind === 'mask') {
    const [ui, uo] = o.open ?? [0.42, 0.62];
    const hl = len / 2;
    const dark = o.tint ?? '#2b2f36';
    rect(g, -hl, -t / 2, len, t, { fill: '#ffffff', stroke: st, width: sw });
    for (const [u0, u1] of [[-1, -uo], [-ui, ui], [uo, 1]] as const) rect(g, u0 * hl, -t / 2, (u1 - u0) * hl, t, { fill: dark });
  } else {
    rect(g, -len / 2, -t / 2, len, t, { fill: plateFill(p, kind, o.tint), stroke: st, width: sw });
    if (kind === 'dichroic') {
      line(g, [-len / 2, (side * t) / 2], [len / 2, (side * t) / 2], { stroke: o.coat ?? C.orange, width: Math.max(0.5, t * 0.35), cap: 'butt' });
    }
  }
  return finish(o.F, o.name, g, {
    center: [x, y],
    a: rotPt(-len / 2, 0, x, y, ang),
    b: rotPt(len / 2, 0, x, y, ang),
    front: rotPt(0, (side * t) / 2, x, y, ang),
    back: rotPt(0, (-side * t) / 2, x, y, ang),
  });
}

export type EvanescentOpts = Loose<{ color: string; peak: number; zMax: number; w: number; dir: -1 | 1; part: string }>;

let evid = 0;

function verticalGradient(defs: Element, id: string, dir: number, color: string, peak: number, decay: number, zMax: number): void {
  const lg = el(defs, 'linearGradient', { id, x1: 0, y1: dir < 0 ? 1 : 0, x2: 0, y2: dir < 0 ? 0 : 1 });
  for (let i = 0; i <= 12; i++) {
    const z = (i / 12) * zMax;
    el(lg, 'stop', { offset: i / 12, 'stop-color': color, 'stop-opacity': (peak * Math.exp(-z / decay) * (1 - (i / 12) ** 3)).toFixed(4) });
  }
}

function horizontalGradient(defs: Element, id: string, sigma: number, w: number): void {
  const lm = el(defs, 'linearGradient', { id, x1: 0, y1: 0, x2: 1, y2: 0 });
  for (let i = 0; i <= 16; i++) {
    const xx = (i / 16 - 0.5) * 2 * w;
    el(lm, 'stop', { offset: i / 16, 'stop-color': '#fff', 'stop-opacity': Math.exp((-xx * xx) / (2 * sigma * sigma)).toFixed(4) });
  }
}

export function evanescent(p: Parent, cx: number, y: number, sigma: number, decay: number, o: EvanescentOpts = {}): { node: SVGGElement } {
  const defs = defsOf(p);
  const color = o.color ?? C.beamGreen;
  const peak = o.peak ?? 0.8;
  const zMax = o.zMax ?? 3 * decay;
  const w = o.w ?? 3 * sigma;
  const dir = o.dir ?? -1;
  evid += 1;
  const y0 = dir < 0 ? y - zMax : y;
  const gv = `evg${evid}`;
  const gm = `evm${evid}`;
  const mk = `evk${evid}`;
  verticalGradient(defs, gv, dir, color, peak, decay, zMax);
  horizontalGradient(defs, gm, sigma, w);
  const m = el(defs, 'mask', { id: mk, maskUnits: 'userSpaceOnUse', x: cx - w, y: y0, width: 2 * w, height: zMax });
  el(m, 'rect', { x: cx - w, y: y0, width: 2 * w, height: zMax, fill: `url(#${gm})` });
  const g = el(p, 'g', { mask: `url(#${mk})`, 'data-part': o.part ?? 'glow' });
  el(g, 'rect', { x: cx - w, y: y0, width: 2 * w, height: zMax, fill: `url(#${gv})` });
  return { node: g };
}
