// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/style.js
import type { HouseStyle, PaletteKey, Paint, PatentSheet } from './types.ts';
import { at } from './util.ts';

export const STYLE: HouseStyle = {
  widthsMM: { single: 89, onehalf: 120, onehalfWide: 136, double: 183 },
  maxHeightMM: 247,
  font: {
    family: 'Arial, Helvetica, sans-serif',
    math: 'Cambria, "Times New Roman", serif',
    latex: "'Latin Modern Roman', 'Latin Modern Math', serif",
  },
  text: { panel: 8, title: 7, label: 6, small: 5, tick: 5, min: 5, max: 8 },
  line: { hair: 0.25, thin: 0.4, normal: 0.6, bold: 1.0, min: 0.25 },
  arrow: { head: 3.2, headWide: 2.4 },
  color: {
    text: '#1a1a1a',
    ink: '#2b2b2b',
    mid: '#7a7a7a',
    light: '#bdbdbd',
    faint: '#e9e9e9',
    paper: '#ffffff',
    blue: '#0072B2',
    sky: '#56B4E9',
    green: '#009E73',
    yellow: '#F0E442',
    orange: '#E69F00',
    vermillion: '#D55E00',
    purple: '#CC79A7',
    beam: '#E8322B',
    beamIR: '#B5172A',
    beamGreen: '#2FAE4A',
    beamBlue: '#2F6BE0',
    glass: '#CFE6F3',
    metal: '#B8BEC6',
    silicon: '#8E9AAF',
    substrate: '#E5E1D8',
    gold: '#D9A441',
    tintBlue: '#EAF2FA',
    tintOrange: '#FDF1E3',
    tintGreen: '#E8F5EF',
    tintGrey: '#F3F3F3',
  },
  gap: { panel: 4, inner: 2 },
  illustrate: false,
  format: 'journal',
  patentForced: { stroke: 0, fill: 0, text: 0, opacity: 0, width: 0 },
};

export interface Palettes {
  default: string[];
  cool: string[];
  warm: string[];
  diverging: string[];
  viridis: string[];
}

export const PALETTES: Palettes = {
  default: ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9'],
  cool: ['#1F4E79', '#2E86C1', '#5DADE2', '#A9CCE3'],
  warm: ['#7B241C', '#C0392B', '#E67E22', '#F5B041'],
  diverging: ['#2166AC', '#67A9CF', '#D1E5F0', '#F7F7F7', '#FDDBC7', '#EF8A62', '#B2182B'],
  viridis: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'],
};

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(c: readonly number[]): string {
  let out = '#';
  for (const v of c) out += Math.round(v).toString(16).padStart(2, '0');
  return out;
}

export function ramp(stops: readonly string[], t0: number): string {
  const t = Math.min(1, Math.max(0, t0));
  const n = stops.length - 1;
  const i = Math.min(n - 1, Math.floor(t * n));
  const f = t * n - i;
  const a = rgb(at(stops, i));
  const b = rgb(at(stops, i + 1));
  return toHex([
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ]);
}

export function shade(hex: string, amt: number): string {
  if (STYLE.format === 'patent') return hex;
  const c = rgb(hex);
  const tgt = amt >= 0 ? 255 : 0;
  const a = Math.abs(amt);
  return toHex([c[0] + (tgt - c[0]) * a, c[1] + (tgt - c[1]) * a, c[2] + (tgt - c[2]) * a]);
}

export interface PatentProfile {
  sheets: Record<PatentSheet, [number, number]>;
  margin: { top: number; left: number; right: number; bottom: number };
  capHeight: number;
  minCharMM: number;
  text: { numeral: number; legend: number; fig: number; sheet: number };
  line: { hair: number; thin: number; normal: number; bold: number; min: number };
  floor: number;
  arrow: { head: number; headWide: number };
  hatch: { spacing: number; angle: number; width: number };
}

export const PATENT: PatentProfile = {
  sheets: { letter: [215.9, 279.4], a4: [210, 297] },
  margin: { top: 25, left: 25, right: 15, bottom: 10 },
  capHeight: 0.716,
  minCharMM: 3.2,
  text: { numeral: 14, legend: 14, fig: 22, sheet: 16 },
  line: { hair: 0.5, thin: 0.6, normal: 0.9, bold: 1.3, min: 0.35 },
  floor: 0.3,
  arrow: { head: 6, headWide: 2.4 },
  hatch: { spacing: 5.5, angle: 45, width: 0.5 },
};

