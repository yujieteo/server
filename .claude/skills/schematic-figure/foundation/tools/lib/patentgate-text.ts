import { addFail, addInfo, addWarn } from './report.ts';
import type { Report } from './report.ts';
import { overlaps, quoteList, wordCount } from './check-ctx.ts';
import { BRACKETED, CAP, FIG, FIGISH, FLOOR, LEGEND_WORDS, MIN_MM, MM, NUMERAL, SHEET, XH } from './patentgate-consts.ts';
import { maxOf, minOf, uniq } from './numeric.ts';
import type { Manifest, TextItem } from './manifest.ts';

export type Kinds = Map<TextItem, string>;

export function capMM(t: TextItem): number {
  return t.minSize * CAP / MM;
}

export function classify(T: TextItem[], ledger: Map<string, string> | null): Kinds {
  const kinds: Kinds = new Map();
  for (const t of T) kinds.set(t, kindOf(t, ledger));
  return kinds;
}

function kindOf(t: TextItem, ledger: Map<string, string> | null): string {
  if (t.role === 'sheet' && SHEET.test(t.s)) return 'sheet';
  if (t.role === 'section') return 'section';
  if (FIG.test(t.s)) return 'fig';
  if (NUMERAL.test(t.s)) return 'numeral';
  if (ledger !== null && ledger.has(t.s)) return 'refchar';
  if (SHEET.test(t.s)) return 'sheet';
  return 'legend';
}

function ofKind(T: TextItem[], kinds: Kinds, ...want: string[]): TextItem[] {
  const out: TextItem[] = [];
  for (const t of T) if (want.includes(kinds.get(t) ?? '')) out.push(t);
  return out;
}

export function checkHeights(T: TextItem[], kinds: Kinds, r: Report): void {
  const small: TextItem[] = [], lower: TextItem[] = [];
  for (const t of T) {
    if (capMM(t) < MIN_MM - 0.005) small.push(t);
    if (/[a-z]/.test(t.s.replace(/^FIG\./, '')) && kinds.get(t) !== 'numeral' && t.minSize * XH / MM < MIN_MM - 0.005) lower.push(t);
  }
  if (small.length) {
    const parts: string[] = [];
    for (const t of small.slice(0, 8)) parts.push(`${JSON.stringify(t.s.slice(0, 20))} ${capMM(t).toFixed(2)} mm`);
    addFail(r, `characters below 0.32 cm (1/8 inch) high (1.84(p)(3)): ${parts.join(', ')}`);
  }
  const first = lower[0];
  if (first !== undefined) addWarn(r, `lowercase letters below 0.32 cm high (x-height ${(first.minSize * XH / MM).toFixed(2)} mm): set legends in capitals, or larger: ${quoteList(lower, 6, 24)}`);
}

export function checkLabels(T: TextItem[], kinds: Kinds, r: Report): void {
  const figs = ofKind(T, kinds, 'fig');
  if (!figs.length) addFail(r, `no view label: every view is labelled 'FIG. 1', 'FIG. 2', ... (1.84(u)); use L.figLabel`);
  const odd: string[] = [];
  for (const t of T) if (FIGISH.test(t.s) && !FIG.test(t.s)) odd.push(JSON.stringify(t.s));
  if (odd.length) addFail(r, `view labels must read 'FIG.' + number, e.g. 'FIG. 1' (1.84(u)(1)): ${odd.join(', ')}`);
  const sizes: number[] = [];
  for (const t of ofKind(T, kinds, 'numeral', 'refchar')) sizes.push(t.size);
  const maxNum = Math.max(0, maxOf(sizes));
  const L: string[] = [];
  for (const t of ofKind(T, kinds, 'fig', 'sheet')) if (t.size <= maxNum + 1e-6) L.push(JSON.stringify(t.s));
  if (L.length) addWarn(r, `view labels and sheet numbers should be larger than the reference numerals (${maxNum.toFixed(1)} pt) (1.84(t), (u)(2)): ${L.join(', ')}`);
}

