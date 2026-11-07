// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Handle, Loose, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, ellipse, path, rect, smooth } from './draw.ts';
import { at, f3 } from './util.ts';
import { blob, finish, nextRand } from './illustrate.ts';
import type { Ill, IllOpts, Part, Reg, Tissue, Vary } from './bio-util.ts';
import { TISSUE, floorOf, fw, illOf, reg, vary, varyTint } from './bio-util.ts';
import type { CellKind, Palette, TissueCell, TissueCellOpts } from './bio-tissue-run.ts';
import { runAt, runsOf, tissueCell, tissueRunIllustrated } from './bio-tissue-run.ts';

const C = STYLE.color;

export type CellLayerOpts = Reg &
  IllOpts &
  TissueCellOpts &
  Loose<{
    kind: CellKind;
    h: number;
    n: number;
    pitch: number;
    gap: number;
    side: 1 | -1;
    closed: boolean;
    smooth: boolean;
    trim: number | readonly [number, number];
    palette: Palette;
  }>;
export interface CellLayerResult extends Part {
  cells: TissueCell[];
}

export function palOfTissue(pal: Palette | undefined, kind: CellKind): Tissue {
  if (typeof pal === 'object') return pal;
  return TISSUE[pal ?? (kind === 'squamous' ? 'endo' : 'epi')];
}

const PITCH: Record<CellKind, number> = { dome: 2.2, squamous: 4.5, cuboidal: 1.1, columnar: 0.55 };

function trimOf(o: CellLayerOpts, h: number): readonly [number, number] {
  const t = o.trim ?? (o.closed === true ? [h, 0] : 0);
  return typeof t === 'number' ? [t, t] : t;
}

export function cellLayer(p: Parent, pts: readonly Point[], o: CellLayerOpts = {}): CellLayerResult {
  const K = floorOf(p);
  const kind = o.kind ?? 'dome';
  const g = el(p, 'g', { 'data-part': o.part ?? 'cell-layer' });
  const gh: Handle = { node: g };
  const il = illOf(o);
  const pal = palOfTissue(o.palette, kind);
  const h = o.h ?? 6;
  const pitch = o.pitch ?? h * PITCH[kind];
  const side = o.side ?? 1;
  const gap = o.gap ?? 0.02;
  const runs = runsOf(g, pts, o.closed === true, o.smooth !== false);
  const cells: TissueCell[] = [];
  let Ltot = 0;
  for (const r of runs) Ltot += r.L;
  for (const r of runs) {
    const [t0, t1] = o.smooth === false ? trimOf(o, h) : [0, 0];
    const L = r.L - t0 - (o.smooth === false ? t1 : 0);
    if (L <= 0) continue;
    const n = Math.max(1, o.n !== undefined && o.n !== 0 ? Math.round((o.n * r.L) / Ltot) : Math.round(L / pitch));
    const sl = L / n;
    if (il !== undefined) tissueRunIllustrated(gh, K, kind, r, t0, L, n, side, h, gap, o, pal, il, cells);
    else for (let i = 0; i < n; i++) cells.push(tissueCell(gh, K, kind, r, t0 + (i + 0.5) * sl, side, sl * (1 - gap), h, o, pal));
  }
  const e = at(runs, runs.length - 1);
  const start = runAt(at(runs, 0), 0);
  const mid = cells.length > 0 ? at(cells, Math.floor(cells.length / 2)).top : start;
  return { node: g, cells, ports: reg(o, p, { start, end: runAt(e, e.L), mid }) };
}

export type LumenOpts = CellLayerOpts & Loose<{ t: number; lumen: string; backing: string | false; label: string; size: number; color: string }>;

