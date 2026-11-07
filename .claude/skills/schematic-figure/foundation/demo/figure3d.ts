// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/figure3d.js
import type { Figure, FigureOpts, Panel, Point } from '../engine/types.ts';
import * as L from '../engine/lib.ts';

export const figure: FigureOpts = { width: 89, height: 50, name: 'demo3d' };

interface ChipMeta {
  size: Point;
  anchors: Record<string, Point>;
}

function isPoint(v: unknown): v is Point {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
}

function parseMeta(raw: unknown): ChipMeta {
  if (typeof raw !== 'object' || raw === null) throw new TypeError('chip metadata is not an object');
  const size: unknown = 'size' in raw ? raw.size : undefined;
  const found: unknown = 'anchors' in raw ? raw.anchors : undefined;
  if (!isPoint(size)) throw new TypeError('chip metadata needs size');
  if (typeof found !== 'object' || found === null) throw new TypeError('chip metadata needs anchors');
  const anchors: Record<string, Point> = {};
  for (const [k, v] of Object.entries(found)) {
    if (isPoint(v)) anchors[k] = v;
  }
  return { size, anchors };
}

function anchorOf(F: Figure, a: Panel, k: string): Point {
  return L.toLocal(F, a, F.at(`r.${k}`));
}

export default async function draw(F: Figure): Promise<void> {
  const res = await fetch('/demo/art/chip.png.json');
  const meta = parseMeta(await res.json());
  const a = F.panel('a', { x: 1, y: 1, w: 87, h: 48 });
  L.image(a, '/demo/art/chip.png', 4, 12, 236, { pxw: meta.size[0], pxh: meta.size[1], anchors: meta.anchors, F, prefix: 'r.' });
  L.callout(a, anchorOf(F, a, 'fiber'), [30, 14], 'Input fibre', { anchor: 'start' });
  L.callout(a, anchorOf(F, a, 'wg'), [110, 14], 'Waveguide mesh', { anchor: 'start' });
  L.callout(a, anchorOf(F, a, 'chip'), [150, 128], 'Si_3N_4 chip', { anchor: 'start' });
  L.callout(a, anchorOf(F, a, 'lens'), [200, 30], 'Lens', { anchor: 'start' });
}
