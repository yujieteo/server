// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js
import { asArray, asBool, asNumber, asRecord, asString, field, optString } from './guards.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextItem {
  s: string;
  role: string;
  box: Box;
  size: number;
  minSize: number;
  family: string | null;
  color: string | null;
  halo: boolean;
  rotate: number;
  italic: boolean;
  weight: string;
  leads: number | null;
  under: boolean;
}

export interface StrokeItem {
  w: number;
  tag: string;
  part: string;
}

export interface ImageItem {
  href: string;
  box: Box;
  px: [number, number];
}

export interface Relation {
  from: string;
  to: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface PanelItem extends Box {
  label: string | null;
}

export interface PatentInfo {
  sight: Box;
  numeralsDoc: string | null;
  forced: { stroke: number; fill: number; text: number; opacity: number; width: number };
}

export interface Manifest {
  name: string;
  mode: string | null;
  format: string | null;
  widthMM: number;
  heightMM: number;
  W: number;
  H: number;
  texts: TextItem[];
  strokes: StrokeItem[];
  images: ImageItem[];
  anchors: Record<string, Point>;
  relations: Relation[];
  drawn: Relation[];
  patent: PatentInfo | null;
  panels: PanelItem[];
}

export function parseBox(v: unknown): Box {
  return { x: asNumber(field(v, 'x')), y: asNumber(field(v, 'y')), w: asNumber(field(v, 'w')), h: asNumber(field(v, 'h')) };
}

function parseText(v: unknown): TextItem {
  const leads = field(v, 'leads');
  return {
    s: asString(field(v, 's')), role: asString(field(v, 'role')), box: parseBox(field(v, 'box')),
    size: asNumber(field(v, 'size')), minSize: asNumber(field(v, 'minSize')),
    family: optString(field(v, 'family')), color: optString(field(v, 'color')),
    halo: asBool(field(v, 'halo')), rotate: asNumber(field(v, 'rotate')), italic: asBool(field(v, 'italic')),
    weight: asString(field(v, 'weight')),
    leads: typeof leads === 'number' ? leads : null,
    under: field(v, 'under') === true,
  };
}

function parseImage(v: unknown): ImageItem {
  const px = asArray(field(v, 'px'));
  return { href: asString(field(v, 'href')), box: parseBox(field(v, 'box')), px: [asNumber(px[0]), asNumber(px[1])] };
}

function parseRelation(v: unknown): Relation {
  return { from: asString(field(v, 'from')), to: asString(field(v, 'to')) };
}

function parsePanel(v: unknown): PanelItem {
  return { ...parseBox(v), label: optString(field(v, 'label')) };
}

function parsePatent(v: unknown): PatentInfo {
  const f = field(v, 'forced');
  return {
    sight: parseBox(field(v, 'sight')), numeralsDoc: optString(field(v, 'numeralsDoc')),
    forced: {
      stroke: asNumber(field(f, 'stroke')), fill: asNumber(field(f, 'fill')), text: asNumber(field(f, 'text')),
      opacity: asNumber(field(f, 'opacity')), width: asNumber(field(f, 'width')),
    },
  };
}

function parseAnchors(v: unknown): Record<string, Point> {
  const out: Record<string, Point> = {};
  for (const [k, a] of Object.entries(asRecord(v))) out[k] = { x: asNumber(field(a, 'x')), y: asNumber(field(a, 'y')) };
  return out;
}

function parseStroke(v: unknown): StrokeItem {
  return { w: asNumber(field(v, 'w')), tag: asString(field(v, 'tag')), part: asString(field(v, 'part')) };
}

function parseTexts(v: unknown): TextItem[] {
  const out: TextItem[] = [];
  for (const x of asArray(v)) out.push(parseText(x));
  return out;
}

function parseStrokes(v: unknown): StrokeItem[] {
  const out: StrokeItem[] = [];
  for (const x of asArray(v)) out.push(parseStroke(x));
  return out;
}

function parseImages(v: unknown): ImageItem[] {
  const out: ImageItem[] = [];
  for (const x of asArray(v)) out.push(parseImage(x));
  return out;
}

function parseRelations(v: unknown): Relation[] {
  const out: Relation[] = [];
  for (const x of asArray(v)) out.push(parseRelation(x));
  return out;
}

function parsePanels(v: unknown): PanelItem[] {
  const out: PanelItem[] = [];
  for (const x of asArray(v)) out.push(parsePanel(x));
  return out;
}

export function parseManifest(v: unknown): Manifest {
  const patent = field(v, 'patent');
  return {
    name: asString(field(v, 'name')), mode: optString(field(v, 'mode')), format: optString(field(v, 'format')),
    widthMM: asNumber(field(v, 'widthMM')), heightMM: asNumber(field(v, 'heightMM')),
    W: asNumber(field(v, 'W')), H: asNumber(field(v, 'H')),
    texts: parseTexts(field(v, 'texts')), strokes: parseStrokes(field(v, 'strokes')),
    images: parseImages(field(v, 'images')), anchors: parseAnchors(field(v, 'anchors')),
    relations: parseRelations(field(v, 'relations')), drawn: parseRelations(field(v, 'drawn')),
    patent: patent === undefined ? null : parsePatent(patent),
    panels: parsePanels(field(v, 'panels')),
  };
}
