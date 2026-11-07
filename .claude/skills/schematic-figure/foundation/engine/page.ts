import * as L from './lib.ts';

declare global {
  interface Window {
    schemDone?: boolean;
    schemError?: string;
    schemManifest?: unknown;
    schemFigure?: unknown;
  }
}

interface FigureModule {
  figure: object;
  draw: unknown;
}

interface Draw {
  (F: unknown, lib: typeof L): unknown;
}

function isDraw(v: unknown): v is Draw {
  return typeof v === 'function';
}

function describe(e: unknown): string {
  return e instanceof Error ? (e.stack ?? e.message) : String(e);
}

async function loadModule(url: string): Promise<FigureModule> {
  const mod: unknown = await import(url);
  if (typeof mod !== 'object' || mod === null) throw new Error('figure module has no exports');
  const spec: unknown = 'figure' in mod ? mod.figure : {};
  const draw: unknown = 'default' in mod ? mod.default : undefined;
  return { figure: typeof spec === 'object' && spec !== null ? spec : {}, draw };
}

async function run(url: string): Promise<void> {
  const host = document.getElementById('host');
  if (host === null) throw new Error('no #host');
  const mod = await loadModule(url);
  const F = L.createFigure(host, mod.figure);
  window.schemFigure = F;
  if (!isDraw(mod.draw)) throw new Error('figure module has no default export');
  await mod.draw(F, L);
  await document.fonts.ready;
  document.head.insertAdjacentHTML('beforeend', `<style>@page{size:${F.widthMM}mm ${F.heightMM}mm}</style>`);
  window.schemManifest = L.manifest(F);
}

async function main(): Promise<void> {
  const url = new URLSearchParams(location.search).get('fig');
  try {
    if (url !== null && url !== '') await run(url);
  } catch (e) {
    window.schemError = describe(e);
  }
  window.schemDone = true;
}

await main();
