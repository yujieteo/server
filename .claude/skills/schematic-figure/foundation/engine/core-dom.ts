// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js
import type { Attrs, Figure, Paint, Parent, Rect } from './types.ts';
import { STYLE, patentPaint } from './style.ts';

export const MM: number = 72 / 25.4;
export function mm(v: number): number {
  return v * MM;
}
export const NS = 'http://www.w3.org/2000/svg';

export function node(p: Parent): Element {
  return 'node' in p ? p.node : p;
}

export function graphics(e: Element): SVGGraphicsElement {
  if (!(e instanceof SVGGraphicsElement)) throw new Error('not a graphics element');
  return e;
}

export function ctm(e: Element): DOMMatrix {
  const m = graphics(e).getScreenCTM();
  if (m === null) throw new Error('element is not rendered');
  return m;
}

export function el<K extends keyof SVGElementTagNameMap>(
  parent: Parent | null | undefined,
  tag: K,
  attrs?: Attrs,
  text?: string,
): SVGElementTagNameMap[K];
export function el(
  parent: Parent | null | undefined,
  tag: string,
  attrs?: Attrs,
  text?: string,
): SVGElement;
export function el(
  parent: Parent | null | undefined,
  tag: string,
  attrs: Attrs = {},
  text?: string,
): SVGElement {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) e.setAttribute(k, String(v));
  }
  if (text !== undefined) e.textContent = text;
  if (parent !== undefined && parent !== null) node(parent).appendChild(e);
  return e;
}

export function paint(s0: Paint = {}): Attrs {
  const s = STYLE.format === 'patent' ? patentPaint(s0) : s0;
  const a: Attrs = {};
  a['fill'] = s.fill ?? 'none';
  if (s.stroke !== undefined && s.stroke !== 'none') {
    a['stroke'] = s.stroke;
    a['stroke-width'] = s.width ?? STYLE.line.normal;
    a['stroke-linecap'] = s.cap ?? 'round';
    a['stroke-linejoin'] = s.join ?? 'round';
    if (s.dash !== undefined && s.dash !== '') {
      a['stroke-dasharray'] = typeof s.dash === 'string' ? s.dash : s.dash.join(' ');
    }
  } else a['stroke'] = 'none';
  if (s.opacity !== undefined) a['opacity'] = s.opacity;
  if (s.fillOpacity !== undefined) a['fill-opacity'] = s.fillOpacity;
  if (s.strokeOpacity !== undefined) a['stroke-opacity'] = s.strokeOpacity;
  if (s.filter !== undefined && s.filter !== '') a['filter'] = s.filter;
  if (s.blend !== undefined && s.blend !== '') a['style'] = `mix-blend-mode:${s.blend}`;
  return a;
}

export function toRoot(F: Figure, e: Parent, x: number, y: number): [number, number] {
  const r = ctm(F.svg).inverse().multiply(ctm(node(e)));
  const p = new DOMPoint(x, y).matrixTransform(r);
  return [p.x, p.y];
}

export function bboxRoot(F: Figure, e: Parent): Rect {
  const b = graphics(node(e)).getBBox();
  const corners: [number, number][] = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of corners) {
    const q = toRoot(F, e, x, y);
    xs.push(q[0]);
    ys.push(q[1]);
  }
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}
