import { addFail, addInfo, addWarn } from './report.ts';
import type { Report } from './report.ts';
import { MM } from './patentgate-consts.ts';
import { uniq } from './numeric.ts';
import type { PatentResult } from './check-types.ts';
import type { Box } from './manifest.ts';

function lst(a: string[]): string {
  const u = uniq(a);
  return u.slice(0, 6).join('; ') + (u.length > 6 ? ` (+${u.length - 6})` : '');
}

function paintProblems(px: PatentResult, r: Report): void {
  const b = px.bad;
  if (b.colour.length) addFail(r, `colour on a black-and-white drawing (1.84(a)(1)): ${lst(b.colour)}`);
  if (b.grey.length) addFail(r, `grey or translucent paint: lines and fills must be solid black or white (1.84(l), (m)): ${lst(b.grey)}`);
  if (b.server.length) addFail(r, `gradient or pattern paint (tonal rendering; shade with spaced lines, L.surfaceShade, 1.84(m)): ${lst(b.server)}`);
  if (b.opacity.length) addFail(r, `opacity below 1 renders grey: ${lst(b.opacity)}`);
  if (b.filter.length) addFail(r, `filters (blur, glow, shadow) are tonal rendering: ${lst(b.filter)}`);
  if (b.image.length) addFail(r, `raster image on the sheet (photographs only where nothing else can show the invention, 1.84(b)): ${lst(b.image)}`);
  if (b.blackArea.length) addWarn(r, `solid black areas (1.84(m): no solid black shading; use hatching or spaced lines): ${lst(b.blackArea)}`);
}

export function reportDom(px: PatentResult, S: Box, r: Report): void {
  paintProblems(px, r);
  if (px.cross.length) addFail(r, `lead lines cross each other (1.84(q)): ${lst(px.cross)}`);
  if (px.enclosed.length) addFail(r, `reference numerals enclosed in a circle or ellipse (1.84(p)(1)): ${lst(px.enclosed)}`);
  const [o0 = 0, o1 = 0, o2 = 0, o3 = 0] = px.ob;
  if (px.outN) addFail(r, `marks outside the sight (margins top 25, left 25, right 15, bottom 10 mm, 1.84(g)): ${px.outN} px, spanning ${(o0 / MM).toFixed(1)}-${(o2 / MM).toFixed(1)} x ${(o1 / MM).toFixed(1)}-${(o3 / MM).toFixed(1)} mm`);
  if (px.under.length) {
    const parts: string[] = [];
    for (const [s, f] of px.under.slice(0, 8)) parts.push(`${JSON.stringify(s)} ${f}`);
    addWarn(r, `characters over line work (1.84(p)(3): numerals and letters sit in clear space, or leave a gap in hatching): ${parts.join(', ')}`);
  }
  const [i0 = 0, i1 = 0, i2 = 0, i3 = 0] = px.ib;
  if (i2 > i0) {
    const fw = (i2 - i0) / S.w, fh = (i3 - i1) / S.h;
    addInfo(r, `drawing spans ${Math.round(fw * 100)}% x ${Math.round(fh * 100)}% of the sight`);
    if (Math.max(fw, fh) < 0.5) addWarn(r, 'the drawing uses under half the sight in both directions: draw it larger (1.84(k): clear without crowding when reduced to two thirds)');
  }
}
