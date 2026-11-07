// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js
import type { Parent, TextOpts, TextRun, UnderlineOpts } from './types.ts';
import { STYLE } from './style.ts';
import { el } from './core-dom.ts';
import { parseRich } from './core-rich.ts';

const underlines: WeakMap<SVGTextElement, SVGLineElement> = new WeakMap();

export function underlineOf(t: SVGTextElement): SVGLineElement | undefined {
  return underlines.get(t);
}

function patentText(c: string | undefined): string {
  if (c === undefined || c === '#000000') return '#000000';
  const w = /^(#fff|#ffffff|white)$/i.test(c);
  STYLE.patentForced.text += w ? 0 : 1;
  return w ? '#ffffff' : '#000000';
}

function setNum(e: Element, k: string, v: number): void {
  e.setAttribute(k, String(v));
}

function splitLines(str: string): TextRun[][] {
  const lines: TextRun[][] = [[]];
  for (const r of parseRich(str)) {
    if (r.br) lines.push([]);
    else lines[lines.length - 1]?.push(r);
  }
  return lines;
}

function layoutLine(t: SVGTextElement, runs: TextRun[], li: number, x: number, size: number, lh: number): void {
  let cur = 0;
  let first = true;
  for (const r of runs) {
    const ts = el(t, 'tspan', {}, r.t);
    if (first) {
      setNum(ts, 'x', x);
      if (li > 0) setNum(ts, 'dy', lh);
    }
    const want = r.shift === -1 ? size * 0.28 : r.shift === 1 ? -size * 0.38 : 0;
    const dy = want - cur;
    if (dy !== 0) setNum(ts, 'dy', (first && li > 0 ? lh : 0) + dy);
    cur = want;
    if (r.shift !== 0) setNum(ts, 'font-size', size * 0.72);
    if (r.it) ts.setAttribute('font-style', 'italic');
    if (r.bd) ts.setAttribute('font-weight', 'bold');
    if (r.color !== undefined && r.color !== '' && STYLE.format !== 'patent') ts.setAttribute('fill', r.color);
    first = false;
  }
  if (runs.length === 0 && li > 0) el(t, 'tspan', { x, dy: lh }, ' ');
  if (cur !== 0) el(t, 'tspan', { dy: -cur }, '\u200b');
}

function valign(t: SVGTextElement, y: number, va: string): void {
  if (va === 'baseline') return;
  const b = t.getBBox();
  let dy = 0;
  if (va === 'middle') dy = y - (b.y + b.height / 2);
  else if (va === 'top') dy = y - b.y;
  else if (va === 'bottom') dy = y - (b.y + b.height);
  t.setAttribute('transform', `translate(0 ${dy.toFixed(3)})`);
}

function underline(parent: Parent, t: SVGTextElement, o: TextOpts, y: number, nLines: number, lh: number, size: number): void {
  const u: UnderlineOpts = o.underline === true || o.underline === undefined || o.underline === false ? {} : o.underline;
  const b = t.getBBox();
  const yb = y + lh * (nLines - 1) + (u.offset ?? size * 0.16);
  const ext = u.extend ?? 0;
  const tr = t.getAttribute('transform');
  const line = el(parent, 'line', {
    x1: +(b.x - ext).toFixed(3),
    y1: +yb.toFixed(3),
    x2: +(b.x + b.width + ext).toFixed(3),
    y2: +yb.toFixed(3),
    stroke: STYLE.format === 'patent' ? '#000000' : (u.color ?? o.color ?? STYLE.color.text),
    'stroke-width': u.width ?? Math.max(STYLE.line.min, size * 0.07),
    'stroke-linecap': 'butt',
    transform: tr === null || tr === '' ? undefined : tr,
    'data-part': 'underline',
  });
  underlines.set(t, line);
}

function decorate(t: SVGTextElement, o: TextOpts, x: number, y: number, size: number): void {
  const rot = o.rotate ?? 0;
  if (rot !== 0) {
    const prev = t.getAttribute('transform') ?? '';
    t.setAttribute('transform', `rotate(${rot} ${x} ${y}) ${prev}`);
    setNum(t, 'data-rotate', rot);
  }
  if (o.italic === undefined && o.math === true) t.setAttribute('font-style', 'italic');
  if (o.halo !== undefined && o.halo !== false && o.halo !== '') {
    t.setAttribute('paint-order', 'stroke');
    t.setAttribute('stroke', o.halo === true ? '#fff' : o.halo);
    setNum(t, 'stroke-width', o.haloWidth ?? size * 0.35);
    t.setAttribute('stroke-linejoin', 'round');
  }
}

export function text(parent: Parent, x: number, y: number, str: string | number, o: TextOpts = {}): SVGTextElement {
  const size = o.size ?? STYLE.text.label;
  const t = el(parent, 'text', {
    x,
    y,
    'font-family': o.family ?? (o.math === true ? STYLE.font.math : STYLE.font.family),
    'font-size': size,
    'font-weight': o.weight ?? 'normal',
    fill: STYLE.format === 'patent' ? patentText(o.color) : (o.color ?? STYLE.color.text),
    'text-anchor': o.anchor ?? 'start',
    'data-role': o.role ?? 'label',
  });
  if (o.italic === true) t.setAttribute('font-style', 'italic');
  const ls = o.letterSpacing;
  if (ls !== undefined && ls !== 0 && ls !== '') t.setAttribute('letter-spacing', String(ls));
  const lines = splitLines(String(str));
  const lh = size * (o.lineGap ?? 1.18);
  for (let li = 0; li < lines.length; li++) layoutLine(t, lines[li] ?? [], li, x, size, lh);
  valign(t, y, o.valign ?? 'baseline');
  decorate(t, o, x, y, size);
  if (o.underline !== undefined && o.underline !== false) underline(parent, t, o, y, lines.length, lh, size);
  return t;
}
