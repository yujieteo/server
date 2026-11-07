// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/qc.js
import type { GradientStop, Palette, Parent, Point } from './types.ts';
import { el, node } from './core.ts';
import { STYLE } from './style.ts';
import { dropShadow } from './draw.ts';
import { at, f3 } from './util.ts';

export const C: Palette = STYLE.color;

export function w0(): number {
  return STYLE.line.normal;
}

export function mathFont(): string {
  return STYLE.font.math;
}

export interface Affine {
  base: number;
  step: number;
}

export function affineAt(a: Affine, t: number): number {
  return a.base + t * a.step;
}

function defsOf(p: Parent): Element {
  let n: Node | null = node(p);
  while (n !== null && !(n instanceof Element && n.tagName === 'svg')) n = n.parentNode;
  const defs = n instanceof Element ? n.querySelector('defs') : null;
  if (defs === null) throw new Error('qc: no <defs> above the parent');
  return defs;
}

const COUNTER = { id: 0 };

export function segGradient(p: Parent, a: Point, b: Point, stops: readonly GradientStop[]): string {
  COUNTER.id += 1;
  const id = `qg${COUNTER.id}`;
  const g = el(defsOf(p), 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: f3(a[0]), y1: f3(a[1]), x2: f3(b[0]), y2: f3(b[1]) });
  for (const [o, c, op] of stops) el(g, 'stop', { offset: o, 'stop-color': c, 'stop-opacity': op ?? 1 });
  return `url(#${id})`;
}

export function shadowOf(p: Parent, s: boolean | string | undefined): string | undefined {
  if (s === true) return dropShadow(p, { dx: -0.5, dy: 0.8, sd: 1.2, opacity: 0.2 });
  return typeof s === 'string' && s !== '' ? s : undefined;
}

export function sortNums(a: readonly number[]): number[] {
  const out: number[] = [];
  for (const v of a) {
    let i = out.length;
    while (i > 0 && at(out, i - 1) > v) i -= 1;
    out.splice(i, 0, v);
  }
  return out;
}