export function lumen(p: Parent, cx: number, cy: number, r: number, o: LumenOpts = {}): Part & { inner: number } {
  const kind = o.kind ?? 'squamous';
  const t = o.t ?? 0.28 * r;
  const g = el(p, 'g', { 'data-part': o.part ?? 'lumen' });
  const pal = palOfTissue(o.palette, kind);
  if (o.backing !== false) circle(g, cx, cy, r, { fill: o.backing ?? pal.stroke, part: 'lumen-backing' });
  circle(g, cx, cy, r - t * 0.92, { fill: o.lumen ?? '#a9d3f1', part: 'lumen-space' });
  const N = 72;
  const ring: Point[] = [];
  for (let i = 0; i < N; i++) ring.push([cx + r * Math.cos((2 * Math.PI * i) / N), cy + r * Math.sin((2 * Math.PI * i) / N)]);
  const per = kind === 'squamous' ? 2.6 : kind === 'dome' ? 1.4 : 1.1;
  const n = o.n ?? Math.max(5, Math.round((2 * Math.PI * r) / (t * per)));
  cellLayer(g, ring, { ...o, F: undefined, name: undefined, kind, h: t, closed: true, side: -1, n, part: 'lumen-cells' });
  if (o.label !== undefined && o.label !== '') text(g, cx, cy, o.label, { size: o.size ?? STYLE.text.label, anchor: 'middle', valign: 'middle', color: o.color ?? C.text });
  const ports = reg(o, p, { center: [cx, cy], top: [cx, cy - r], bottom: [cx, cy + r], left: [cx - r, cy], right: [cx + r, cy] });
  return { node: g, ports, inner: r - t };
}

export type PorousOpts = Reg & Loose<{ pitch: number; pore: number; fill: string; poreFill: string; stroke: string; width: number; phase: number }>;

export function porousMembrane(p: Parent, x0: number, x1: number, y: number, h: number, o: PorousOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'porous-membrane' });
  const fill = o.fill ?? '#95cf80';
  const pitch = o.pitch ?? 3.5 * h;
  const pw = o.pore ?? 0.45 * h;
  const hasStroke = o.stroke !== undefined && o.stroke !== '';
  rect(g, x0, y, x1 - x0, h, { fill, stroke: o.stroke, width: hasStroke ? fw(K, o.width ?? STYLE.line.hair) : undefined, part: 'membrane' });
  for (let x = x0 + (o.phase ?? pitch / 2); x < x1 - pw; x += pitch) rect(g, x - pw / 2, y, pw, h, { fill: o.poreFill ?? '#3e9b45', part: 'pore' });
  const cx = (x0 + x1) / 2;
  const ports = reg(o, p, { top: [cx, y], bottom: [cx, y + h], center: [cx, y + h / 2], left: [x0, y + h / 2], right: [x1, y + h / 2] });
  return { node: g, ports };
}

export type InsertOpts = Loose<{
  w: number;
  gap: number;
  wall: number;
  level: number;
  membrane: number;
  pitch: number;
  cells: false | CellLayerOpts;
  endothelium: boolean | CellLayerOpts;
  color: string;
}>;
export type WellOpts = Reg & Loose<{ wall: number; floor: number; level: number; body: string; medium: string; stroke: string; width: number; insert: boolean | InsertOpts }>;
export interface WellResult extends Part {
  cavity: { x0: number; x1: number; y0: number; y1: number };
  insert: { x0: number; x1: number; y: number } | null;
}

interface WellCtx {
  g: Handle;
  x: number;
  y: number;
  w: number;
  h: number;
  cx0: number;
  cx1: number;
  cy0: number;
  cy1: number;
  med: string;
  lev: number;
}

