// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js
import type {
  Anchor, Figure, FigureOpts, GroupOpts, Handle, HouseStyle, Panel, PanelOpts, Parent, PatentSheet, Rect, Relation,
} from './types.ts';
import { PATENT, STYLE, usePatentProfile } from './style.ts';
import { NS, el, mm, toRoot } from './core-dom.ts';
import { text } from './core-text.ts';

interface FigureParts {
  svg: SVGSVGElement;
  defs: SVGDefsElement;
  root: SVGGElement;
  W: number;
  H: number;
  width: number;
  height: number;
  name: string;
  mode: string;
  format: 'journal' | 'patent';
}

class FigureImpl implements Figure {
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
  anchors: Record<string, Anchor> = {};
  relations: Relation[] = [];
  drawn: Relation[] = [];
  panels: Panel[] = [];
  uidCount = 0;
  style: HouseStyle = STYLE;
  sightMM: Rect | undefined = undefined;
  sight: Rect | undefined = undefined;
  drawing: Handle | undefined = undefined;
  sheet: string | undefined = undefined;
  numeralsDoc: string | undefined = undefined;

  constructor(p: FigureParts) {
    this.svg = p.svg;
    this.defs = p.defs;
    this.root = p.root;
    this.node = p.root;
    this.W = p.W;
    this.H = p.H;
    this.widthMM = p.width;
    this.heightMM = p.height;
    this.name = p.name;
    this.mode = p.mode;
    this.format = p.format;
  }

  uid(prefix: string = 'id'): string {
    this.uidCount += 1;
    return `${prefix}${this.uidCount}`;
  }

  anchor(name: string, e: Parent, x: number, y: number, dir?: string): Anchor {
    const [X, Y] = toRoot(this, e, x, y);
    const a: Anchor = { x: X, y: Y, dir };
    this.anchors[name] = a;
    return a;
  }

  at(name: string): Anchor {
    const a = this.anchors[name];
    if (a === undefined) throw new Error(`unknown anchor "${name}"`);
    return a;
  }

  relate(from: string, to: string, kind: string = 'flow'): void {
    this.relations.push({ from, to, kind });
  }

  drew(from: string, to: string, kind: string = 'flow'): void {
    this.drawn.push({ from, to, kind });
  }

  panel(label: string, o: PanelOpts): Panel {
    const labelSize = o.labelSize ?? STYLE.text.panel;
    const g = el(this.root, 'g', { transform: `translate(${mm(o.x)} ${mm(o.y)})`, 'data-panel': label });
    const P: Panel = { node: g, label, x: mm(o.x), y: mm(o.y), w: mm(o.w), h: mm(o.h) };
    if (label !== '') {
      const shown = `${o.labelPrefix ?? ''}${label}${o.labelSuffix ?? ''}`;
      text(g, o.labelDx ?? 0, labelSize * 0.95 + (o.labelDy ?? 0), shown, {
        size: labelSize,
        weight: o.labelWeight ?? 'bold',
        role: 'panel',
      });
    }
    this.panels.push(P);
    return P;
  }
}

function addSight(F: FigureImpl, width: number, height: number, sheet: PatentSheet, o: FigureOpts): void {
  const m = PATENT.margin;
  const sMM: Rect = { x: m.left, y: m.top, w: width - m.left - m.right, h: height - m.top - m.bottom };
  F.sightMM = sMM;
  F.sight = { x: mm(sMM.x), y: mm(sMM.y), w: mm(sMM.w), h: mm(sMM.h) };
  F.drawing = {
    node: el(F.root, 'g', { transform: `translate(${F.sight.x.toFixed(3)} ${F.sight.y.toFixed(3)})`, 'data-part': 'sight' }),
  };
  F.sheet = sheet;
  F.numeralsDoc = o.numerals;
  if (o.sheetId !== undefined && o.sheetId !== '') {
    text(F.root, F.sight.x + F.sight.w / 2, F.sight.y + PATENT.text.sheet * PATENT.capHeight, o.sheetId, {
      size: PATENT.text.sheet,
      anchor: 'middle',
      role: 'sheet',
    });
  }
}

export function createFigure(host: Parent, o: FigureOpts = {}): Figure {
  let width = o.width ?? 89;
  let height = o.height ?? 60;
  let background = o.background ?? '#fff';
  const format = o.format ?? 'journal';
  const sheet = o.sheet ?? 'letter';
  if (o.illustrate !== undefined) STYLE.illustrate = o.illustrate;
  if (format === 'patent') {
    usePatentProfile();
    [width, height] = PATENT.sheets[sheet];
    background = '#fff';
  }
  const W = mm(width);
  const H = mm(height);
  const name = o.name ?? 'figure';
  const svg = el(host, 'svg', {
    xmlns: NS, 'xmlns:xlink': 'http://www.w3.org/1999/xlink', width: `${width}mm`, height: `${height}mm`,
    viewBox: `0 0 ${W.toFixed(3)} ${H.toFixed(3)}`, 'data-name': name,
  });
  const defs = el(svg, 'defs');
  if (background !== '') el(svg, 'rect', { x: 0, y: 0, width: W, height: H, fill: background, 'data-role': 'background' });
  const root = el(svg, 'g', { id: 'root' });
  const F = new FigureImpl({ svg, defs, root, W, H, width, height, name, mode: o.mode ?? 'design', format });
  if (format === 'patent') addSight(F, width, height, sheet, o);
  return F;
}

export function group(parent: Parent, o: GroupOpts = {}): Handle {
  const tr: string[] = [];
  if ((o.x ?? 0) !== 0 || (o.y ?? 0) !== 0) tr.push(`translate(${o.x ?? 0} ${o.y ?? 0})`);
  if ((o.rotate ?? 0) !== 0) tr.push(`rotate(${o.rotate})`);
  if ((o.scale ?? 0) !== 0) tr.push(`scale(${o.scale})`);
  if (o.matrix !== undefined) tr.push(`matrix(${o.matrix.join(' ')})`);
  const joined = tr.join(' ');
  const g = el(parent, 'g', {
    transform: joined === '' ? undefined : joined,
    id: o.id,
    'data-part': o.part,
    'clip-path': o.clip,
    opacity: o.opacity,
  });
  return { node: g };
}
