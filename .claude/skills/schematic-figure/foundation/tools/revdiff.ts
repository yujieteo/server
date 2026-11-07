// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/revdiff.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, launch, openBlank, optNum, optStr, parseArgs, serve, shutdown } from './lib/cdp.ts';
import { asArray, asNumber, asRecord, asString, describeError, field, numList } from './lib/guards.ts';

const A = parseArgs();
const beforeArg = optStr(A, 'before'), afterArg = optStr(A, 'after'), outArg = optStr(A, 'out');
if (beforeArg === undefined || afterArg === undefined || outArg === undefined) {
  console.error('usage: --before a.png --after b.png [--allow "x,y,w,h;..."] --out diff.png [--tol 32] [--root <figure folder>]');
  process.exit(2);
}
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootOpt = optStr(A, 'root');
const PROJ = rootOpt === undefined ? null : resolve(rootOpt);
const tol = optNum(A, 'tol', 32);

function rel(p: string): string {
  const r = relative(PROJ ?? ROOT, resolve(p)).split('\\').join('/');
  if (r.startsWith('..')) throw new Error(p + ' must be inside the project folder');
  return '/' + r;
}

function allowRegions(): number[][] {
  const out: number[][] = [];
  for (const s of (optStr(A, 'allow') ?? '').split(';')) if (s.trim() !== '') out.push(numList(s));
  return out;
}

interface Hot {
  region: number[];
  changed: number;
}

function numbers(v: unknown): number[] {
  const out: number[] = [];
  for (const x of asArray(v)) out.push(asNumber(x));
  return out;
}

function parseHot(v: unknown): Hot[] {
  const out: Hot[] = [];
  for (const h of asArray(v)) out.push({ region: numbers(field(h, 'region')), changed: asNumber(field(h, 'changed')) });
  return out;
}

function aspect(s: number[]): number {
  return (s[0] ?? 1) / (s[1] ?? 1);
}

function report(raw: Record<string, unknown>, before: number[], after: number[], hot: Hot[]): void {
  const sizeChanged = before[0] !== after[0] || before[1] !== after[1];
  const aspectChanged = Math.abs(aspect(before) / aspect(after) - 1) > 0.002;
  const outsidePct = asNumber(raw['outsidePct']);
  writeFileSync(resolve(outArg ?? '').replace(/\.png$/, '') + '.json', JSON.stringify({ ...raw, sizeChanged, aspectChanged }, null, 1));
  if (aspectChanged) console.log(`SIZE: the figure's shape changed (${before.join('x')} -> ${after.join('x')}); every position moved. Was a resize asked for?`);
  else if (sizeChanged) console.log(`size: rendered at a different resolution (${before.join('x')} -> ${after.join('x')}); compared after scaling.`);
  console.log(`outside the allowed regions: ${outsidePct.toFixed(3)}% of pixels changed; inside: ${asNumber(raw['insidePct']).toFixed(1)}%.`);
  for (const h of hot) console.log(`  changed ${h.changed}% in region ${h.region.join(',')}`);
  console.log(outsidePct > 0.05 || aspectChanged
    ? 'SCOPE: changes outside what was asked. Look at the red in ' + outArg + ' and undo each one the user did not ask for, or say why it was needed.'
    : 'scope: clean (nothing outside the allowed regions changed).');
  console.log('wrote', outArg);
}

async function main(): Promise<void> {
  const bundle = await buildBundle(ROOT, null);
  const server = await serve(ROOT, PROJ, bundle);
  const port = server.port;
  const cdp = await launch();
  try {
    await openBlank(cdp, port);
    const call = `window.schemTools.diffImages(${JSON.stringify(rel(beforeArg ?? ''))}, ${JSON.stringify(rel(afterArg ?? ''))}, ${JSON.stringify(allowRegions())}, ${tol})`;
    const res = asRecord(await cdp.evaluate(call));
    mkdirSync(dirname(resolve(outArg ?? '')), { recursive: true });
    writeFileSync(resolve(outArg ?? ''), Buffer.from(asString(res['png']), 'base64'));
    const { png, ...rest } = res;
    void png;
    report(rest, numbers(res['before']), numbers(res['after']), parseHot(res['hot']));
  } catch (e) {
    console.error(describeError(e));
    process.exitCode = 1;
  } finally {
    shutdown(cdp, server);
  }
}

await main();
