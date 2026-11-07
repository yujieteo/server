// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/compare.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Each } from './lib/each.ts';
import { buildBundle, evalNumber, launch, openBlank, optNum, optStr, parseArgs, screenshot, serve, shutdown } from './lib/cdp.ts';
import type { Cdp } from './lib/cdp.ts';
import { asArray, asNumber, asRecord, describeError, field, numList } from './lib/guards.ts';

const A = parseArgs();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const refArg = optStr(A, 'ref'), imgArg = optStr(A, 'img');
const gridSpec = numList((optStr(A, 'grid') ?? '3x2').split('x').join(','));
const GC = gridSpec[0] ?? 3, GR = gridSpec[1] ?? 2;
const W = optNum(A, 'w', 1600);
const out = resolve(optStr(A, 'out') ?? 'docs/compare');

function rel(p: string): string {
  return '/' + relative(ROOT, resolve(p)).split('\\').join('/');
}

async function shot(cdp: Cdp, srcs: string[], crop: number[], name: string): Promise<void> {
  const H = await evalNumber(cdp, `window.schemTools.compareShot(${W}, ${JSON.stringify(crop)}, ${JSON.stringify(srcs)})`);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await sleep(150);
  writeFileSync(join(out, name), await screenshot(cdp, { x: 0, y: 0, w: W, h: H }));
}

interface Stat {
  sat: number;
  lum: number;
  ink: number;
}

function parseStat(v: unknown): Stat {
  return { sat: asNumber(field(v, 'sat')), lum: asNumber(field(v, 'lum')), ink: asNumber(field(v, 'ink')) };
}

function printRow(key: string, a: Stat, b: Stat): void {
  const star = Math.abs(b.sat - a.sat) > 0.1 ? ' *' : '  ';
  console.log(`${key}  ${a.sat.toFixed(2)} -> ${b.sat.toFixed(2)}${star}      ${a.lum.toFixed(2)} -> ${b.lum.toFixed(2)}          ${a.ink.toFixed(2)} -> ${b.ink.toFixed(2)}`);
}

async function stats(cdp: Cdp, ref: string, img: string): Promise<void> {
  const raw = await cdp.evaluate(`window.schemTools.compareStats(${JSON.stringify(ref)}, ${JSON.stringify(img)}, ${GR}, ${GC})`);
  writeFileSync(join(out, 'stats.json'), JSON.stringify(raw, null, 1));
  console.log('cell    sat ref -> render   lum ref -> render   ink ref -> render');
  for (const [key, pair] of Object.entries(asRecord(raw))) {
    const p = asArray(pair);
    printRow(key, parseStat(p[0]), parseStat(p[1]));
  }
  console.log(`wrote ${out}/full.png and ${GR * GC} cells (* = saturation differs by more than 0.10)`);
}

function cells(): [number, number][] {
  const list: [number, number][] = [];
  for (let r = 0; r < GR; r++) {
    for (let c = 0; c < GC; c++) list.push([r, c]);
  }
  return list;
}

async function main(): Promise<void> {
  if (refArg === undefined || imgArg === undefined) throw new Error('usage: --ref reference.png --img render.png [--grid 3x2] [--out dir] [--w 1600]');
  mkdirSync(out, { recursive: true });
  const bundle = await buildBundle(ROOT, null);
  const server = await serve(ROOT, null, bundle);
  const port = server.port;
  const cdp = await launch();
  try {
    await openBlank(cdp, port);
    const srcs = [rel(refArg), rel(imgArg)];
    await shot(cdp, srcs, [0, 0, 1, 1], 'full.png');
    for await (const [r, c] of new Each(cells())) await shot(cdp, srcs, [c / GC, r / GR, 1 / GC, 1 / GR], `cell-${r + 1}-${c + 1}.png`);
    await stats(cdp, srcs[0] ?? '', srcs[1] ?? '');
  } catch (e) {
    console.error(describeError(e));
    process.exitCode = 1;
  } finally {
    shutdown(cdp, server);
  }
}

await main();
