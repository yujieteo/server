// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/draw.js
import type { Parent } from './types.ts';
import { node } from './core.ts';

export function svgRoot(p: Parent): Element {
  let n: Node | null = node(p);
  while (n !== null && !(n instanceof Element && n.tagName === 'svg')) n = n.parentNode;
  if (!(n instanceof Element)) throw new Error('not inside an svg');
  return n;
}

export function defsOf(p: Parent): Element {
  const d = svgRoot(p).querySelector('defs');
  if (d === null) throw new Error('no defs in the figure');
  return d;
}
