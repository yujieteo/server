import { Each } from './each.ts';

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (g === null) throw new Error('no 2d canvas');
  return g;
}

export function toDataUrl(type: string, bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${type === '' ? 'application/octet-stream' : type};base64,${btoa(bin)}`;
}

export async function inlineImages(s: SVGSVGElement): Promise<void> {
  for await (const im of new Each([...s.querySelectorAll('image')])) {
    const h = im.getAttribute('href');
    if (h === null || h === '' || h.startsWith('data:')) continue;
    const b = await (await fetch(new URL(h, location.href))).blob();
    im.setAttribute('href', toDataUrl(b.type, new Uint8Array(await b.arrayBuffer())));
  }
}

export function hostSvg(): SVGSVGElement {
  const s = document.querySelector('#host svg');
  if (!(s instanceof SVGSVGElement)) throw new Error('no figure svg');
  return s;
}

export async function loadImage(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.src = src;
  await im.decode();
  return im;
}

export async function exportSvg(): Promise<string> {
  const s = hostSvg().cloneNode(true);
  if (!(s instanceof SVGSVGElement)) throw new Error('clone is not an svg');
  await inlineImages(s);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(s)}`;
}

export function makeTransparent(): void {
  document.head.insertAdjacentHTML('beforeend', '<style>html,body{background:transparent!important}</style>');
  for (const r of document.querySelectorAll('#host svg rect[data-role="background"]')) r.remove();
}
