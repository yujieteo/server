import type { LeaderFinding, LeaderResult, StyleProbe, TextBox } from './check-types.ts';
import { hostSvg } from './inpage-common.ts';
import { isRecord } from './guards.ts';

const LEAD = '[data-part="callout"], [data-part="leader"]';
const HIDE = 'defs, clipPath, mask, pattern, marker, symbol, [data-part="callout"], [data-part="leader"]';
const STEP = 0.5, END = 1.5, RUN = 1.2, JIT = 0.8;

interface Cand {
  e: SVGGeometryElement;
  inv: DOMMatrix;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Pt {
  x: number;
  y: number;
  s: number;
}

function illustrateFlag(): boolean {
  const F: unknown = Reflect.get(window, 'schemFigure');
  if (!isRecord(F)) return false;
  const st = F['style'];
  return isRecord(st) && Boolean(st['illustrate']);
}

export function styleProbe(): StyleProbe {
  const parts: string[] = [];
  for (const e of document.querySelectorAll('#host svg [data-part]')) {
    const p = e.getAttribute('data-part');
    if (p !== null && !parts.includes(p)) parts.push(p);
  }
  const own: (string | null)[] = [];
  for (const t of document.querySelectorAll('#host svg text')) {
    const g = t.closest('[data-panel]');
    own.push(g === null ? null : g.getAttribute('data-panel'));
  }
  return { parts, illustrate: illustrateFlag(), own };
}

function opacityOf(e: Element, svg: SVGSVGElement): number {
  let o = 1;
  for (let n: Node | null = e; n !== null && n.nodeType === 1 && n !== svg.parentNode; n = n.parentNode) {
    if (n instanceof Element) o *= parseFloat(getComputedStyle(n).opacity || '1');
  }
  return o;
}

function safeBBox(e: SVGGraphicsElement): DOMRect | null {
  try {
    return e.getBBox();
  } catch {
    return null;
  }
}

function makeCand(e: SVGGeometryElement, svg: SVGSVGElement, rootInv: DOMMatrix): Cand | null {
  if (e.closest(HIDE) !== null) return null;
  const cs = getComputedStyle(e);
  if (cs.fill === 'none' || cs.display === 'none' || cs.visibility === 'hidden') return null;
  if (parseFloat(cs.fillOpacity || '1') * opacityOf(e, svg) < 0.3) return null;
  const b = safeBBox(e);
  if (b === null) return null;
  const M = rootInv.multiply(e.getScreenCTM() ?? new DOMMatrix());
  const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x = 0, y = 0] of pts) {
    const q = new DOMPoint(x, y).matrixTransform(M);
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  if (Math.min(x1 - x0, y1 - y0) < 1.2 || (x1 - x0) * (y1 - y0) < 4) return null;
  return { e, inv: M.inverse(), x0, y0, x1, y1 };
}

function collectCands(svg: SVGSVGElement, rootInv: DOMMatrix): Cand[] {
  const cands: Cand[] = [];
  for (const e of svg.querySelectorAll('rect, circle, ellipse, polygon, path, polyline')) {
    if (!(e instanceof SVGGeometryElement)) continue;
    const c = makeCand(e, svg, rootInv);
    if (c !== null) cands.push(c);
  }
  return cands;
}

function inside(c: Cand, x: number, y: number): boolean {
  return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && c.e.isPointInFill(new DOMPoint(x, y).matrixTransform(c.inv));
}

function panelName(pn: Element): string {
  const v = pn.getAttribute('data-panel');
  return v === null || v === '' ? '?' : v;
}

function nameOf(e: Element): string {
  const p = e.closest('[data-part]');
  const pn = e.closest('[data-panel]');
  const where = pn === null ? '' : ' in panel ' + panelName(pn);
  return (p === null ? e.tagName : p.getAttribute('data-part')) + where;
}

function samplePoints(ln: SVGGeometryElement, M: DOMMatrix, len: number): Pt[] {
  const pts: Pt[] = [];
  for (let s = 0; s <= len; s += STEP) {
    const q = ln.getPointAtLength(s).matrixTransform(M);
    pts.push({ x: q.x, y: q.y, s });
  }
  return pts;
}

function endProbes(a: Pt, z: Pt): number[][] {
  const out: number[][] = [];
  for (const p of [a, z]) {
    for (const [dx = 0, dy = 0] of [[0, 0], [JIT, 0], [-JIT, 0], [0, JIT], [0, -JIT]]) out.push([p.x + dx, p.y + dy]);
  }
  return out;
}

interface Run {
  best: number;
  at: Pt | null;
}

function runThrough(mid: Pt[], hit: Cand | number[]): Run {
  let run = 0, best = 0, at: Pt | null = null;
  for (const p of mid) {
    const h = Array.isArray(hit) ? p.x >= (hit[0] ?? 0) && p.x <= (hit[1] ?? 0) && p.y >= (hit[2] ?? 0) && p.y <= (hit[3] ?? 0) : inside(hit, p.x, p.y);
    if (h) {
      run += STEP;
      if (run > best) { best = run; at = p; }
    } else run = 0;
  }
  return { best, at };
}