function wellInsert(c: WellCtx, io: InsertOpts, pp: Record<string, Point>): { x0: number; x1: number; y: number } {
  const { g, x, y, w, h, cx0, cx1, cy0, cy1, med, lev } = c;
  const iw = io.w ?? 0.62 * (cx1 - cx0);
  const ix0 = (cx0 + cx1) / 2 - iw / 2;
  const ix1 = ix0 + iw;
  const iwall = io.wall ?? 0.035 * w;
  const my = cy1 - (io.gap ?? 0.28 * (cy1 - cy0));
  const mh = io.membrane ?? 0.035 * h;
  const top = y - iwall * 0.8;
  const col = io.color ?? '#8a92a8';
  const iy = my - (io.level ?? lev * 0.95) * (my - top);
  rect(g, ix0, iy, iw, my - iy, { fill: shade(med, 0.18), part: 'insert-medium' });
  for (const xw of [ix0 - iwall, ix1]) rect(g, xw, top, iwall, my + mh - top, { fill: col, part: 'insert-wall' });
  for (const [a, b] of [[x, ix0 - iwall], [ix1 + iwall, x + w]] as const) rect(g, a, top, b - a, iwall * 0.8, { fill: col, part: 'insert-flange' });
  porousMembrane(g, ix0, ix1, my, mh, { pitch: io.pitch ?? 3.2 * mh, pore: 0.5 * mh });
  if (io.cells !== false) cellLayer(g, [[ix0, my], [ix1, my]], { kind: 'dome', h: 0.09 * h, ...io.cells });
  if (io.endothelium !== undefined && io.endothelium !== false) {
    const eo = io.endothelium === true ? {} : io.endothelium;
    cellLayer(g, [[ix0, my + mh], [ix1, my + mh]], { kind: 'squamous', h: 0.035 * h, side: -1, ...eo });
  }
  pp['apical'] = [(ix0 + ix1) / 2, (iy + my) / 2];
  pp['basal'] = [(ix0 + ix1) / 2, (my + mh + cy1) / 2];
  pp['membrane'] = [ix1, my + mh / 2];
  return { x0: ix0, x1: ix1, y: my };
}

export function wellSection(p: Parent, x: number, y: number, w: number, h: number, o: WellOpts = {}): WellResult {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'well-section' });
  const wall = o.wall ?? 0.08 * w;
  const fl = o.floor ?? 0.12 * h;
  const cx0 = x + wall;
  const cx1 = x + w - wall;
  const cy0 = y;
  const cy1 = y + h - fl;
  const med = o.medium ?? '#a9d3f1';
  const lev = o.level ?? 0.82;
  const ym = cy1 - lev * (cy1 - cy0);
  rect(g, cx0, ym, cx1 - cx0, cy1 - ym, { fill: med, part: 'medium' });
  path(g, `M${f3(x)},${f3(y)} H${f3(cx0)} V${f3(cy1)} H${f3(cx1)} V${f3(y)} H${f3(x + w)} V${f3(y + h)} H${f3(x)} Z`, {
    fill: o.body ?? '#dfe2e9', stroke: o.stroke ?? '#c2c7d2', width: fw(K, o.width ?? STYLE.line.thin), part: 'well-body',
  });
  const pp: Record<string, Point> = { floor: [(cx0 + cx1) / 2, cy1], medium: [(cx0 + cx1) / 2, (ym + cy1) / 2], rimL: [x + wall / 2, y], rimR: [x + w - wall / 2, y] };
  let ins: { x0: number; x1: number; y: number } | null = null;
  if (o.insert !== undefined && o.insert !== false) {
    const c: WellCtx = { g: { node: g }, x, y, w, h, cx0, cx1, cy0, cy1, med, lev };
    ins = wellInsert(c, o.insert === true ? {} : o.insert, pp);
  }
  return { node: g, ports: reg(o, p, pp), cavity: { x0: cx0, x1: cx1, y0: cy0, y1: cy1 }, insert: ins };
}

export type SheetOpts = IllOpts &
  Loose<{ nu: number; nv: number; rx: number; ry: number; fill: string; stroke: string; width: number; nucleus: boolean; nucleusFill: string; contrast: number; seed: number; part: string }>;

