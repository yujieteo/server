// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/lib/patentgate.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Cdp } from './cdp.ts';
import { parsePatentResult } from './check-types.ts';
import type { PatentArg, TextBox } from './check-types.ts';
import type { Manifest, PatentInfo, TextItem } from './manifest.ts';
import { MM, SHEETS, parseNumerals } from './patentgate-consts.ts';
import { reportDom } from './patentgate-dom.ts';
import {
  capMM, checkHeights, checkLabels, checkLegends, checkPatentOverlap, checkPatentStrokes, checkRefChars, classify,
} from './patentgate-text.ts';
import type { Kinds } from './patentgate-text.ts';
import { relationProblems } from './check-geom.ts';
import { addFail, addInfo } from './report.ts';
import type { Report } from './report.ts';

export { NUMERAL, parseNumerals } from './patentgate-consts.ts';

function checkSheet(M: Manifest, P: PatentInfo, T: TextItem[], r: Report): void {
  let name = '?';
  let found = false;
  for (const [n, w, h] of SHEETS) {
    if (Math.abs(M.widthMM - w) < 0.6 && Math.abs(M.heightMM - h) < 0.6) { name = n; found = true; break; }
  }
  if (!found) addFail(r, `sheet ${M.widthMM} x ${M.heightMM} mm is neither US letter (215.9 x 279.4) nor A4 (210 x 297) (1.84(f))`);
  addInfo(r, `patent sheet ${name} ${M.widthMM} x ${M.heightMM} mm; sight ${(P.sight.w / MM).toFixed(1)} x ${(P.sight.h / MM).toFixed(1)} mm; ${T.length} texts, ${M.strokes.length} strokes`);
  const fz = P.forced;
  if (fz.stroke + fz.fill + fz.text + fz.opacity + fz.width) addInfo(r, `patent profile forced ${fz.stroke} stroke colours, ${fz.fill} fills, ${fz.text} text colours, ${fz.opacity} opacities/filters and ${fz.width} widths to black-and-white line art: check nothing that carried meaning was lost`);
}

function loadLedger(P: PatentInfo, figAbs: string, r: Report): { ledger: Map<string, string> | null; docPath: string } {
  const docPath = P.numeralsDoc !== null ? resolve(dirname(figAbs), P.numeralsDoc) : join(dirname(figAbs), '..', 'docs', 'numerals.md');
  const ledger = existsSync(docPath) ? parseNumerals(readFileSync(docPath, 'utf8')) : null;
  if (ledger === null) addFail(r, `numerals list missing: write ${docPath} ('- 10: housing', one reference character per line, names from the description)`);
  else addInfo(r, `numerals list: ${ledger.size} entries in ${docPath}`);
  return { ledger, docPath };
}

function boxesOf(M: Manifest): TextBox[] {
  const out: TextBox[] = [];
  for (const t of M.texts) out.push({ s: t.s, halo: t.halo, rotate: t.rotate, box: t.box });
  return out;
}

function writeTexts(T: TextItem[], kinds: Kinds, out: string): void {
  const lines: string[] = [];
  for (const t of T) lines.push(`${kinds.get(t) ?? ''}\t${t.size.toFixed(1)}pt\t${capMM(t).toFixed(2)}mm\t${t.s}`);
  writeFileSync(join(out, 'onscreen-text.txt'), lines.join('\n') + '\n');
}

export async function patentGate(cdp: Cdp, M: Manifest, figAbs: string, out: string, r: Report): Promise<void> {
  const P = M.patent;
  if (P === null) throw new Error('patent figure without patent info');
  const T: TextItem[] = [];
  for (const t of M.texts) if (t.s.trim()) T.push(t);
  checkSheet(M, P, T, r);
  const { ledger, docPath } = loadLedger(P, figAbs, r);
  const kinds = classify(T, ledger);
  checkHeights(T, kinds, r);
  checkLabels(T, kinds, r);
  checkRefChars(T, kinds, ledger, docPath, r);
  checkLegendsAndStrokes(T, kinds, M, r);
  relationProblems(M, r);
  const arg: PatentArg = { W: M.W, H: M.H, sight: P.sight, texts: boxesOf(M) };
  reportDom(parsePatentResult(await cdp.evaluate(`window.schemTools.patentChecks(${JSON.stringify(arg)})`)), P.sight, r);
  writeTexts(T, kinds, out);
}

function checkLegendsAndStrokes(T: TextItem[], kinds: Kinds, M: Manifest, r: Report): void {
  checkLegends(T, kinds, r);
  checkPatentStrokes(M, r);
  checkPatentOverlap(T, r);
}
