import type { PanelBox, PixelArg, PixelResult, TextBox } from './check-types.ts';
import type { Hole } from './check-types.ts';
import { cloneHost, rasterize, rgbSum } from './inpage-raster.ts';
import type { Raster } from './inpage-raster.ts';
import { sortNumbers } from './numeric.ts';

const K = 4;

function median(P: number[][], ch: number): number {
  const v: number[] = [];
  for (const p of P) v.push(p[ch] ?? 0);
  return sortNumbers(v)[P.length >> 1] ?? 0;
}

function busyShare(r: Raster, t: TextBox): number | null {
  const x0 = Math.max(0, Math.floor(t.box.x * K)), y0 = Math.max(0, Math.floor(t.box.y * K));
  const x1 = Math.min(r.w - 1, Math.ceil((t.box.x + t.box.w) * K)), y1 = Math.min(r.h - 1, Math.ceil((t.box.y + t.box.h) * K));
  const P: number[][] = [];
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const i = (y * r.w + x) * 4;
      P.push([r.D[i] ?? 0, r.D[i + 1] ?? 0, r.D[i + 2] ?? 0]);
    }
  }
  if (!P.length) return null;
  const m0 = median(P, 0), m1 = median(P, 1), m2 = median(P, 2);
  let n = 0;
  for (const p of P) if (Math.abs((p[0] ?? 0) - m0) + Math.abs((p[1] ?? 0) - m1) + Math.abs((p[2] ?? 0) - m2) > 60) n++;
  return n / P.length;
}

function findBusy(r: Raster, texts: TextBox[]): [string, number][] {
  const busy: [string, number][] = [];
  for (const t of texts) {
    if (!t.s.trim() || t.halo || t.rotate) continue;
    const diff = busyShare(r, t);
    if (diff !== null && diff > 0.06) busy.push([t.s.slice(0, 24), +diff.toFixed(2)]);
  }
  return busy;
}

function inkShare(r: Raster): number {
  let ink = 0, n = 0;
  for (let i = 0; i < r.D.length; i += 16) {
    n++;
    if ((r.D[i] ?? 0) + (r.D[i + 1] ?? 0) + (r.D[i + 2] ?? 0) < 720) ink++;
  }
  return ink / n;
}

function cellInked(r: Raster, x: number, y: number): boolean {
  for (let yy = y * K; yy < Math.min(r.h, (y + 1) * K); yy += 2) {
    for (let xx = x * K; xx < Math.min(r.w, (x + 1) * K); xx += 2) if (rgbSum(r, xx, yy) < 735) return true;
  }
  return false;
}

function markTexts(G: Uint8Array, GW: number, GH: number, texts: TextBox[]): void {
  for (const t of texts) {
    if (!t.s.trim()) continue;
    for (let y = Math.max(0, Math.floor(t.box.y)); y < Math.min(GH, Math.ceil(t.box.y + t.box.h)); y++) {
      for (let x = Math.max(0, Math.floor(t.box.x)); x < Math.min(GW, Math.ceil(t.box.x + t.box.w)); x++) G[y * GW + x] = 1;
    }
  }
}

function buildGrid(r: Raster, W: number, H: number, texts: TextBox[]): { G: Uint8Array; GW: number; GH: number } {
  const GW = Math.ceil(W), GH = Math.ceil(H), G = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) G[y * GW + x] = cellInked(r, x, y) ? 1 : 0;
  markTexts(G, GW, GH, texts);
  return { G, GW, GH };
}

function integral(G: Uint8Array, GW: number, GH: number): Int32Array {
  const S = new Int32Array((GW + 1) * (GH + 1));
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const a = S[y * (GW + 1) + x + 1] ?? 0, b = S[(y + 1) * (GW + 1) + x] ?? 0, c = S[y * (GW + 1) + x] ?? 0;
      S[(y + 1) * (GW + 1) + x + 1] = (G[y * GW + x] ?? 0) + a + b - c;
    }
  }
  return S;
}

function boxSum(S: Int32Array, GW: number, x0: number, y0: number, x1: number, y1: number): number {
  return (S[y1 * (GW + 1) + x1] ?? 0) - (S[y0 * (GW + 1) + x1] ?? 0) - (S[y1 * (GW + 1) + x0] ?? 0) + (S[y0 * (GW + 1) + x0] ?? 0);
}

function fitsSquare(S: Int32Array, GW: number, b: number[], sq: number): boolean {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = b;
  for (let y = y0; y + sq <= y1; y += 2) {
    for (let x = x0; x + sq <= x1; x += 2) if (boxSum(S, GW, x, y, x + sq, y + sq) === 0) return true;
  }
  return false;
}

function panelHole(S: Int32Array, GW: number, GH: number, P: PanelBox): Hole | null {
  const x0 = Math.max(0, Math.round(P.x) + 4), y0 = Math.max(0, Math.round(P.y) + 4);
  const x1 = Math.min(GW, Math.round(P.x + P.w) - 4), y1 = Math.min(GH, Math.round(P.y + P.h) - 4);
  if (x1 - x0 < 20 || y1 - y0 < 20) return null;
  let lo = 0, hi = Math.min(x1 - x0, y1 - y0);
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (fitsSquare(S, GW, [x0, y0, x1, y1], m)) lo = m;
    else hi = m - 1;
  }
  return [P.label !== null && P.label !== '' ? P.label : '?', +(lo * lo / ((x1 - x0) * (y1 - y0))).toFixed(3), lo];
}

export async function pixelChecks(arg: PixelArg): Promise<PixelResult> {
  const s = cloneHost();
  for (const t of s.querySelectorAll('text')) t.remove();
  const r = await rasterize(s, arg.W, arg.H, K);
  const { G, GW, GH } = buildGrid(r, arg.W, arg.H, arg.texts);
  const S = integral(G, GW, GH);
  const holes: Hole[] = [];
  for (const P of arg.panels) {
    const h = panelHole(S, GW, GH, P);
    if (h !== null) holes.push(h);
  }
  return { busy: findBusy(r, arg.texts), ink: inkShare(r), holes };
}
