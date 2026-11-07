// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Figure, Loose, Parent } from './types.ts';
import { STYLE } from './style.ts';
import { el } from './core.ts';
import { at } from './util.ts';
import { chemText, gOf, reg } from './chem-text.ts';
import type { Box } from './chem-text.ts';
import type { ArcGeom, HeadKind } from './chem-arrows.ts';
import { arcArrow, arcPoint, equilibriumArc } from './chem-arrows.ts';

export type ArcKind = 'arrow' | 'equilibrium' | 'plain' | 'none';

export type Station = { angle: number } & Loose<{
  label: string;
  name: string;
  size: number;
  color: string;
  weight: string | number;
  formula: boolean;
  pad: number;
  arc: ArcKind;
}>;

export type CycleOpts = Loose<{
  stations: readonly Station[];
  dir: 'cw' | 'ccw';
  pad: number;
  head: HeadKind;
  len: number;
  width: number;
  color: string;
  gap: number;
  closed: boolean;
  F: Figure;
  name: string;
}>;

export interface StationInfo {
  station: Station;
  x: number;
  y: number;
  box: Box | null;
  exit: number;
  entry: number;
}

export interface CycleArc {
  from: string | undefined;
  to: string | undefined;
  a0: number;
  a1: number;
}

export interface CycleResult {
  node: SVGGElement;
  arc: ArcGeom;
  stations: StationInfo[];
  arcs: CycleArc[];
}

function insideBox(geom: ArcGeom, box: Box | null, a: number): boolean {
  if (box === null) return false;
  const [u, v] = arcPoint(geom, a);
  return u > box.x && u < box.x + box.w && v > box.y && v < box.y + box.h;
}

function clearAngle(geom: ArcGeom, box: Box | null, start: number, d: number): number {
  let a = start;
  for (let i = 0; i < 1800 && insideBox(geom, box, a); i++) a += d * 0.2;
  return a;
}

function stationBox(g: SVGGElement, s: Station, x: number, y: number, o: CycleOpts): Box | null {
  if (s.label === undefined) return null;
  const lg = el(g, 'g', { 'data-part': 'cycle-species' });
  chemText(lg, x, y, s.label, { anchor: 'middle', valign: 'middle', size: s.size ?? STYLE.text.label, color: s.color, weight: s.weight, formula: s.formula });
  const b = lg.getBBox();
  const pad = s.pad ?? o.pad ?? 1.5;
  return { x: b.x - pad, y: b.y - pad, w: b.width + 2 * pad, h: b.height + 2 * pad };
}

function stationsOf(p: Parent, g: SVGGElement, geom: ArcGeom, o: CycleOpts): StationInfo[] {
  const info: StationInfo[] = [];
  for (const s of o.stations ?? []) {
    const [x, y] = arcPoint(geom, s.angle);
    const box = stationBox(g, s, x, y, o);
    if (o.F !== undefined && o.name !== undefined && o.name !== '' && s.name !== undefined && s.name !== '') o.F.anchor(`${o.name}.${s.name}`, p, x, y);
    info.push({ station: s, x, y, box, exit: clearAngle(geom, box, s.angle, geom.sg), entry: clearAngle(geom, box, s.angle, -geom.sg) });
  }
  return info;
}

function named(s: string | undefined): s is string {
  return s !== undefined && s !== '';
}

function drawArc(arcs: SVGGElement, geom: ArcGeom, A: StationInfo, Bn: StationInfo, o: CycleOpts): CycleArc {
  const kind = A.station.arc ?? 'arrow';
  const sg = geom.sg;
  const a0 = A.exit;
  let a1 = Bn.entry;
  while (sg * (a1 - a0) <= 0) a1 += 360 * sg;
  const head = Bn.box !== null ? (o.head ?? 'end') : 'none';
  const common = { len: o.len, width: o.width, color: o.color };
  if (kind === 'equilibrium') equilibriumArc({ node: arcs }, geom.cx, geom.cy, geom.r, a0, a1, { ...common, gap: o.gap });
  else arcArrow({ node: arcs }, geom.cx, geom.cy, geom.r, a0, a1, { ...common, head: kind === 'plain' ? 'none' : head });
  const an = A.station.name;
  const bn = Bn.station.name;
  if (o.F !== undefined && named(o.name) && named(an) && named(bn) && kind !== 'plain') {
    o.F.drew(`${o.name}.${an}`, `${o.name}.${bn}`, kind === 'equilibrium' ? 'equilibrium' : 'cycle');
  }
  return { from: an, to: bn, a0, a1 };
}

export function catalyticCycle(p: Parent, cx: number, cy: number, r: number, o: CycleOpts = {}): CycleResult {
  const g = gOf(p, 'catalytic-cycle');
  const geom: ArcGeom = { cx, cy, r, sg: (o.dir ?? 'cw') === 'cw' ? 1 : -1 };
  const arcs = el(g.node, 'g', { 'data-part': 'cycle-arcs' });
  const info = stationsOf(p, g.node, geom, o);
  const out: CycleArc[] = [];
  for (let i = 0; i < info.length; i++) {
    const kind = at(info, i).station.arc ?? 'arrow';
    if (kind === 'none' || info.length < 2 || (o.closed === false && i === info.length - 1)) continue;
    out.push(drawArc(arcs, geom, at(info, i), at(info, (i + 1) % info.length), o));
  }
  reg(o.F, o.name, p, { center: [cx, cy] });
  return { node: g.node, arc: geom, stations: info, arcs: out };
}
