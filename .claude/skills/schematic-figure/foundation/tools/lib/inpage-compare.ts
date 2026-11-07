import { Each } from './each.ts';
import { ctx2d, loadImage } from './inpage-common.ts';

export interface CellStat {
  sat: number;
  lum: number;
  ink: number;
}

async function placeHalf(src: string, k: number, half: number, crop: number[]): Promise<number> {
  const [cx = 0, cy = 0, cw = 1, ch = 1] = crop;
  const im = await loadImage(src + '?v=' + Date.now());
  const sw = im.naturalWidth * cw, sh = im.naturalHeight * ch, s = half / sw;
  const d = document.createElement('div');
  d.style.cssText = 'position:absolute;top:22px;left:' + (k * (half + 8)) + 'px;width:' + half + 'px;height:' + (sh * s) + 'px;overflow:hidden;outline:1px solid #f0f';
  im.style.cssText = 'position:absolute;left:' + (-im.naturalWidth * cx * s) + 'px;top:' + (-im.naturalHeight * cy * s) + 'px;width:' + (im.naturalWidth * s) + 'px';
  d.appendChild(im);
  document.body.appendChild(d);
  const t = document.createElement('div');
  t.textContent = k === 0 ? 'reference' : 'render';
  t.style.cssText = 'position:absolute;top:2px;left:' + (k * (half + 8) + 4) + 'px;font:14px Arial';
  document.body.appendChild(t);
  return sh * s + 22;
}

export async function compareShot(W: number, crop: number[], srcs: string[]): Promise<number> {
  document.body.innerHTML = '';
  document.body.style.background = '#fff';
  const half = W / 2 - 4;
  let H = 0;
  let k = 0;
  for await (const src of new Each(srcs)) {
    H = Math.max(H, await placeHalf(src, k, half, crop));
    k++;
  }
  return Math.ceil(H);
}

interface Sampled {
  w: number;
  h: number;
  d: Uint8ClampedArray;
}

async function sample(src: string): Promise<Sampled> {
  const im = await loadImage(src + '?v=' + Date.now());
  const c = document.createElement('canvas');
  c.width = 400;
  c.height = Math.round(400 * im.naturalHeight / im.naturalWidth);
  const g = ctx2d(c);
  g.drawImage(im, 0, 0, c.width, c.height);
  return { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
}

function cellStat(s: Sampled, r: number, c: number, GR: number, GC: number): CellStat {
  let S = 0, Lsum = 0, n = 0, ink = 0;
  const { w, h, d } = s;
  for (let y = Math.floor(r * h / GR); y < Math.floor((r + 1) * h / GR); y++) {
    for (let x = Math.floor(c * w / GC); x < Math.floor((c + 1) * w / GC); x++) {
      const i = (y * w + x) * 4, R = (d[i] ?? 0) / 255, G = (d[i + 1] ?? 0) / 255, B = (d[i + 2] ?? 0) / 255;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2;
      n++;
      Lsum += l;
      if (mx - mn > 0.08 || l < 0.85) { ink++; S += mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1)); }
    }
  }
  return { sat: +(ink ? S / ink : 0).toFixed(3), lum: +(Lsum / n).toFixed(3), ink: +(ink / n).toFixed(3) };
}

export async function compareStats(ref: string, img: string, GR: number, GC: number): Promise<Record<string, CellStat[]>> {
  const imgs = [await sample(ref), await sample(img)];
  const res: Record<string, CellStat[]> = {};
  for (let r = 0; r < GR; r++) {
    for (let c = 0; c < GC; c++) {
      const row: CellStat[] = [];
      for (const s of imgs) row.push(cellStat(s, r, c, GR, GC));
      res['cell-' + (r + 1) + '-' + (c + 1)] = row;
    }
  }
  return res;
}
