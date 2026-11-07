// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/ind.js
import type { Figure, GradientStop, Loose, Parent } from './types.ts';
import { STYLE } from './style.ts';
import { blur, circle, ellipse, line, path, radialGradient, rect } from './draw.ts';
import { f3 } from './util.ts';
import { INK, PAPER, reg, userGradient, wrap } from './ind-base.ts';
import type { Part } from './ind-base.ts';

export type BulbOpts = Loose<{
  r: number; style: 'shaded' | 'line'; lit: boolean; glow: boolean; glass: string; stroke: string; width: number; rot: number;
  part: string; F: Figure; name: string;
}>;

interface Bulb {
  g: SVGGElement;
  cx: number;
  cy: number;
  r: number;
  neckY: number;
  bw: number;
  bh: number;
  fy: number;
  globe: string;
  coil: string;
  lit: boolean;
  stroke: string;
  sw: number;
}

function lineBulb(b: Bulb, glass: string | undefined): void {
  const { g, cx, cy, r, neckY, bw, bh, fy, globe, coil, stroke, sw } = b;
  if (b.lit) {
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (1.1 + (0.8 * k) / 6);
      line(g, [cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3], [cx + Math.cos(a) * r * 1.65, cy + Math.sin(a) * r * 1.65], { stroke, width: sw, cap: 'round' });
    }
  }
  path(g, globe, { fill: glass ?? PAPER, stroke, width: sw, part: 'bulb-globe' });
  for (const s of [-1, 1]) line(g, [cx + s * r * 0.12, neckY], [cx + s * r * 0.3, fy], { stroke, width: sw * 0.8 });
  path(g, coil, { stroke, width: sw, fill: 'none', part: 'filament' });
  rect(g, cx - bw, neckY, bw * 2, bh, { fill: PAPER, stroke, width: sw, part: 'bulb-base' });
  for (let i = 1; i < 4; i++) line(g, [cx - bw, neckY + (bh * i) / 4], [cx + bw, neckY + (bh * i) / 4], { stroke, width: sw * 0.8 });
  path(g, `M${f3(cx - bw * 0.7)},${f3(neckY + bh)} L${f3(cx - bw * 0.3)},${f3(neckY + bh * 1.25)} L${f3(cx + bw * 0.3)},${f3(neckY + bh * 1.25)} L${f3(cx + bw * 0.7)},${f3(neckY + bh)} Z`, { fill: stroke, part: 'bulb-contact' });
}

const GLASS_LIT: readonly GradientStop[] = [[0, '#ffffff'], [0.5, '#fbf6d0'], [0.85, '#e4e0b8'], [1, '#b9b89a']];
const GLASS_OFF: readonly GradientStop[] = [[0, '#ffffff'], [0.55, '#eef1f4'], [0.9, '#cfd5dc'], [1, '#aab2bb']];
const BASE_METAL: readonly GradientStop[] = [[0, '#6f7275'], [0.35, '#e3e5e7'], [0.6, '#9da1a5'], [1, '#55585c']];

function shadedBulb(b: Bulb, glowOn: boolean): void {
  const { g, cx, cy, r, neckY, bw, bh, fy, globe, coil, lit, sw } = b;
  if (lit && glowOn) circle(g, cx, cy + r * 0.1, r * 1.35, { fill: '#fffbe0', opacity: 0.55, filter: blur(g, r * 0.35), part: 'bulb-glow' });
  path(g, globe, { fill: radialGradient(g, lit ? GLASS_LIT : GLASS_OFF, { cx: 0.4, cy: 0.35, r: 0.7 }), opacity: 0.95, part: 'bulb-globe' });
  path(g, globe, { stroke: lit ? '#a9aa93' : '#9aa3ad', width: sw, fill: 'none', opacity: 0.8 });
  for (const s of [-1, 1]) line(g, [cx + s * r * 0.12, neckY], [cx + s * r * 0.3, fy], { stroke: '#8b8a78', width: Math.max(0.11 * r, STYLE.line.hair) });
  path(g, coil, { stroke: lit ? '#b0851e' : '#7a6a3a', width: Math.max(0.14 * r, STYLE.line.hair), fill: 'none', part: 'filament' });
  ellipse(g, cx - r * 0.35, cy - r * 0.45, r * 0.2, r * 0.32, { fill: PAPER, opacity: 0.8, filter: blur(g, r * 0.12), part: 'bulb-spec' });
  rect(g, cx - bw, neckY, bw * 2, bh, { fill: userGradient(g, [cx - bw, 0], [cx + bw, 0], BASE_METAL), part: 'bulb-base' });
  for (let i = 1; i < 5; i++) line(g, [cx - bw, neckY + (bh * i) / 5], [cx + bw, neckY + (bh * i) / 5 - bh * 0.12], { stroke: '#4d5054', width: Math.max(0.1 * r, STYLE.line.hair), opacity: 0.8 });
  path(g, `M${f3(cx - bw * 0.8)},${f3(neckY + bh)} L${f3(cx - bw * 0.35)},${f3(neckY + bh * 1.28)} L${f3(cx + bw * 0.35)},${f3(neckY + bh * 1.28)} L${f3(cx + bw * 0.8)},${f3(neckY + bh)} Z`, { fill: '#2c2e30', part: 'bulb-contact' });
}

export function bulb(p: Parent, cx: number, cy: number, o: BulbOpts = {}): Part {
  const r = o.r ?? 8;
  const g = wrap(p, o.part ?? 'bulb', o.rot, cx, cy);
  const neckY = cy + r * 1.35;
  const nw = r * 0.42;
  const bw = nw * 1.05;
  const bh = r * 0.95;
  const fy = cy + r * 0.05;
  const globe = `M${f3(cx - nw)},${f3(neckY)} C${f3(cx - nw)},${f3(cy + r * 0.9)} ${f3(cx - r)},${f3(cy + r * 0.55)} ${f3(cx - r)},${f3(cy)} A${f3(r)},${f3(r)} 0 1 1 ${f3(cx + r)},${f3(cy)} C${f3(cx + r)},${f3(cy + r * 0.55)} ${f3(cx + nw)},${f3(cy + r * 0.9)} ${f3(cx + nw)},${f3(neckY)} Z`;
  const coil = `M${f3(cx - r * 0.3)},${f3(fy)} q${f3(r * 0.1)},${f3(-r * 0.2)} ${f3(r * 0.2)},0 t${f3(r * 0.2)},0 t${f3(r * 0.2)},0`;
  const b: Bulb = { g, cx, cy, r, neckY, bw, bh, fy, globe, coil, lit: o.lit !== false, stroke: o.stroke ?? INK, sw: o.width ?? STYLE.line.thin };
  if (o.style === 'line') lineBulb(b, o.glass);
  else shadedBulb(b, o.glow !== false);
  const yb = neckY + bh * 1.26;
  const ports = reg(o.F, o.name, g, { top: [cx, cy - r], base: [cx, yb], left: [cx - bw, neckY + bh * 0.5], right: [cx + bw, neckY + bh * 0.5], center: [cx, cy] });
  return { node: g, ports };
}
