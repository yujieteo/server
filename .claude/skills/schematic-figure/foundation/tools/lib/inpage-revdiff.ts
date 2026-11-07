import { ctx2d, loadImage } from './inpage-common.ts';

type Rect = [number, number, number, number];

export interface Hot {
  region: number[];
  changed: number;
}

export interface DiffResult {
  before: [number, number];
  after: [number, number];
  outsidePct: number;
  insidePct: number;
  hot: Hot[];
  png: string;
}

function pixels(im: HTMLImageElement, W: number, H: number): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = ctx2d(c);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.drawImage(im, 0, 0, W, H);
  return g.getImageData(0, 0, W, H).data;
}

function inAllow(allow: Rect[], x: number, y: number): boolean {
  for (const [x0, y0, x1, y1] of allow) if (x >= x0 && x < x1 && y >= y0 && y < y1) return true;
  return false;
}

function paintPixel(o: Uint8ClampedArray, i: number, changed: boolean, ins: boolean, grey: number): void {
  if (changed && !ins) { o[i] = 230; o[i + 1] = 30; o[i + 2] = 30; }
  else if (changed) { o[i] = 40; o[i + 1] = 90; o[i + 2] = 220; }
  else { o[i] = grey; o[i + 1] = grey; o[i + 2] = grey; }
  o[i + 3] = 255;
}

function sortHot(list: { cell: [number, number]; frac: number }[]): { cell: [number, number]; frac: number }[] {
  const a = list.slice();
  for (let i = 1; i < a.length; i++) {
    const v = a[i];
    if (v === undefined) continue;
    let j = i - 1;
    while (j >= 0 && (a[j]?.frac ?? 0) < v.frac) { a[j + 1] = a[j] ?? v; j--; }
    a[j + 1] = v;
  }
  return a;
}

function hotRegions(cells: number[][], G: number): Hot[] {
  const list: { cell: [number, number]; frac: number }[] = [];
  for (let k = 0; k < cells.length; k++) {
    const [n = 0, t = 0] = cells[k] ?? [];
    const frac = t ? n / t : 0;
    if (frac > 0.002) list.push({ cell: [k % G, Math.floor(k / G)], frac });
  }
  const out: Hot[] = [];
  for (const q of sortHot(list).slice(0, 12)) {
    const region = [q.cell[0] / G, q.cell[1] / G, 1 / G, 1 / G];
    const rounded: number[] = [];
    for (const v of region) rounded.push(+v.toFixed(3));
    out.push({ region: rounded, changed: +(100 * q.frac).toFixed(2) });
  }
  return out;
}

function toRects(allow: number[][], W: number, H: number): Rect[] {
  const out: Rect[] = [];
  for (const [x = 0, y = 0, w = 0, h = 0] of allow) out.push([x * W, y * H, (x + w) * W, (y + h) * H]);
  return out;
}

export async function diffImages(before: string, after: string, allowFr: number[][], tol: number): Promise<DiffResult> {
  const a = await loadImage(before + '?v=' + Date.now()), b = await loadImage(after + '?v=' + Date.now());
  const W = a.naturalWidth, H = a.naturalHeight;
  const da = pixels(a, W, H), db = pixels(b, W, H), allow = toRects(allowFr, W, H);
  const G = 8, cells: number[][] = [];
  for (let k = 0; k < G * G; k++) cells.push([0, 0]);
  const out = new ImageData(W, H), o = out.data;
  let outside = 0, outsideN = 0, inside = 0, insideN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = 4 * (y * W + x);
      const d = Math.max(Math.abs((da[i] ?? 0) - (db[i] ?? 0)), Math.abs((da[i + 1] ?? 0) - (db[i + 1] ?? 0)), Math.abs((da[i + 2] ?? 0) - (db[i + 2] ?? 0)));
      const ins = inAllow(allow, x, y), ch = d > tol;
      const cell = cells[Math.min(G - 1, Math.floor(y / H * G)) * G + Math.min(G - 1, Math.floor(x / W * G))] ?? [0, 0];
      if (ins) { insideN++; if (ch) inside++; } else { outsideN++; cell[1] = (cell[1] ?? 0) + 1; if (ch) { outside++; cell[0] = (cell[0] ?? 0) + 1; } }
      paintPixel(o, i, ch, ins, 235 - (255 - ((da[i] ?? 0) + (da[i + 1] ?? 0) + (da[i + 2] ?? 0)) / 3) * 0.35);
    }
  }
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = ctx2d(c);
  g.putImageData(out, 0, 0);
  g.strokeStyle = '#1a9e3a';
  g.lineWidth = Math.max(2, W / 600);
  for (const [x0, y0, x1, y1] of allow) g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  return { before: [W, H], after: [b.naturalWidth, b.naturalHeight], outsidePct: 100 * outside / Math.max(1, outsideN),
    insidePct: 100 * inside / Math.max(1, insideN), hot: hotRegions(cells, G), png: c.toDataURL('image/png').split(',')[1] ?? '' };
}
