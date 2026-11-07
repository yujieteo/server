// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Figure, GradientStop, Loose, Parent, Point } from './types.ts';
import { STYLE, shade } from './style.ts';
import { text } from './core.ts';
import { line, linearGradient, rect } from './draw.ts';
import { at } from './util.ts';
import { gOf, reg } from './chem-text.ts';
import type { Box } from './chem-text.ts';

export interface SocketSpec {
  side: 'left' | 'right';
  t: number;
  w?: number | undefined;
  h?: number | undefined;
}

export type CellOpts = Loose<{
  electrode: number;
  membrane: number;
  left: string | readonly GradientStop[];
  right: string | readonly GradientStop[];
  electrodeFill: string;
  membraneFill: string;
  r: number;
  stroke: string;
  strokeWidth: number;
  shadow: number;
  separator: string;
  electrodeLabels: readonly string[];
  labelSize: number;
  labelColor: string;
  membraneLabel: string;
  sockets: readonly SocketSpec[];
  F: Figure;
  name: string;
}>;

export interface CellResult {
  node: SVGGElement;
  xs: number[];
  left: Box;
  right: Box;
  ports: Point[];
  wallLeft: number;
  wallRight: number;
  y: number;
  h: number;
}

export function cellWall(cell: CellResult, side: 'left' | 'right', t: number): Point {
  return [side === 'left' ? cell.wallLeft : cell.wallRight, cell.y + cell.h * t];
}

function chamberFill(g: SVGGElement, c: string | readonly GradientStop[] | undefined, dflt: string): string {
  if (typeof c === 'string' || c === undefined) {
    return linearGradient(g, [[0, shade(c ?? dflt, 0.7)], [1, c ?? dflt]], 90);
  }
  return linearGradient(g, c, 90);
}

function drawSockets(g: SVGGElement, cell: CellResult, o: CellOpts, ew: number, sw: number): void {
  for (const s of o.sockets ?? []) {
    const sw2 = s.w ?? ew * 0.45;
    const sh2 = s.h ?? cell.h * 0.08;
    const [wx, wy] = cellWall(cell, s.side, s.t);
    const sx = s.side === 'left' ? wx - sw2 : wx;
    rect(g, sx, wy - sh2 / 2, sw2, sh2, { fill: '#f4f4f4', stroke: '#9d9d9d', width: sw, part: 'socket' });
    cell.ports.push([s.side === 'left' ? wx - sw2 : wx + sw2, wy]);
  }
}

function drawLabels(g: SVGGElement, o: CellOpts, xs: readonly number[], x: number, y: number, w: number, h: number): void {
  const ls = o.labelSize ?? STYLE.text.label;
  const labels = o.electrodeLabels ?? [];
  for (let k = 0; k < labels.length; k++) {
    const s = at(labels, k);
    if (s === '') continue;
    const cx = k !== 0 ? (at(xs, 4) + at(xs, 5)) / 2 : (at(xs, 0) + at(xs, 1)) / 2;
    text(g, cx, y + h / 2, s, { size: ls, anchor: 'middle', valign: 'middle', rotate: -90, color: o.labelColor });
  }
  if (o.membraneLabel !== undefined && o.membraneLabel !== '') {
    text(g, x + w / 2, y + h + ls * 1.2, o.membraneLabel, { size: ls * 0.85, anchor: 'middle', color: o.labelColor });
  }
}

export function electrochemCell(p: Parent, x: number, y: number, w: number, h: number, o: CellOpts = {}): CellResult {
  const g = gOf(p, 'electrochem-cell');
  const ew = o.electrode ?? w * 0.12;
  const mw = o.membrane ?? w * 0.03;
  const r = Math.min(o.r ?? Math.min(w, h) * 0.07, ew * 0.9);
  const xs = [x, x + ew, x + w / 2 - mw / 2, x + w / 2 + mw / 2, x + w - ew, x + w];
  const [e0, m0, m1, e1, x1] = [at(xs, 1), at(xs, 2), at(xs, 3), at(xs, 4), at(xs, 5)];
  const stroke = o.stroke ?? '#a3a3a3';
  const sw = o.strokeWidth ?? STYLE.line.thin;
  const shd = o.shadow ?? 1;
  if (shd !== 0) rect(g.node, x + shd, y + shd, w, h, { r, fill: '#9a9a9a' });
  rect(g.node, x, y, w, h, { r, fill: o.electrodeFill ?? '#efefef' });
  rect(g.node, e0, y, m0 - e0, h, { fill: chamberFill(g.node, o.left, '#b8b8b8') });
  rect(g.node, m1, y, e1 - m1, h, { fill: chamberFill(g.node, o.right, '#b9cfe8') });
  rect(g.node, m0, y, mw, h, { fill: o.membraneFill ?? linearGradient(g.node, [[0, '#a9a9a9'], [0.45, '#f2f2f2'], [0.6, '#e6e6e6'], [1, '#b2b2b2']], 0), part: 'membrane' });
  for (const xx of [e0, m0, m1, e1]) line(g.node, [xx, y], [xx, y + h], { stroke: o.separator ?? '#bcbcbc', width: sw });
  rect(g.node, x, y, w, h, { r, stroke, width: sw });
  drawLabels(g.node, o, xs, x, y, w, h);
  const cell: CellResult = { node: g.node, xs, left: { x: e0, y, w: m0 - e0, h }, right: { x: m1, y, w: e1 - m1, h }, ports: [], wallLeft: x, wallRight: x1, y, h };
  drawSockets(g.node, cell, o, ew, sw);
  reg(o.F, o.name, p, { left: [x, y + h / 2], right: [x1, y + h / 2], top: [x + w / 2, y], bottom: [x + w / 2, y + h], membrane: [x + w / 2, y + h / 2] });
  return cell;
}