function allOutside(mid: Pt[], c: Cand): boolean {
  for (const p of mid) if (!(p.x < c.x0 || p.x > c.x1 || p.y < c.y0 || p.y > c.y1)) return false;
  return true;
}

function endsInside(ends: number[][], c: Cand): boolean {
  for (const [x = 0, y = 0] of ends) if (inside(c, x, y)) return true;
  return false;
}

function shapeHits(cands: Cand[], mid: Pt[], ends: number[][], label: string, found: LeaderFinding[]): void {
  for (const c of cands) {
    if (allOutside(mid, c) || endsInside(ends, c)) continue;
    const { best, at } = runThrough(mid, c);
    if (best >= RUN && at !== null) {
      const what = nameOf(c.e) + ', ' + ((c.x1 - c.x0) / 72 * 25.4).toFixed(1) + ' x ' + ((c.y1 - c.y0) / 72 * 25.4).toFixed(1) + ' mm';
      found.push({ kind: 'shape', leader: label, what, x: at.x, y: at.y });
    }
  }
}

function nearBox(ends: number[][], b: number[]): boolean {
  const [x0 = 0, x1 = 0, y0 = 0, y1 = 0] = b;
  for (const [x = 0, y = 0] of ends) if (x >= x0 - END && x <= x1 + END && y >= y0 - END && y <= y1 + END) return true;
  return false;
}

interface Scan {
  rootInv: DOMMatrix;
  cands: Cand[];
  boxes: TextBox[];
  texts: SVGTextElement[];
  found: LeaderFinding[];
}

function labelHits(sc: Scan, own: Element[], mid: Pt[], ends: number[][], label: string): void {
  for (let i = 0; i < sc.boxes.length; i++) {
    const t = sc.boxes[i];
    const el = sc.texts[i];
    if (t === undefined || !t.s.trim() || t.rotate || (el !== undefined && own.includes(el))) continue;
    const bx = t.box, b = [bx.x + 0.3, bx.x + bx.w - 0.3, bx.y + 0.3, bx.y + bx.h - 0.3];
    if (nearBox(ends, b)) continue;
    const { best, at } = runThrough(mid, b);
    if (best >= RUN && at !== null) sc.found.push({ kind: 'label', leader: label, what: t.s.slice(0, 24), x: at.x, y: at.y });
  }
}

function scanLine(sc: Scan, ln: SVGGeometryElement, own: Element[], label: string): boolean {
  if (getComputedStyle(ln).fill !== 'none') return false;
  const len = ln.getTotalLength();
  if (!(len > 2 * END + RUN)) return false;
  const pts = samplePoints(ln, sc.rootInv.multiply(ln.getScreenCTM() ?? new DOMMatrix()), len);
  const a = pts[0], z = pts[pts.length - 1];
  if (a === undefined || z === undefined) return false;
  const mid: Pt[] = [];
  for (const p of pts) if (p.s >= END && p.s <= len - END) mid.push(p);
  const ends = endProbes(a, z);
  shapeHits(sc.cands, mid, ends, label, sc.found);
  labelHits(sc, own, mid, ends, label);
  return true;
}

function scanLeader(sc: Scan, g: Element): number {
  const par = g.parentElement;
  if (par !== null && par.closest(LEAD) !== null) return 0;
  const own: Element[] = [];
  const names: string[] = [];
  for (const t of g.querySelectorAll('text')) {
    own.push(t);
    names.push(t.textContent);
  }
  const joined = names.join(' ').trim();
  const label = joined !== '' ? joined : (g.getAttribute('data-part') ?? '');
  let n = 0;
  for (const ln of g.querySelectorAll('polyline, line, path')) {
    if (ln instanceof SVGGeometryElement && scanLine(sc, ln, own, label)) n++;
  }
  return n;
}

function runLeaders(boxes: TextBox[]): LeaderResult {
  const svg = hostSvg();
  const rootInv = (svg.getScreenCTM() ?? new DOMMatrix()).inverse();
  const texts: SVGTextElement[] = [];
  for (const t of svg.querySelectorAll('text')) texts.push(t);
  const sc: Scan = { rootInv, cands: collectCands(svg, rootInv), boxes, texts, found: [] };
  let nLines = 0;
  for (const g of svg.querySelectorAll(LEAD)) nLines += scanLeader(sc, g);
  return { found: sc.found, nLines, err: null };
}

export function leaderCheck(boxes: TextBox[]): LeaderResult {
  try {
    return runLeaders(boxes);
  } catch (e) {
    return { found: [], nLines: 0, err: e instanceof Error ? (e.stack ?? e.message) : String(e) };
  }
}