function splitIds(nums: TextItem[], kinds: Kinds): string[] {
  const ids: string[] = [];
  for (const t of nums) if (kinds.get(t) === 'numeral') for (const s of t.s.split(',')) ids.push(s.trim());
  return ids;
}

export function checkRefChars(T: TextItem[], kinds: Kinds, ledger: Map<string, string> | null, docPath: string, r: Report): void {
  const nums = ofKind(T, kinds, 'numeral', 'refchar');
  const br: string[] = [];
  for (const t of T) if (BRACKETED.test(t.s)) br.push(JSON.stringify(t.s));
  if (br.length) addFail(r, `reference characters in brackets or quotation marks (1.84(p)(1)): ${br.join(', ')}`);
  if (ledger !== null) {
    const ids = splitIds(nums, kinds);
    const missing: string[] = [];
    for (const s of uniq(ids)) if (!ledger.has(s)) missing.push(s);
    if (missing.length) addFail(r, `numerals not defined in ${docPath.split(/[\\/]/).slice(-2).join('/')} (list each with the part's name from the description): ${missing.join(', ')}`);
    const shown = uniq(ids), notShown: string[] = [];
    for (const k of ledger.keys()) if (!shown.includes(k) && /[0-9]/.test(k)) notShown.push(k);
    addInfo(r, `numerals shown: ${shown.join(', ') || 'none'}; listed but not shown in this view: ${notShown.join(', ') || 'none'}`);
  }
  const bare: string[] = [];
  for (const t of nums) if (t.role !== 'section' && !t.under && !(t.leads !== null && t.leads > 0)) bare.push(t.s);
  if (bare.length) addWarn(r, `reference numerals without a lead line (1.84(q): a lead line from the numeral to the part, or underline a numeral that sits on its surface): ${uniq(bare).slice(0, 12).join(', ')}`);
  const bad: string[] = [];
  for (const t of T) if (t.role === 'numeral' && kinds.get(t) === 'legend') bad.push(JSON.stringify(t.s));
  if (bad.length) addWarn(r, `L.numeral text that is not a reference character: ${bad.join(', ')}`);
}

export function checkLegends(T: TextItem[], kinds: Kinds, r: Report): void {
  const legends = ofKind(T, kinds, 'legend');
  const long: TextItem[] = [];
  for (const t of legends) if (wordCount(t.s, /[A-Za-z0-9]+/g) > LEGEND_WORDS) long.push(t);
  if (long.length) addWarn(r, `legends longer than ${LEGEND_WORDS} words (1.84(o): only where indispensable, as few words as possible): ${quoteList(long, 8, 40)}`);
  if (legends.length) addInfo(r, `legends (${legends.length}; keep only those needed to understand the drawing): ${quoteList(legends, 12, 24)}`);
}

export function checkPatentStrokes(M: Manifest, r: Report): void {
  const ws: number[] = [], low: number[] = [], parts: string[] = [];
  for (const s of M.strokes) {
    ws.push(s.w);
    if (s.w < FLOOR - 1e-6) { low.push(s.w); parts.push(s.part === '' ? s.tag : s.part); }
  }
  if (low.length) addFail(r, `${low.length} strokes below ${FLOOR} pt at final size (min ${minOf(low).toFixed(3)} pt) will not reproduce (1.84(l)): ${uniq(parts).slice(0, 6).join(', ')}`);
  if (ws.length) addInfo(r, `stroke weights ${minOf(ws).toFixed(2)}-${maxOf(ws).toFixed(2)} pt`);
}

export function checkPatentOverlap(T: TextItem[], r: Report): void {
  const ov = overlaps(T, false);
  if (ov.length) addFail(r, `overlapping text (${ov.length}): ${ov.slice(0, 6).join('; ')}`);
}
