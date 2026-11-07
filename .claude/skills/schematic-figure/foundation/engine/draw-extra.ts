// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/draw.js
import type { Figure, IsoProj, Loose, Paint, Parent, Point } from './types.ts';
import { el, text } from './core.ts';
import { STYLE, shade } from './style.ts';
import { polygon, rect } from './draw-base.ts';

export type IsoOpts = Loose<{ angle: number; sx: number; sy: number; sz: number }>;

export function isoProj(o: IsoOpts = {}): IsoProj {
  const angle = o.angle ?? 30;
  return {
    c: Math.cos((angle * Math.PI) / 180),
    s: Math.sin((angle * Math.PI) / 180),
    sx: o.sx ?? 1,
    sy: o.sy ?? 1,
    sz: o.sz ?? 1,
  };
}

export function isoPt(proj: IsoProj, x: number, y: number, z: number = 0): Point {
  return [(x - y) * proj.c * proj.sx, (x + y) * proj.s * proj.sy - z * proj.sz];
}

export type IsoBoxOpts = Loose<{ top: string; left: string; right: string; stroke: string; width: number; part: string }>;

type Offset3 = readonly [number, number, number];

function isoFace(g: Element, proj: IsoProj, origin: Offset3, offsets: readonly Offset3[], s: Paint): void {
  const pts: Point[] = [];
  for (const [a, b, c] of offsets) pts.push(isoPt(proj, origin[0] + a, origin[1] + b, origin[2] + c));
  polygon(g, pts, s);
}

export function isoBox(p: Parent, proj: IsoProj, origin: Offset3, size: Offset3, o: IsoBoxOpts = {}): SVGGElement {
  const [w, d, h] = size;
  const top = o.top ?? '#dfe6ee';
  const stroke = o.stroke ?? STYLE.color.ink;
  const width = o.width ?? STYLE.line.thin;
  const g = el(p, 'g', { 'data-part': o.part ?? 'iso-box' });
  const L = o.left ?? shade(top, -0.12);
  const R = o.right ?? shade(top, -0.25);
  isoFace(g, proj, origin, [[0, d, 0], [w, d, 0], [w, d, h], [0, d, h]], { fill: L, stroke, width });
  isoFace(g, proj, origin, [[w, 0, 0], [w, d, 0], [w, d, h], [w, 0, h]], { fill: R, stroke, width });
  isoFace(g, proj, origin, [[0, 0, h], [w, 0, h], [w, d, h], [0, d, h]], { fill: top, stroke, width });
  return g;
}

export type ImageOpts = Loose<{
  h: number;
  pxw: number;
  pxh: number;
  anchors: Record<string, Point>;
  F: Figure;
  prefix: string;
}>;

export function image(p: Parent, href: string, x: number, y: number, w: number, o: ImageOpts = {}): SVGImageElement {
  const h = o.h ?? w * ((o.pxh ?? NaN) / (o.pxw ?? NaN));
  const im = el(p, 'image', {
    href, x, y, width: w, height: h, preserveAspectRatio: 'none', 'data-pxw': o.pxw, 'data-pxh': o.pxh,
  });
  if (o.anchors !== undefined && o.F !== undefined) {
    for (const [k, [px, py]] of Object.entries(o.anchors)) {
      o.F.anchor((o.prefix ?? '') + k, p, x + (px / (o.pxw ?? NaN)) * w, y + (py / (o.pxh ?? NaN)) * h);
    }
  }
  return im;
}

export type FrameOpts = Loose<{
  title: string;
  stroke: string;
  fill: string;
  dash: string;
  r: number;
  width: number;
  titleSize: number;
}>;

export function frame(p: Parent, x: number, y: number, w: number, h: number, o: FrameOpts = {}): SVGGElement {
  const g = el(p, 'g', { 'data-part': 'frame' });
  rect(g, x, y, w, h, {
    r: o.r ?? 2, stroke: o.stroke ?? STYLE.color.mid, fill: o.fill ?? 'none', dash: o.dash, width: o.width ?? STYLE.line.thin,
  });
  if (o.title !== undefined && o.title !== '') {
    text(g, x + 2, y - 1.6, o.title, { size: o.titleSize ?? STYLE.text.label, color: STYLE.color.text });
  }
  return g;
}

export type SvgFileOpts = Loose<{ h: number; part: string; keepBackground: boolean }>;

function num(v: string | null): number {
  return parseFloat(v === null || v === '' ? '0' : v);
}

function dropBackground(s: Element, vw: number): void {
  for (const r of s.querySelectorAll('rect')) {
    const st = `${r.getAttribute('style') ?? ''} ${r.getAttribute('fill') ?? ''} ${r.getAttribute('class') ?? ''}`;
    if (/background|#FFFFFF|#ffffff|white/.test(st) && num(r.getAttribute('width')) >= vw * 0.9) r.remove();
  }
}

export async function svgFile(
  p: Parent,
  href: string,
  x: number,
  y: number,
  w: number,
  o: SvgFileOpts = {},
): Promise<{ el: SVGSVGElement; h: number }> {
  const t = await (await fetch(`${href}${href.includes('?') ? '&' : '?'}v=${Date.now()}`)).text();
  const src = new DOMParser().parseFromString(t, 'image/svg+xml').documentElement;
  const vb = src.getAttribute('viewBox') ?? `0 0 ${num(src.getAttribute('width'))} ${num(src.getAttribute('height'))}`;
  const parts = vb.split(/[ ,]+/);
  const vw = Number(parts[2]);
  const vh = Number(parts[3]);
  const h = o.h ?? (w * vh) / vw;
  const s = el(p, 'svg', { x, y, width: w, height: h, viewBox: vb, overflow: 'visible', 'data-part': o.part ?? 'svg-import' });
  for (const c of src.childNodes) s.appendChild(document.importNode(c, true));
  if (o.keepBackground !== true) dropBackground(s, vw);
  return { el: s, h };
}
