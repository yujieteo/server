// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/lib.js
import type { ArrowOpts, Figure, Parent, Point } from './types.ts';
import { arrow } from './draw.ts';

export * from './core.ts';
export * from './style.ts';
export * from './draw.ts';
export * from './optics.ts';
export * from './blocks.ts';
export * from './signals.ts';
export * from './forms.ts';
export * from './geo.ts';
export * from './notation.ts';
export * from './illustrate.ts';
export * from './light3.ts';
export * from './patent.ts';

export type ConnectOpts = ArrowOpts;

export function connect(F: Figure, from: Point | string, to: Point | string, o: ConnectOpts = {}): SVGGElement {
  const layer: Parent = o.layer ?? F.root;
  return arrow(layer, from, to, { ...o, F });
}
