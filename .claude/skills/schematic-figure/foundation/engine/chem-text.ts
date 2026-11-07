// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/chem.js
import type { Figure, Palette, Parent, Point, Ports, TextOpts } from './types.ts';
import { el, node, text } from './core.ts';
import { STYLE } from './style.ts';
import { at, f3, unit } from './util.ts';

const XML_NS: string = ['http:', '', 'www.w3.org', 'XML', '1998', 'namespace'].join('/');

export const C: Palette = STYLE.color;
export const INK: string = C.text;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GHandle {
  node: SVGGElement;
}

export type ChemTextOpts = TextOpts & { formula?: boolean | undefined; stack?: boolean | undefined };

export function rad(a: number): number {
  return (a * Math.PI) / 180;
}

export function reg(F: Figure | undefined, name: string | undefined, parent: Parent, ports: Ports): Ports {
  if (F !== undefined && name !== undefined && name !== '') {
    for (const [k, q] of Object.entries(ports)) F.anchor(`${name}.${k}`, parent, q[0], q[1]);
  }
  return ports;
}

export function gOf(p: Parent, part: string): GHandle {
  return { node: el(p, 'g', { 'data-part': part }) };
}

export function defsOf(p: Parent): Element | null {
  let n: Node | null = node(p);
  while (n !== null && !(n instanceof SVGSVGElement)) n = n.parentNode;
  if (n === null) throw new Error('chem: part is not inside an svg');
  return n.querySelector('defs');
}

export function plainOf(s: string): string {
  return s.replace(/\{#[^|}]*\|/g, '').replace(/[_^]\{[^}]*\}|[_^].|[{}*\\]/g, '');
}

export function ellDist(u: readonly [number, number], hw: number, hh: number): number {
  return 1 / Math.sqrt((u[0] / hw) ** 2 + (u[1] / hh) ** 2);
}

export function roundPath(P: readonly Point[], r: number): string {
  const first = at(P, 0);
  let d = `M${f3(first[0])},${f3(first[1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [px, py] = at(P, i);
    const a = at(P, i - 1);
    const c = at(P, i + 1);
    const rr = Math.min(r, Math.hypot(px - a[0], py - a[1]) / 2, Math.hypot(c[0] - px, c[1] - py) / 2);
    const ua = unit(px - a[0], py - a[1]);
    const uc = unit(c[0] - px, c[1] - py);
    d += ` L${f3(px - ua[0] * rr)},${f3(py - ua[1] * rr)} Q${f3(px)},${f3(py)} ${f3(px + uc[0] * rr)},${f3(py + uc[1] * rr)}`;
  }
  const e = at(P, P.length - 1);
  return d + ` L${f3(e[0])},${f3(e[1])}`;
}

export function formula(s: string): string {
  const parts = s.split(/(\{#[^|}]*\|)/);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    const seg = at(parts, i);
    out += i % 2 === 1 ? seg : seg.replace(/([A-Za-z)\]])(\d+)/g, '$1_{$2}');
  }
  return out;
}

function restoreAsterisks(t: SVGTextElement): void {
  const walker = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
  let c = walker.nextNode();
  while (c !== null) {
    c.nodeValue = (c.nodeValue ?? '').replaceAll('\uE000', '*');
    c = walker.nextNode();
  }
}

function numAttr(e: Element, name: string): number {
  const v = Number(e.getAttribute(name));
  return Number.isNaN(v) ? 0 : v;
}

function stackScripts(t: SVGTextElement): void {
  const ts = Array.from(t.querySelectorAll('tspan'));
  for (let k = 0; k + 1 < ts.length; k++) {
    const A = at(ts, k);
    const B = at(ts, k + 1);
    if (!A.hasAttribute('font-size') || !B.hasAttribute('font-size') || B.hasAttribute('x')) continue;
    if (A.textContent === '' || B.textContent === '') continue;
    if (Math.abs(A.getStartPositionOfChar(0).y - B.getStartPositionOfChar(0).y) < 0.3) continue;
    const la = A.getComputedTextLength();
    const lb = B.getComputedTextLength();
    B.setAttribute('dx', String(f3(-la)));
    const N = ts[k + 2];
    if (N !== undefined && !N.hasAttribute('x') && la > lb) N.setAttribute('dx', String(f3(la - lb + numAttr(N, 'dx'))));
    k++;
  }
}

function alignVertically(t: SVGTextElement, va: string, y: number): void {
  const b = t.getBBox();
  let dy = 0;
  if (va === 'middle') dy = y - (b.y + b.height / 2);
  else if (va === 'top') dy = y - b.y;
  else if (va === 'bottom') dy = y - (b.y + b.height);
  t.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
}

export function chemText(p: Parent, x: number, y: number, str: string, o: ChemTextOpts = {}): SVGTextElement {
  let s = str.replaceAll('\\*', '\uE000');
  if (o.formula === true) s = formula(s);
  const t = text(p, x, y, s, { ...o, valign: 'baseline', rotate: 0 });
  restoreAsterisks(t);
  if (/ {2}/.test(s)) {
    t.style.whiteSpace = 'pre';
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
  if (o.stack !== false) stackScripts(t);
  const va = o.valign ?? 'baseline';
  if (va !== 'baseline') alignVertically(t, va, y);
  if (o.rotate !== undefined && o.rotate !== 0) {
    t.setAttribute('transform', `rotate(${o.rotate} ${x} ${y}) ${t.getAttribute('transform') ?? ''}`);
    t.setAttribute('data-rotate', String(o.rotate));
  }
  return t;
}

export function measure(p: Parent, s: string, size: number, weight?: string | number): number {
  const t = text(p, 0, 0, s, { size, weight });
  const w = t.getBBox().width;
  t.remove();
  return w;
}

export function pointAt(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function sign1(v: number): number {
  const s = Math.sign(v);
  return s === 0 || Number.isNaN(s) ? 1 : s;
}