const PATENT_WHITE = /^(paper|faint|light|glass|metal|silicon|substrate|gold|tint)/;

const PALETTE_KEYS: readonly PaletteKey[] = [
  'text', 'ink', 'mid', 'light', 'faint', 'paper', 'blue', 'sky', 'green', 'yellow', 'orange',
  'vermillion', 'purple', 'beam', 'beamIR', 'beamGreen', 'beamBlue', 'glass', 'metal', 'silicon',
  'substrate', 'gold', 'tintBlue', 'tintOrange', 'tintGreen', 'tintGrey',
];

export function usePatentProfile(): HouseStyle {
  STYLE.format = 'patent';
  STYLE.illustrate = false;
  const t = PATENT.text;
  Object.assign(STYLE.text, {
    panel: t.fig, title: t.legend, label: t.numeral, small: t.numeral,
    tick: t.numeral, min: t.numeral, max: t.fig,
  });
  Object.assign(STYLE.line, PATENT.line);
  Object.assign(STYLE.arrow, PATENT.arrow);
  for (const k of PALETTE_KEYS) STYLE.color[k] = PATENT_WHITE.test(k) ? '#ffffff' : '#000000';
  return STYLE;
}

const LUM_WEIGHTS: readonly number[] = [0.2126, 0.7152, 0.0722];

export function colourLum(c: unknown): number | null {
  if (typeof c !== 'string') return null;
  const s = c.trim().toLowerCase();
  if (s === 'white') return 1;
  if (s === 'black') return 0;
  const short = /^#([0-9a-f]{3})$/.exec(s);
  if (short?.[1] !== undefined) {
    let a = 0;
    for (let i = 0; i < 3; i++) {
      const h = short[1].charAt(i);
      a = a + (at(LUM_WEIGHTS, i) * parseInt(h + h, 16)) / 255;
    }
    return a;
  }
  const long = /^#([0-9a-f]{6})$/.exec(s);
  if (long?.[1] !== undefined) {
    let a = 0;
    for (let i = 0; i < 3; i++) {
      a = a + (at(LUM_WEIGHTS, i) * parseInt(long[1].slice(i * 2, i * 2 + 2), 16)) / 255;
    }
    return a;
  }
  const fn = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(s);
  if (fn?.[1] !== undefined && fn[2] !== undefined && fn[3] !== undefined) {
    return (0.2126 * Number(fn[1]) + 0.7152 * Number(fn[2]) + 0.0722 * Number(fn[3])) / 255;
  }
  return null;
}

const PLAIN_FILLS: ReadonlySet<string> = new Set(['#000', '#000000', '#fff', '#ffffff', 'white', 'black']);

function patentStroke(o: Paint): void {
  const n = STYLE.patentForced;
  if (o.stroke === undefined || o.stroke === 'none') return;
  const l = colourLum(o.stroke);
  const to = l !== null && l > 0.85 ? '#ffffff' : '#000000';
  if (o.stroke.toLowerCase() !== to && o.stroke !== '#fff' && o.stroke !== '#000') n.stroke++;
  o.stroke = to;
  const w = o.width ?? STYLE.line.normal;
  if (w < STYLE.line.min) {
    o.width = STYLE.line.min;
    n.width++;
  }
}

function patentFill(o: Paint): void {
  const n = STYLE.patentForced;
  if (o.fill === undefined || o.fill === 'none') return;
  const faint =
    (o.fillOpacity !== undefined && o.fillOpacity < 0.5) ||
    (o.opacity !== undefined && o.opacity < 0.5);
  if (faint) {
    o.fill = 'none';
    n.fill++;
    return;
  }
  const l = colourLum(o.fill);
  const to = l === null ? '#ffffff' : l < 0.3 ? '#000000' : '#ffffff';
  if (!PLAIN_FILLS.has(o.fill.toLowerCase())) n.fill++;
  o.fill = to;
}

export function patentPaint(s: Paint): Paint {
  const o: Paint = { ...s };
  patentStroke(o);
  patentFill(o);
  const n = STYLE.patentForced;
  if (o.opacity !== undefined) n.opacity++;
  if (o.fillOpacity !== undefined) n.opacity++;
  if (o.strokeOpacity !== undefined) n.opacity++;
  if (o.filter !== undefined) n.opacity++;
  if (o.blend !== undefined) n.opacity++;
  o.opacity = undefined;
  o.fillOpacity = undefined;
  o.strokeOpacity = undefined;
  o.filter = undefined;
  o.blend = undefined;
  return o;
}
