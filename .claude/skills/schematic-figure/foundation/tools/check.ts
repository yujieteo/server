// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/check.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, hasFlag, launch, loadFigure, optStr, parseArgs, serve, shutdown } from './lib/cdp.ts';
import type { Bundle, Cdp, StaticServer } from './lib/cdp.ts';
import { FORMATS, JOURNAL } from './lib/check-ctx.ts';
import type { Ctx } from './lib/check-ctx.ts';
import { checkAnchors, checkImages, checkRelations, checkStrokes } from './lib/check-geom.ts';
import { checkHero, checkLeaders, checkPixels, checkRoute, checkSpill } from './lib/check-pixels.ts';
import { checkPage, checkText } from './lib/check-text.ts';
import { describeError } from './lib/guards.ts';
import type { Manifest, TextItem } from './lib/manifest.ts';
import { patentGate } from './lib/patentgate.ts';
import { addFail, addInfo, addWarn, newReport } from './lib/report.ts';
import type { Report } from './lib/report.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function outDir(proj: string | null, figAbs: string, given: string | undefined): string {
  if (given !== undefined) return resolve(given);
  if (proj === null) return join(dirname(figAbs), 'out');
  return join(tmpdir(), 'schem-check', figAbs.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(-80));
}

function makeCtx(M: Manifest, r: Report): Ctx {
  const T: TextItem[] = [];
  for (const t of M.texts) if (t.s.trim()) T.push(t);
  const journal = M.format === null || M.format === '' || M.format === 'journal';
  return { M, r, rep: M.mode === 'replicate', fm: FORMATS[M.format ?? ''] ?? JOURNAL, T, journal };
}

function norm(x: string): string {
  return x.replace(/[\s   ]+/g, '');
}

function checkFacts(c: Ctx, figAbs: string): void {
  const facts = join(dirname(figAbs), '..', 'docs', 'facts.md');
  if (!existsSync(facts)) { addWarn(c.r, 'docs/facts.md missing: every label and number must be sourced'); return; }
  const ledger = norm(readFileSync(facts, 'utf8'));
  const unsourced: string[] = [];
  for (const t of c.T) if (t.role !== 'panel' && t.s.length > 1 && !ledger.includes(norm(t.s))) unsourced.push(JSON.stringify(t.s));
  if (unsourced.length) addWarn(c.r, `on-screen strings not quoted in docs/facts.md: ${unsourced.slice(0, 12).join(', ')}`);
}

function writeTexts(c: Ctx, out: string): void {
  const lines: string[] = [];
  for (const t of c.T) lines.push(`${t.role}\t${t.size.toFixed(1)}pt\t${t.s}`);
  writeFileSync(join(out, 'onscreen-text.txt'), lines.join('\n') + '\n');
}

async function journalChecks(c: Ctx, cdp: Cdp, figAbs: string, out: string, final: boolean): Promise<void> {
  checkPage(c);
  checkText(c);
  checkStrokes(c);
  checkImages(c);
  checkRelations(c);
  checkAnchors(c);
  await checkPixels(c, cdp);
  checkHero(c, figAbs);
  const st = await checkRoute(c, cdp, figAbs);
  checkSpill(c, st.own);
  await checkLeaders(c, cdp);
  writeTexts(c, out);
  if (final) checkFacts(c, figAbs);
}

interface Run {
  cdp: Cdp;
  port: number;
  bundle: Bundle;
  figAbs: string;
  out: string;
  final: boolean;
}

async function runAll(run: Run, r: Report): Promise<void> {
  const t0 = Date.now();
  const { manifest: M, error } = await loadFigure(run.cdp, run.port, run.bundle, { dpi: 192 });
  if (error !== null || M === null) { addFail(r, 'figure threw: ' + (error ?? '').split('\n')[0]); return; }
  addInfo(r, `build ${Date.now() - t0} ms; ${M.widthMM} x ${M.heightMM} mm; ${M.texts.length} texts, ${M.strokes.length} strokes, ${M.images.length} images, ${M.panels.length} panels`);
  if (M.format === 'patent') { await patentGate(run.cdp, M, run.figAbs, run.out, r); return; }
  await journalChecks(makeCtx(M, r), run.cdp, run.figAbs, run.out, run.final);
}

function printReport(r: Report, out: string): void {
  writeFileSync(join(out, 'check.json'), JSON.stringify(r, null, 1));
  for (const m of r.fail) console.log('FAIL ' + m);
  for (const m of r.warn) console.log('WARN ' + m);
  for (const m of r.info) console.log('info ' + m);
  console.log(r.fail.length ? `\nGATE: ${r.fail.length} fail, ${r.warn.length} warn` : `\nGATE: green (${r.warn.length} warn). Green does not mean good: look at the render.`);
  process.exitCode = r.fail.length ? 1 : 0;
}

async function main(): Promise<void> {
  const A = parseArgs();
  const rootOpt = optStr(A, 'root');
  const proj = rootOpt === undefined ? null : resolve(rootOpt);
  const figAbs = resolve(optStr(A, 'fig') ?? 'figure/figure.ts');
  const out = outDir(proj, figAbs, optStr(A, 'out'));
  mkdirSync(out, { recursive: true });
  const r = newReport();
  let srv: StaticServer | null = null;
  let cdp: Cdp | null = null;
  try {
    const bundle = await buildBundle(ROOT, figAbs);
    srv = await serve(ROOT, proj, bundle);
    cdp = await launch();
    await runAll({ cdp, port: srv.port, bundle, figAbs, out, final: hasFlag(A, 'final') }, r);
  } catch (e) {
    addFail(r, 'check crashed: ' + describeError(e));
  }
  printReport(r, out);
  shutdown(cdp, srv);
}

await main();