function sheetCellIllustrated(g: Handle, K: number, cx: number, cy: number, rx: number, ry: number, o: SheetOpts, pal: Tissue, il: Ill, v: Vary): void {
  const crx = rx * v.k * Math.sqrt(v.aspect);
  const cry = (ry * v.k) / Math.sqrt(v.aspect);
  const fill = varyTint(v, o.fill ?? pal.fill);
  const d = smooth(blob(cx + v.dx, cy + v.dy, Math.sqrt(crx * cry), { aspect: crx / cry, rot: v.rot, amp: 0.06, seed: v.seed }), true, 0.5);
  const c = finish(g, d, fill, {
    light: il.light, contrast: o.contrast ?? il.contrast ?? 0.85, rim: 0.5, core: 0.3, highlight: 0.45, width: fw(K, o.width ?? Math.max(0.05 * ry, STYLE.line.hair)), outline: o.stroke ?? pal.stroke, part: 'cell',
  });
  if (o.nucleus === false) return;
  const nx = cx + v.dx - crx * (0.1 + 0.12 * (nextRand(v.r) - 0.5));
  const ny = cy + v.dy - cry * (0.1 + 0.12 * (nextRand(v.r) - 0.5));
  const nrx = crx * 0.32 * (0.9 + 0.2 * nextRand(v.r));
  const nry = cry * 0.36 * (0.9 + 0.2 * nextRand(v.r));
  const nd = smooth(blob(nx, ny, Math.sqrt(nrx * nry), { aspect: nrx / nry, rot: (nextRand(v.r) - 0.5) * 30, amp: 0.06, seed: v.seed + 5 }), true, 0.5);
  finish(c.inner, nd, o.nucleusFill ?? '#6aa6de', { light: il.light, contrast: 0.75, rim: 0.35, core: 0.2, highlight: 0.3, width: fw(K, Math.max(0.035 * ry, STYLE.line.hair)), part: 'nucleus' });
}

function quadAt(q: readonly Point[], u: number, v: number): Point {
  const a = at(q, 0);
  const b = at(q, 1);
  const c = at(q, 2);
  const d = at(q, 3);
  return [
    a[0] * (1 - u) * (1 - v) + b[0] * u * (1 - v) + c[0] * u * v + d[0] * (1 - u) * v,
    a[1] * (1 - u) * (1 - v) + b[1] * u * (1 - v) + c[1] * u * v + d[1] * (1 - u) * v,
  ];
}

export function cellSheet(p: Parent, q: readonly Point[], o: SheetOpts = {}): { node: SVGGElement; cells: Point[] } {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'cell-sheet' });
  const gh: Handle = { node: g };
  const nu = o.nu ?? 8;
  const nv = o.nv ?? 4;
  const pal = TISSUE.epi;
  const il = illOf(o);
  const du = Math.hypot(at(q, 1)[0] - at(q, 0)[0], at(q, 1)[1] - at(q, 0)[1]) / nu;
  const dv = Math.hypot(at(q, 3)[0] - at(q, 0)[0], at(q, 3)[1] - at(q, 0)[1]) / nv;
  const rx = o.rx ?? 0.55 * du;
  const ry = o.ry ?? Math.max(0.55 * dv, 0.3 * rx);
  const cells: Point[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const u = (i + 0.5 + (j % 2) * 0.5) / nu;
      if (u > 1 - 0.3 / nu) continue;
      const [cx, cy] = quadAt(q, u, (j + 0.5) / nv);
      cells.push([cx, cy]);
      if (il !== undefined) {
        sheetCellIllustrated(gh, K, cx, cy, rx, ry, o, pal, il, vary(o.seed ?? 5, cells.length, { size: 0.08, rot: 14, aspect: 0.1, hue: 4, lum: 0.035, jitter: 0.06 * rx }));
        continue;
      }
      ellipse(g, cx, cy, rx, ry, { fill: o.fill ?? pal.fill, stroke: o.stroke ?? pal.stroke, width: fw(K, o.width ?? Math.max(0.05 * ry, STYLE.line.hair)), part: 'cell' });
      if (o.nucleus !== false) ellipse(g, cx - rx * 0.1, cy - ry * 0.1, rx * 0.32, ry * 0.36, { fill: o.nucleusFill ?? '#6aa6de', part: 'nucleus' });
    }
  }
  return { node: g, cells };
}
