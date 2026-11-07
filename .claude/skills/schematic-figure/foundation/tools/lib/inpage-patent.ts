import type { PatentArg, PatentBad, PatentResult, TextBox } from './check-types.ts';
import { hostSvg } from './inpage-common.ts';
import { cloneHost, rasterize, rgbSum } from './inpage-raster.ts';
import type { Raster } from './inpage-raster.ts';

const MM = 72 / 25.4;
const K = 3;
const SKIP = 'defs,clipPath,mask,marker,pattern,linearGradient,radialGradient';
const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan']);

type Pt = [number, number];

interface RBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function toRoot(inv: DOMMatrix, e: SVGGraphicsElement, x: number, y: number): Pt {
  const q = new DOMPoint(x, y).matrixTransform(inv.multiply(e.getScreenCTM() ?? new DOMMatrix()));
  return [q.x, q.y];
}

function boxRoot(inv: DOMMatrix, e: SVGGraphicsElement): RBox {
  const b = e.getBBox();
  const c = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x = 0, y = 0] of c) {
    const [qx, qy] = toRoot(inv, e, x, y);
    x0 = Math.min(x0, qx);
    x1 = Math.max(x1, qx);
    y0 = Math.min(y0, qy);
    y1 = Math.max(y1, qy);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function paintClass(v: string): string {
  if (v === '' || v === 'none') return 'none';
  if (v.startsWith('url')) return 'paint-server';
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(v);
  if (m === null) return 'unknown ' + v;
  const r = +(m[1] ?? 0), g = +(m[2] ?? 0), b = +(m[3] ?? 0), a = m[4] === undefined ? 1 : +m[4];
  if (a === 0) return 'none';
  if (a < 1) return 'translucent';
  if (r === 0 && g === 0 && b === 0) return 'black';
  if (r === 255 && g === 255 && b === 255) return 'white';
  return r === g && g === b ? 'grey' : 'colour';
}

function tagOf(e: Element): string {
  const part = e.closest('[data-part]:not([data-part=sight])')?.getAttribute('data-part');
  const base = part !== undefined && part !== null && part !== '' ? part : e.tagName;
  const t = e.tagName;
  return base + (t === 'text' || t === 'tspan' ? ' ' + JSON.stringify(e.textContent.slice(0, 16)) : '');
}

function emptyBad(): PatentBad {
  return { colour: [], grey: [], server: [], opacity: [], filter: [], image: [], blackArea: [] };
}

function scanChannel(bad: PatentBad, e: Element, ch: string, v: string, op: number, strokeZero: boolean): void {
  let c = paintClass(v);
  if (c !== 'none' && op < 1) c = op === 0 ? 'none' : 'translucent';
  if (ch === 'stroke' && strokeZero) return;
  if (c === 'colour') bad.colour.push(ch + ' ' + v + ' in ' + tagOf(e));
  else if (c === 'grey' || c === 'translucent') bad.grey.push(ch + ' ' + v + ' in ' + tagOf(e));
  else if (c === 'paint-server') bad.server.push(ch + ' in ' + tagOf(e));
}

function scanElement(bad: PatentBad, inv: DOMMatrix, e: Element): void {
  if (e.closest(SKIP) !== null) return;
  const t = e.tagName, cs = getComputedStyle(e);
  if (t === 'image') { bad.image.push(tagOf(e)); return; }
  if (+cs.opacity < 1) bad.opacity.push(tagOf(e));
  if (cs.filter && cs.filter !== 'none') bad.filter.push(tagOf(e));
  if (!SHAPES.has(t) || e.getAttribute('data-role') === 'background') return;
  scanChannel(bad, e, 'stroke', cs.stroke, +cs.strokeOpacity, cs.strokeWidth === '0px');
  if (t !== 'line') scanChannel(bad, e, 'fill', cs.fill, +cs.fillOpacity, false);
  if (t !== 'line' && t !== 'text' && t !== 'tspan' && paintClass(cs.fill) === 'black' && e instanceof SVGGraphicsElement) {
    const b = boxRoot(inv, e);
    if (b.w * b.h > (5 * MM) ** 2) bad.blackArea.push(tagOf(e) + ' ' + (b.w / MM).toFixed(1) + 'x' + (b.h / MM).toFixed(1) + ' mm');
  }
}

interface Lead {
  pts: Pt[];
  grp: Element | null;
  label: string;
}

function collectLeads(inv: DOMMatrix, svg: SVGSVGElement): Lead[] {
  const leads: Lead[] = [];
  for (const e of svg.querySelectorAll('[data-part=leader-line]')) {
    if (!(e instanceof SVGGeometryElement)) continue;
    const n = 48, L = e.getTotalLength(), pts: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const q = e.getPointAtLength(L * i / n);
      pts.push(toRoot(inv, e, q.x, q.y));
    }
    const grp = e.closest('[data-part=numeral]');
    const lab = grp?.querySelector('text')?.textContent;
    leads.push({ pts, grp, label: lab !== undefined && lab !== '' ? lab : '?' });
  }
  return leads;
}

function segX(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = (r[0] ?? 0) * (s[1] ?? 0) - (r[1] ?? 0) * (s[0] ?? 0);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * (s[1] ?? 0) - (c[1] - a[1]) * (s[0] ?? 0)) / den;
  const u = ((c[0] - a[0]) * (r[1] ?? 0) - (c[1] - a[1]) * (r[0] ?? 0)) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * (r[0] ?? 0), a[1] + t * (r[1] ?? 0)] : null;
}

