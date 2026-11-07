import { Each } from './each.ts';
import { loadImage } from './inpage-common.ts';

export async function stackImages(srcs: string[], W: number, cx: number, cy: number, cw: number, ch: number): Promise<number> {
  document.body.innerHTML = '';
  let y = 0;
  for await (const src of new Each(srcs)) {
    const im = await loadImage(src);
    const sw = im.naturalWidth * cw, sh = im.naturalHeight * ch, k = W / sw;
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:' + y + 'px;width:' + W + 'px;height:' + (sh * k) + 'px;overflow:hidden;border-bottom:2px solid #f0f';
    im.style.cssText = 'position:absolute;left:' + (-im.naturalWidth * cx * k) + 'px;top:' + (-im.naturalHeight * cy * k) + 'px;width:' + (im.naturalWidth * k) + 'px';
    d.appendChild(im);
    document.body.appendChild(d);
    y += sh * k + 4;
  }
  return Math.ceil(y);
}
