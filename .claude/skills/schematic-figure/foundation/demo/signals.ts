// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/signals.js
import type { Figure, FigureOpts, Point } from '../engine/types.ts';
import * as L from '../engine/lib.ts';

export const figure: FigureOpts = { width: 120, height: 40, name: 'signals' };

function blob(): number[][] {
  const d: number[][] = [];
  for (let i = 0; i < 12; i++) {
    const row: number[] = [];
    for (let j = 0; j < 12; j++) row.push(Math.max(0, 1 - Math.hypot(i - 6, j - 6) / 5));
    d.push(row);
  }
  return d;
}

export default function draw(F: Figure): void {
  const C = L.STYLE.color;
  const a = F.panel('a', { x: 1, y: 1, w: 118, h: 38 });
  L.wave(a, 6, 60, 24, { color: C.vermillion, band: L.shade(C.vermillion, 0.7), shape: 'noise', period: 6 });
  L.layerCard(a, 66, 10, 30, 36, { F, name: 'card' });
  const h = L.stepHist(a, 104, 50, 5, [3, 4, 3, 6, 4, 5, 3, 4, 22, 5], { color: C.blue });
  L.binLabels(a, h.edges, 56, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { color: C.blue, highlight: 8, size: 5 });
  L.dots(a, 160, 168, 28);
  L.spectrum(a, 180, 250, { base: 60, from: 180, slope: 0.25 }, [[195, 10], [210, 14], [228, 8]], { color: C.orange });
  const slab: Point[] = [[262, 30], [276, 24], [276, 50], [262, 56]];
  L.glassSlab(a, slab, 44, -8);
  L.fadeCard(a, 300, 8, 30, 50, 'right');
  L.pixelImage(a, 20, 58, 30, blob(), { frame: true });
  L.flare(a, [80, 100, 62], [60, 130, 100]);
}
