// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/view.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, evalNumber, launch, openBlank, optNum, optStr, parseArgs, screenshot, serve, shutdown } from './lib/cdp.ts';
import { describeError, numList } from './lib/guards.ts';

const A = parseArgs();
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dataUrl(p: string): string {
  const f = resolve(p);
  if (!existsSync(f)) {
    console.error('image not found: ' + f);
    process.exit(2);
  }
  const mime = /\.jpe?g$/i.test(f) ? 'image/jpeg' : /\.svg$/i.test(f) ? 'image/svg+xml' : 'image/png';
  return `data:${mime};base64,` + readFileSync(f).toString('base64');
}

function imageList(): string[] {
  const out: string[] = [];
  for (const k of ['img', 'img2']) {
    const v = optStr(A, k);
    if (v !== undefined) out.push(dataUrl(v));
  }
  return out;
}

async function main(): Promise<void> {
  const [cx = 0, cy = 0, cw = 1, ch = 1] = numList(optStr(A, 'crop') ?? '0,0,1,1');
  const W = optNum(A, 'w', 1400);
  const outPath = optStr(A, 'out');
  if (outPath === undefined) throw new Error('usage: --img a.png [--img2 b.png] --crop "x,y,w,h" --out file.png [--w 1400]');
  const srcs = imageList();
  const bundle = await buildBundle(ROOT, null);
  const server = await serve(ROOT, null, bundle);
  const port = server.port;
  const cdp = await launch();
  try {
    await openBlank(cdp, port);
    const H = await evalNumber(cdp, `window.schemTools.stackImages(${JSON.stringify(srcs)}, ${W}, ${cx}, ${cy}, ${cw}, ${ch})`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), await screenshot(cdp, { x: 0, y: 0, w: W, h: H }));
    console.log('wrote', outPath, W, 'x', H);
  } catch (e) {
    console.error(describeError(e));
    process.exitCode = 1;
  } finally {
    shutdown(cdp, server);
  }
}

await main();
