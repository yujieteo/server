// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/ind-qc-parts.js
import type { Figure, FigureOpts, Parent } from '../engine/types.ts';
import * as I from '../engine/ind.ts';
import * as Q from '../engine/qc.ts';
import * as S from '../engine/cs.ts';
import * as L from '../engine/lib.ts';
import { at } from '../engine/util.ts';

export const figure: FigureOpts = { width: 183, height: 56, name: 'ind-qc-parts' };

const C = L.STYLE.color;

function panelA(F: Figure): void {
  const a = F.panel('a', { x: 1, y: 1, w: 78, h: 54 });
  const hx = I.plateHX(a, 20, 40, 44, 30, { plates: 7, F, name: 'hx' });
  I.electrolyserStack(a, 110, 34, 80, 42, { cells: 5, F, name: 'st' });
  const coldOut = I.portOf(hx.ports, 'coldOut');
  const hotOut = I.portOf(hx.ports, 'hotOut');
  I.pipe(a, ['hx.coldOut', [coldOut[0], 20], [150, 20], 'st.top'], { F, arrow: 'end' });
  I.pipe(a, [[90, 8], [90, 110]], { style: 'secondary', color: C.blue, arrow: 'end' });
  I.pipe(a, [[70, 100], [200, 100]], { F, arrow: 'end', gapAt: [[90, 100]] });
  I.pipe(a, ['hx.hotOut', [hotOut[0], 88], [150, 88], 'st.bottom'], { F, color: C.vermillion });
  L.text(a, 42, 128, 'plateHX', { size: 6, anchor: 'middle' });
  L.text(a, 150, 128, 'electrolyserStack', { size: 6, anchor: 'middle' });
  L.text(a, 96, 112, 'gapAt', { size: 6 });
}

function panelB(F: Figure): void {
  const b = F.panel('b', { x: 81, y: 1, w: 46, h: 54 });
  const xs = Q.ionString(5, { span: 90, cx: 65 });
  const y0 = 88;
  Q.potentialWell(b, 65, 66, 98, { hw: 62 });
  for (const x of xs) Q.ion(b, x, y0, 5);
  for (let i = 1; i < xs.length; i++) {
    const x = at(xs, i);
    const prev = at(xs, i - 1);
    L.text(b, (x + prev) / 2, y0 + 20, (x - prev).toFixed(1), { size: 5, anchor: 'middle', color: C.mid });
  }
  L.text(b, 65, 128, 'ionString(5): spacing in pt', { size: 6, anchor: 'middle' });
}

function cacheCells(): (string | null | false)[][] {
  const rows: (string | null | false)[][] = [];
  for (let r = 0; r < 4; r++) {
    const row: (string | null | false)[] = [];
    for (let k = 0; k < 8; k++) {
      if (r === 0) row.push('#c9d9ee');
      else if (k < 5) row.push(null);
      else if (k === 7 && r === 3) row.push(false);
      else row.push('#f6d2b8');
    }
    rows.push(row);
  }
  return rows;
}

function panelC(F: Figure): void {
  const c: Parent = F.panel('c', { x: 129, y: 1, w: 53, h: 54 });
  const G = S.cacheGrid(c, 14, 30, 4, 8, { cw: 14, ch: 10, gap: 3, cells: cacheCells() });
  const xs: number[] = [];
  const fill: string[] = [];
  const stroke: string[] = [];
  for (let k = 0; k < 8; k++) {
    xs.push(S.cacheCell(G, 0, k).cx);
    fill.push(k < 5 ? '#c9d9ee' : '#f6d2b8');
    stroke.push(k < 5 ? C.blue : C.orange);
  }
  S.attnStrip(c, xs, 26, [0.2, 0.1, 0.4, 0.3, 0.1, 1.4, 1.8, 2.3], { maxH: 16, barW: 8, fill, stroke });
  L.text(c, 14 + G.w / 2, 128, 'cacheGrid + attnStrip (softmax)', { size: 6, anchor: 'middle' });
}

export default function draw(F: Figure): void {
  panelA(F);
  panelB(F);
  panelC(F);
}
