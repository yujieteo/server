// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js
import type { Figure, Manifest, ManifestImage, ManifestStroke, ManifestText } from './types.ts';
import { STYLE } from './style.ts';
import { bboxRoot, ctm } from './core-dom.ts';

function scaleOf(inv: DOMMatrix, e: Element): number {
  const m = inv.multiply(ctm(e));
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

function numAttr(e: Element, name: string): number {
  const v = Number(e.getAttribute(name));
  return Number.isNaN(v) ? 0 : v;
}

function manifestText(F: Figure, inv: DOMMatrix, t: SVGTextElement): ManifestText {
  const b = bboxRoot(F, t);
  const s = scaleOf(inv, t);
  const sizes = [parseFloat(t.getAttribute('font-size') ?? '') * s];
  for (const ts of t.querySelectorAll('tspan[font-size]')) sizes.push(parseFloat(ts.getAttribute('font-size') ?? '') * s);
  const out: ManifestText = {
    s: t.textContent.replace(/\u200b/g, ''),
    role: t.getAttribute('data-role') ?? 'label',
    box: b,
    size: sizes[0] ?? NaN,
    minSize: Math.min(...sizes),
    family: t.getAttribute('font-family'),
    color: t.getAttribute('fill'),
    halo: t.hasAttribute('paint-order'),
    rotate: numAttr(t, 'data-rotate'),
    italic: t.getAttribute('font-style') === 'italic' || t.querySelector('tspan[font-style=italic]') !== null,
    weight: t.getAttribute('font-weight') ?? 'normal',
  };
  if (F.format === 'patent') {
    const lead = t.closest('[data-leads]');
    out.leads = lead === null ? null : Number(lead.getAttribute('data-leads'));
    out.under = t.closest('[data-under]') !== null;
  }
  return out;
}

function manifestStrokes(F: Figure, inv: DOMMatrix): ManifestStroke[] {
  const strokes: ManifestStroke[] = [];
  for (const e of F.svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse')) {
    const sw = e.getAttribute('stroke-width');
    const st = e.getAttribute('stroke');
    if (st === null || st === '' || st === 'none' || sw === null || sw === '') continue;
    if (e.closest('defs,mask,clipPath,pattern,marker') !== null) continue;
    strokes.push({
      w: parseFloat(sw) * scaleOf(inv, e),
      tag: e.tagName,
      part: e.closest('[data-part]')?.getAttribute('data-part') ?? '',
    });
  }
  return strokes;
}

function manifestImages(F: Figure): ManifestImage[] {
  const images: ManifestImage[] = [];
  for (const im of F.svg.querySelectorAll('image')) {
    images.push({
      href: (im.getAttribute('href') ?? '').slice(0, 80),
      box: bboxRoot(F, im),
      px: [numAttr(im, 'data-pxw'), numAttr(im, 'data-pxh')],
    });
  }
  return images;
}

export function manifest(F: Figure): Manifest {
  const inv = ctm(F.svg).inverse();
  const texts: ManifestText[] = [];
  for (const t of F.svg.querySelectorAll('text')) texts.push(manifestText(F, inv, t));
  const out: Manifest = {
    name: F.name, mode: F.mode, format: F.format, widthMM: F.widthMM, heightMM: F.heightMM, W: F.W, H: F.H,
    texts, strokes: manifestStrokes(F, inv), images: manifestImages(F),
    anchors: F.anchors, relations: F.relations, drawn: F.drawn, panels: [],
  };
  if (F.format === 'patent') {
    out.patent = { sheet: F.sheet, sight: F.sight, numeralsDoc: F.numeralsDoc ?? null, forced: { ...STYLE.patentForced } };
  }
  for (const p of F.panels) out.panels.push({ label: p.label, x: p.x, y: p.y, w: p.w, h: p.h });
  return out;
}
