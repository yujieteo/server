import { ctx2d, hostSvg, inlineImages, loadImage } from './inpage-common.ts';

export interface Raster {
  D: Uint8ClampedArray;
  w: number;
  h: number;
}

export function cloneHost(): SVGSVGElement {
  const s = hostSvg().cloneNode(true);
  if (!(s instanceof SVGSVGElement)) throw new Error('clone is not an svg');
  return s;
}

export async function rasterize(s: SVGSVGElement, W: number, H: number, k: number): Promise<Raster> {
  await inlineImages(s);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s));
  const img = await loadImage(url);
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * k);
  c.height = Math.ceil(H * k);
  const g = ctx2d(c);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return { D: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}

export function rgbSum(r: Raster, x: number, y: number): number {
  const i = (y * r.w + x) * 4;
  return (r.D[i] ?? 0) + (r.D[i + 1] ?? 0) + (r.D[i + 2] ?? 0);
}