function nearEnds(q: Pt, P: Pt[]): boolean {
  const f = P[0], l = P[P.length - 1];
  if (f === undefined || l === undefined) return false;
  return Math.hypot(q[0] - f[0], q[1] - f[1]) < 1 || Math.hypot(q[0] - l[0], q[1] - l[1]) < 1;
}

function leadsCross(A: Pt[], B: Pt[]): boolean {
  for (let a = 0; a + 1 < A.length; a++) {
    for (let b = 0; b + 1 < B.length; b++) {
      const q = segX(A[a] ?? [0, 0], A[a + 1] ?? [0, 0], B[b] ?? [0, 0], B[b + 1] ?? [0, 0]);
      if (q !== null && !nearEnds(q, A) && !nearEnds(q, B)) return true;
    }
  }
  return false;
}

function crossings(leads: Lead[]): string[] {
  const cross: string[] = [];
  for (let i = 0; i < leads.length; i++) {
    for (let j = i + 1; j < leads.length; j++) {
      const a = leads[i], b = leads[j];
      if (a === undefined || b === undefined) continue;
      if (a.grp !== null && a.grp === b.grp) continue;
      if (leadsCross(a.pts, b.pts)) cross.push(a.label + ' x ' + b.label);
    }
  }
  return cross;
}

function enclosedNumerals(inv: DOMMatrix, svg: SVGSVGElement): string[] {
  const rings: RBox[] = [];
  for (const e of svg.querySelectorAll('circle,ellipse')) if (e.closest('defs') === null && e instanceof SVGGraphicsElement) rings.push(boxRoot(inv, e));
  const out: string[] = [];
  for (const t of svg.querySelectorAll('text')) {
    const txt = t.textContent.replace(/​/g, '').trim();
    if (!/^S?\d{1,5}[A-Za-z]{0,2}$/.test(txt) || !(t instanceof SVGGraphicsElement)) continue;
    const b = boxRoot(inv, t);
    for (const r of rings) {
      if (r.x <= b.x + 0.5 && r.y <= b.y + 0.5 && r.x + r.w >= b.x + b.w - 0.5 && r.y + r.h >= b.y + b.h - 0.5 && r.w * r.h < 5 * b.w * b.h) {
        out.push(t.textContent);
        break;
      }
    }
  }
  return out;
}

function inkBounds(R: Raster, arg: PatentArg): { outN: number; ob: number[]; ib: number[] } {
  const S = arg.sight;
  const sx0 = (S.x - 0.5) * K, sy0 = (S.y - 0.5) * K, sx1 = (S.x + S.w + 0.5) * K, sy1 = (S.y + S.h + 0.5) * K;
  let outN = 0;
  const ob = [1e9, 1e9, -1e9, -1e9], ib = [1e9, 1e9, -1e9, -1e9];
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      if (rgbSum(R, x, y) > 600) continue;
      const out = x < sx0 || x > sx1 || y < sy0 || y > sy1;
      if (out) outN++;
      const bb = out ? ob : ib;
      bb[0] = Math.min(bb[0] ?? 0, x);
      bb[1] = Math.min(bb[1] ?? 0, y);
      bb[2] = Math.max(bb[2] ?? 0, x);
      bb[3] = Math.max(bb[3] ?? 0, y);
    }
  }
  return { outN, ob: scale(ob), ib: scale(ib) };
}

function scale(b: number[]): number[] {
  const out: number[] = [];
  for (const v of b) out.push(v / K);
  return out;
}

function underShare(R: Raster, t: TextBox): number | null {
  const x0 = Math.max(0, Math.floor(t.box.x * K) + 1), y0 = Math.max(0, Math.floor(t.box.y * K) + 1);
  const x1 = Math.min(R.w - 1, Math.ceil((t.box.x + t.box.w) * K) - 1), y1 = Math.min(R.h - 1, Math.ceil((t.box.y + t.box.h) * K) - 1);
  let n = 0, m = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      n++;
      if (rgbSum(R, x, y) < 450) m++;
    }
  }
  return n ? m / n : null;
}

async function underText(arg: PatentArg): Promise<[string, number][]> {
  const s2 = cloneHost();
  for (const e of s2.querySelectorAll('[data-role=background],text,[data-part=underline]')) e.remove();
  const R2 = await rasterize(s2, arg.W, arg.H, K);
  const under: [string, number][] = [];
  for (const t of arg.texts) {
    if (!t.s.trim() || t.rotate) continue;
    const f = underShare(R2, t);
    if (f !== null && f > 0.01) under.push([t.s.slice(0, 20), +f.toFixed(3)]);
  }
  return under;
}

export async function patentChecks(arg: PatentArg): Promise<PatentResult> {
  const svg = hostSvg();
  const inv = (svg.getScreenCTM() ?? new DOMMatrix()).inverse();
  const bad = emptyBad();
  for (const e of svg.querySelectorAll('*')) scanElement(bad, inv, e);
  const cross = crossings(collectLeads(inv, svg));
  const enclosed = enclosedNumerals(inv, svg);
  const s1 = cloneHost();
  for (const e of s1.querySelectorAll('[data-role=background]')) e.remove();
  const bounds = inkBounds(await rasterize(s1, arg.W, arg.H, K), arg);
  return { bad, cross, enclosed, ...bounds, under: await underText(arg) };
}
