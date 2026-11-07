// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js

export type Point = readonly [number, number];
export type AttrValue = string | number | undefined | null;
export type Attrs = Record<string, AttrValue>;
export type Loose<T> = { [K in keyof T]?: T[K] | undefined };
export type Dash = string | readonly number[];

export interface Handle {
  node: Element;
}
export type Parent = Element | Handle;

export type Paint = Loose<{
  fill: string;
  stroke: string;
  width: number;
  cap: string;
  join: string;
  dash: Dash;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  filter: string;
  blend: string;
  part: string;
  r: number;
}>;

export interface TextRun {
  br: false;
  t: string;
  it: boolean;
  bd: boolean;
  shift: -1 | 0 | 1;
  color?: string | undefined;
}
export interface BreakRun {
  br: true;
}
export type Run = TextRun | BreakRun;

export type UnderlineOpts = Loose<{ offset: number; width: number; color: string; extend: number }>;

export type TextOpts = Loose<{
  size: number;
  weight: string | number;
  anchor: 'start' | 'middle' | 'end';
  valign: 'baseline' | 'middle' | 'top' | 'bottom';
  color: string;
  lineGap: number;
  role: string;
  family: string;
  math: boolean;
  italic: boolean;
  letterSpacing: number | string;
  rotate: number;
  halo: boolean | string;
  haloWidth: number;
  underline: boolean | UnderlineOpts;
}>;

export interface Anchor {
  x: number;
  y: number;
  dir: string | undefined;
}
export interface Relation {
  from: string;
  to: string;
  kind: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Panel extends Handle {
  node: SVGGElement;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PanelOpts = { x: number; y: number; w: number; h: number } & Loose<{
  labelDx: number;
  labelDy: number;
  labelSize: number;
  labelWeight: string | number;
  labelPrefix: string;
  labelSuffix: string;
}>;

export type IllustrateValue = boolean | number | string | readonly number[] | undefined;
export type IllustrateSetting = boolean | Record<string, IllustrateValue>;

export interface FontStyle {
  family: string;
  math: string;
  latex: string;
}
export interface TextSizes {
  panel: number;
  title: number;
  label: number;
  small: number;
  tick: number;
  min: number;
  max: number;
}
export interface LineWidths {
  hair: number;
  thin: number;
  normal: number;
  bold: number;
  min: number;
}
export interface ArrowSizes {
  head: number;
  headWide: number;
}
export interface Palette {
  text: string;
  ink: string;
  mid: string;
  light: string;
  faint: string;
  paper: string;
  blue: string;
  sky: string;
  green: string;
  yellow: string;
  orange: string;
  vermillion: string;
  purple: string;
  beam: string;
  beamIR: string;
  beamGreen: string;
  beamBlue: string;
  glass: string;
  metal: string;
  silicon: string;
  substrate: string;
  gold: string;
  tintBlue: string;
  tintOrange: string;
  tintGreen: string;
  tintGrey: string;
}
export type PaletteKey = keyof Palette;

export interface PatentForced {
  stroke: number;
  fill: number;
  text: number;
  opacity: number;
  width: number;
}

export interface HouseStyle {
  widthsMM: { single: number; onehalf: number; onehalfWide: number; double: number };
  maxHeightMM: number;
  font: FontStyle;
  text: TextSizes;
  line: LineWidths;
  arrow: ArrowSizes;
  color: Palette;
  gap: { panel: number; inner: number };
  illustrate: IllustrateSetting;
  format: 'journal' | 'patent';
  patentForced: PatentForced;
}

export type PatentSheet = 'letter' | 'a4';

export interface FigureOpts {
  width?: number | undefined;
  height?: number | undefined;
  background?: string | undefined;
  name?: string | undefined;
  mode?: string | undefined;
  format?: 'journal' | 'patent' | undefined;
  illustrate?: IllustrateSetting | undefined;
  sheet?: PatentSheet | undefined;
  sheetId?: string | undefined;
  numerals?: string | undefined;
}

export interface Figure {
  svg: SVGSVGElement;
  defs: SVGDefsElement;
  root: SVGGElement;
  node: SVGGElement;
  W: number;
  H: number;
  widthMM: number;
  heightMM: number;
  name: string;
  mode: string;
  format: 'journal' | 'patent';
  anchors: Record<string, Anchor>;
  relations: Relation[];
  drawn: Relation[];
  panels: Panel[];
  style: HouseStyle;
  sightMM: Rect | undefined;
  sight: Rect | undefined;
  drawing: Handle | undefined;
  sheet: string | undefined;
  numeralsDoc: string | undefined;
  uid(prefix?: string): string;
  anchor(name: string, e: Parent, x: number, y: number, dir?: string): Anchor;
  at(name: string): Anchor;
  relate(from: string, to: string, kind?: string): void;
  drew(from: string, to: string, kind?: string): void;
  panel(label: string, o: PanelOpts): Panel;
}

export interface GroupOpts {
  x?: number | undefined;
  y?: number | undefined;
  rotate?: number | undefined;
  scale?: number | undefined;
  matrix?: readonly number[] | undefined;
  id?: string | undefined;
  part?: string | undefined;
  clip?: string | undefined;
  opacity?: number | undefined;
}

export interface ManifestText {
  s: string;
  role: string;
  box: Rect;
  size: number;
  minSize: number;
  family: string | null;
  color: string | null;
  halo: boolean;
  rotate: number;
  italic: boolean;
  weight: string;
  leads?: number | null;
  under?: boolean;
}
export interface ManifestStroke {
  w: number;
  tag: string;
  part: string;
}
export interface ManifestImage {
  href: string;
  box: Rect;
  px: [number, number];
}
export interface Manifest {
  name: string;
  mode: string;
  format: string;
  widthMM: number;
  heightMM: number;
  W: number;
  H: number;
  texts: ManifestText[];
  strokes: ManifestStroke[];
  images: ManifestImage[];
  anchors: Record<string, Anchor>;
  relations: Relation[];
  drawn: Relation[];
  patent?: {
    sheet: string | undefined;
    sight: Rect | undefined;
    numeralsDoc: string | null;
    forced: PatentForced;
  };
  panels: { label: string; x: number; y: number; w: number; h: number }[];
}

export type ArrowOpts = Paint &
  Loose<{
    F: Figure;
    layer: Parent;
    bend: number;
    via: readonly Point[];
    radius: number;
    head: number;
    headWidth: number;
    notch: number;
    both: boolean;
    gap0: number;
    gap1: number;
    noHead: boolean;
    headStyle: 'open' | 'filled';
    kind: string;
    label: string;
    labelAt: number;
    labelOffset: number;
    labelSize: number;
    labelColor: string;
  }>;

export type CurveSpec =
  | { kind: 'expDecay'; offset: number; amp: number; tau: number }
  | { kind: 'line'; offset: number; slope: number }
  | { kind: 'gauss'; offset: number; amp: number; centre: number; sigma: number };

export type GradientStop = readonly [number, string, (number | undefined)?];

export interface IsoProj {
  c: number;
  s: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface Scale {
  base: number;
  sign: 1 | -1;
  lo: number;
  range: number;
  size: number;
}

export type Ports = Record<string, Point>;
