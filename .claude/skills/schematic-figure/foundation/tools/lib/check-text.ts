import { addFail, addInfo, addSoft, addWarn } from './report.ts';
import { isBold, overlaps, quoteList, wordCount } from './check-ctx.ts';
import type { Ctx } from './check-ctx.ts';
import { sortNumbers, uniq } from './numeric.ts';
import type { TextItem } from './manifest.ts';

const WIDTHS = [89, 120, 136, 183];

function warnList(c: Ctx, L: TextItem[], msg: string): void {
  if (L.length) addWarn(c.r, `${msg}: ${quoteList(L, 8, 24)}${L.length > 8 ? ` (+${L.length - 8})` : ''}`);
}

export function checkPage(c: Ctx): void {
  const { M, fm, r } = c;
  if (!c.journal) { addInfo(r, `format ${M.format}: text ${fm.min}-${fm.max} pt, lines >= ${fm.line} pt`); return; }
  if (!WIDTHS.includes(M.widthMM)) addWarn(r, `width ${M.widthMM} mm is not a Nature column width (${WIDTHS.join(', ')})`);
  if (M.heightMM > 247) addFail(r, `height ${M.heightMM} mm exceeds the 247 mm page depth`);
}

function checkMedian(c: Ctx): void {
  const sizes: number[] = [];
  for (const t of c.T) if (t.role !== 'panel') sizes.push(t.size);
  const L = sortNumbers(sizes);
  if (!L.length) return;
  const med = L[L.length >> 1] ?? 0, rel = med / c.M.W;
  addInfo(c.r, `median label ${med} pt = ${(rel * 100).toFixed(2)}% of the width (published Fig. 1s: median 2.2%, 25th percentile 1.65%)`);
  if (rel < 0.0165) addWarn(c.r, `text is small for the figure: median label ${med} pt at ${c.M.widthMM} mm, where published Fig. 1s read like ${(0.0217 * c.M.W).toFixed(1)} pt. Draw it narrower (120 or 136 mm) with 7-8 pt labels, enlarging the main objects and dropping minor ones to make room`);
}

function checkSizes(c: Ctx): void {
  const { T, fm, r } = c;
  const fams: string[] = [];
  for (const t of T) fams.push(t.family ?? '');
  const fam = uniq(fams);
  if (fam.length > 1) addWarn(r, `more than one font family: ${fam.join(' | ')}`);
  const small: TextItem[] = [], big: TextItem[] = [], sub: TextItem[] = [];
  for (const t of T) {
    if (t.role !== 'panel' && t.size < fm.min - 1e-6) small.push(t);
    if (t.role !== 'panel' && t.size > fm.max + 1e-6) big.push(t);
    if (t.minSize < fm.min * 0.72) sub.push(t);
  }
  if (small.length) {
    const parts: string[] = [];
    for (const t of small.slice(0, 8)) parts.push(`${JSON.stringify(t.s.slice(0, 20))} ${t.size.toFixed(1)}pt`);
    addFail(r, `text below ${fm.min} pt: ${parts.join(', ')}`);
  }
  if (c.rep) addInfo(r, 'replicate mode: text above 8 pt, coloured text and heavy lines are reported as info, not warnings');
  if (big.length) addSoft(r, c.rep, `text above ${fm.max} pt: ${quoteList(big, 8, 24)}`);
  warnList(c, sub, `sub/superscript below ${(fm.min * 0.72).toFixed(1)} pt`);
}

function checkBudget(c: Ctx): void {
  let nWords = 0;
  for (const t of c.T) if (t.role !== 'panel') nWords += wordCount(t.s, /[A-Za-z]{2,}|\d+(?:\.\d+)?/g);
  const dens = nWords / (c.M.widthMM * c.M.heightMM / 100);
  const msg = `text: ${nWords} words, ${dens.toFixed(2)} words/cm2 (calibration from 5 published schematics: 0.20-0.45)`;
  if (dens > 0.5 && !c.rep && c.M.format !== 'poster') addWarn(c.r, msg + ': smell test, check whether caption material is on the figure');
  else addInfo(c.r, msg);
  if (c.M.panels.length > 1) {
    const labs: string[] = [], want: string[] = [];
    for (const t of c.T) if (t.role === 'panel') { want.push(String.fromCharCode(97 + labs.length)); labs.push(t.s); }
    if (labs.join() !== want.join()) addWarn(c.r, `panel labels ${labs.join(',')} are not a, b, c, ... in drawing order`);
  }
}

function checkHeadings(c: Ctx): void {
  if (c.rep) return;
  const L: TextItem[] = [];
  for (const t of c.T) {
    const head = t.role === 'title' || (t.role === 'label' && isBold(t));
    if (head && (/[?!]\s*$/.test(t.s) || /[a-z]\.\s*$/.test(t.s) || wordCount(t.s, /[A-Za-z]{2,}/g) >= 6)) L.push(t);
  }
  if (L.length) addWarn(c.r, `sentence-style headings (P31: name the content with a noun phrase): ${quoteList(L, 6, 40)}`);
  const cap: TextItem[] = [];
  for (const t of c.T) {
    if (t.role !== 'label' || isBold(t)) continue;
    if (wordCount(t.s, /[A-Za-z]{2,}/g) >= 6 || /[A-Za-z]{3,}:\s/.test(t.s) || /[A-Za-z]{2,}, (no|not|cut|only|so|but)\b/i.test(t.s)) cap.push(t);
  }
  if (cap.length) addWarn(c.r, `caption-like labels (a label names a thing in 2-4 words; explanation goes to docs/caption.md): ${quoteList(cap, 8, 40)}`);
}

function checkColour(c: Ctx): void {
  const L: TextItem[] = [];
  for (const t of c.T) {
    if (t.color !== null && t.color !== '' && !/^#(1a1a1a|000|000000|222|2b2b2b|fff|ffffff)$/i.test(t.color) && t.role !== 'panel') L.push(t);
  }
  if (L.length) addInfo(c.r, `coloured text (fine when the hue is the colour of the entity it names, P15; never for emphasis alone): ${quoteList(L, 8, 24)}`);
}

function checkPlacement(c: Ctx): void {
  const { M, T } = c;
  const ov = overlaps(T, true);
  if (ov.length) addFail(c.r, `overlapping text (${ov.length}): ${ov.slice(0, 6).join('; ')}`);
  const off: string[] = [];
  for (const t of T) {
    const b = t.box;
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > M.W + 0.5 || b.y + b.h > M.H + 0.5) off.push(JSON.stringify(t.s.slice(0, 20)));
  }
  if (off.length) addFail(c.r, `text off the page: ${off.join(', ')}`);
}

export function checkText(c: Ctx): void {
  if (c.journal) checkMedian(c);
  checkSizes(c);
  checkBudget(c);
  checkHeadings(c);
  checkColour(c);
  checkPlacement(c);
}
