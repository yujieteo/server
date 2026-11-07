// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/render.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Each } from './lib/each.ts';
import { buildBundle, evalString, hasFlag, launch, loadFigure, optNum, optStr, parseArgs, screenshot, serve, shutdown } from './lib/cdp.ts';
import type { Bundle, Cdp } from './lib/cdp.ts';
import { describeError, numList } from './lib/guards.ts';
import type { Manifest } from './lib/manifest.ts';

const A = parseArgs();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootOpt = optStr(A, 'root');
const PROJ = rootOpt === undefined ? null : resolve(rootOpt);
const figAbs = resolve(optStr(A, 'fig') ?? 'figure/figure.ts');
const out = resolve(optStr(A, 'out') ?? join(dirname(figAbs), 'out'));
const dpi = optNum(A, 'dpi', hasFlag(A, 'quick') ? 300 : 600);
const thumb = optNum(A, 'thumb', 360);
const transparent = hasFlag(A, 'transparent');

interface Job {
  cdp: Cdp;
  port: number;
  bundle: Bundle;
}

async function writeSvg(job: Job, name: string, files: string[]): Promise<void> {
  const svg = await evalString(job.cdp, 'window.schemTools.exportSvg()');
  writeFileSync(join(out, `${name}.svg`), svg);
  files.push(`${name}.svg`);
}

async function writePdf(job: Job, M: Manifest, files: string[]): Promise<void> {
  const r = await job.cdp.send('Page.printToPDF', { paperWidth: M.widthMM / 25.4, paperHeight: M.heightMM / 25.4, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, pageRanges: '1', preferCSSPageSize: true });
  writeFileSync(join(out, `${M.name}.pdf`), Buffer.from(dataOf(r), 'base64'));
  files.push(`${M.name}.pdf`);
}

function dataOf(r: unknown): string {
  if (typeof r === 'object' && r !== null && 'data' in r && typeof r.data === 'string') return r.data;
  throw new Error('no data in reply');
}

async function writeCrops(job: Job, name: string, crop: string, files: string[]): Promise<Manifest> {
  const cdpi = optNum(A, 'crop-dpi', 900);
  const loaded = await loadFigure(job.cdp, job.port, job.bundle, { dpi: cdpi, transparent });
  if (loaded.manifest === null) throw new Error(loaded.error ?? 'figure did not load');
  const px = 96 / 25.4;
  let k = 0;
  for await (const c of new Each(crop.split(';'))) {
    const [x = 0, y = 0, w = 0, h = 0] = numList(c);
    k++;
    writeFileSync(join(out, `${name}-crop-${k}.png`), await screenshot(job.cdp, { x: x * px, y: y * px, w: w * px, h: h * px, scale: 1 }));
    files.push(`${name}-crop-${k}.png (${c} mm @ ${cdpi} dpi)`);
  }
  return loaded.manifest;
}

async function writeOutputs(job: Job, M0: Manifest): Promise<void> {
  const name = M0.name;
  let M = M0;
  writeFileSync(join(out, `${name}.png`), await screenshot(job.cdp));
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(M, null, 1));
  const files = [`${name}.png (${dpi} dpi)`];
  const quick = hasFlag(A, 'quick');
  if (!quick && !hasFlag(A, 'no-svg')) await writeSvg(job, name, files);
  if (!quick && !hasFlag(A, 'no-pdf')) await writePdf(job, M, files);
  const crop = optStr(A, 'crop');
  if (crop !== undefined) M = await writeCrops(job, name, crop, files);
  const tdpi = thumb / (M.widthMM / 25.4);
  await loadFigure(job.cdp, job.port, job.bundle, { dpi: tdpi, transparent });
  writeFileSync(join(out, `${name}-thumb.png`), await screenshot(job.cdp));
  files.push(`${name}-thumb.png (${thumb} px wide)`);
  const lines: string[] = [];
  for (const f of files) lines.push(join(out, f));
  console.log(`rendered ${name}: ${M.widthMM} x ${M.heightMM} mm, ${M.texts.length} text items, ${M.strokes.length} strokes\n  ` + lines.join('\n  '));
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const bundle = await buildBundle(ROOT, figAbs);
  const server = await serve(ROOT, PROJ, bundle);
  const port = server.port;
  const cdp = await launch();
  try {
    const job = { cdp, port, bundle };
    const { manifest, error } = await loadFigure(cdp, port, bundle, { dpi, transparent });
    if (manifest === null) {
      console.error('FIGURE ERROR\n' + (error ?? ''));
      process.exitCode = 1;
    } else await writeOutputs(job, manifest);
  } catch (e) {
    console.error(describeError(e));
    process.exitCode = 1;
  } finally {
    shutdown(cdp, server);
  }
}

await main();
