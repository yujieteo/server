// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/lib/cdp.mjs
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { once } from 'node:events';
import { setInterval as every } from 'node:timers/promises';
import { asNumber, asString, describeError, field, isRecord } from './guards.ts';
import { parseManifest } from './manifest.ts';
import type { Manifest } from './manifest.ts';

const MIME: Record<string, string> = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2',
};
const BUNDLE_URL = '/__bundle/';

function chromeCandidates(): string[] {
  const env = process.env;
  const roots = [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env['LOCALAPPDATA'], 'C:/Program Files', 'C:/Program Files (x86)'];
  const out: string[] = [];
  for (const p of roots) {
    if (p === undefined || p === '') continue;
    out.push(`${p}/Google/Chrome/Application/chrome.exe`, `${p}/Microsoft/Edge/Application/msedge.exe`, `${p}/Chromium/Application/chrome.exe`);
  }
  out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  out.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  const pw = env['PLAYWRIGHT_BROWSERS_PATH'];
  if (pw !== undefined && pw !== '') out.push(`${pw}/chromium`);
  const dirs = (env['PATH'] ?? '').split(process.platform === 'win32' ? ';' : ':');
  for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    for (const d of dirs) out.push(join(d, n));
  }
  return out;
}

export function findChrome(): string {
  const set = process.env['CHROME'];
  if (set !== undefined && set !== '') return set;
  for (const c of chromeCandidates()) if (existsSync(c)) return c;
  throw new Error('No Chromium browser found (Chrome, Edge or Chromium). Install one or set CHROME to its executable.');
}

export interface StaticServer {
  port: number;
  srv: Server;
}

interface Routes {
  root: string;
  proj: string | null;
  bundle: Bundle | null;
}

let routes: Routes = { root: '', proj: null, bundle: null };

function resolveFile(u: string): string | null {
  if (u.startsWith(BUNDLE_URL)) return join(routes.bundle?.dir ?? '', u.slice(BUNDLE_URL.length));
  let base = routes.root;
  const proj = routes.proj;
  const foundationOnly = u.startsWith('/engine/') || u.startsWith('/fonts/');
  if (proj !== null && !foundationOnly && existsSync(normalize(join(proj, u)))) base = proj;
  const f = normalize(join(base, u));
  return f.startsWith(base) ? f : null;
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const u = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  const f = resolveFile(u);
  if (f === null || !existsSync(f)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(u === '/engine/page.html' ? pageHtml(f) : readFileSync(f));
}

function pageHtml(f: string): string {
  const b = routes.bundle;
  const html = readFileSync(f, 'utf8');
  if (b === null) return html;
  return html.replace(`${BUNDLE_URL}page.js`, `${BUNDLE_URL}${b.pageJs}`).replace(`${BUNDLE_URL}inpage.js`, `${BUNDLE_URL}${b.toolsJs}`);
}

export function serve(root: string, projectRoot: string | null, bundle: Bundle | null): Promise<StaticServer> {
  routes = { root: resolve(root), proj: projectRoot === null ? null : resolve(projectRoot), bundle };
  return listen(createServer(handle));
}

async function listen(srv: Server): Promise<StaticServer> {
  srv.listen(0, '127.0.0.1');
  await once(srv, 'listening');
  const a = srv.address();
  if (a === null || typeof a === 'string') throw new Error('server has no port');
  return { srv, port: a.port };
}

export interface Session {
  ws: WebSocket;
  proc: ChildProcess;
  profile: string;
  port: string;
}

const replies = new Map<number, unknown>();
let nextId = 0;
const bundleDirs: string[] = [];

function onMessage(e: MessageEvent): void {
  const m: unknown = JSON.parse(String(e.data));
  if (isRecord(m) && typeof m['id'] === 'number') replies.set(m['id'], m);
}

let debugPort = '';

async function pumpStderr(proc: ChildProcess): Promise<void> {
  if (proc.stderr === null) return;
  for await (const b of proc.stderr) {
    const m = /ws:\/\/[^:]+:(\d+)\//.exec(String(b));
    if (m !== null && m[1] !== undefined) debugPort = m[1];
  }
}

async function startChrome(): Promise<Session> {
  const profile = mkdtempSync(join(tmpdir(), 'schem-cdp-'));
  debugPort = '';
  const proc = spawn(findChrome(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none', '--no-proxy-server', 'about:blank']);
  void pumpStderr(proc);
  let waited = 0;
  for await (const tick of every(50, 1)) {
    waited += tick;
    if (debugPort !== '' || waited >= 400) break;
  }
  if (debugPort === '') throw new Error('chrome did not start');
  const targets: unknown = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  let url = '';
  if (Array.isArray(targets)) {
    for (const t of targets) if (isRecord(t) && t['type'] === 'page') { url = asString(t['webSocketDebuggerUrl']); break; }
  }
  const ws = new WebSocket(url);
  ws.addEventListener('message', onMessage);
  await once(ws, 'open');
  return { ws, proc, profile, port: debugPort };
}

async function call(s: Session, method: string, params: Record<string, unknown>): Promise<unknown> {
  const id = ++nextId;
  s.ws.send(JSON.stringify({ id, method, params }));
  for await (const tick of every(1, id)) {
    if (replies.has(tick)) break;
  }
  const m = replies.get(id);
  replies.delete(id);
  const err = field(m, 'error');
  if (err !== undefined) throw new Error(`${method}: ${asString(field(err, 'message'))}`);
  return field(m, 'result');
}

function closeSession(s: Session): void {
  try { s.ws.close(); } catch (e) { process.stderr.write(`ws close: ${describeError(e)}\n`); }
  s.proc.stderr?.destroy();
  s.proc.kill();
  s.proc.unref();
  rmSync(s.profile, { recursive: true, force: true });
}

export class Cdp {
  private readonly session: Session;

  constructor(session: Session) {
    this.session = session;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return call(this.session, method, params);
  }

  async evaluate(expression: string): Promise<unknown> {
    const r = await call(this.session, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return field(field(r, 'result'), 'value');
  }

  close(): void {
    closeSession(this.session);
  }
}

export async function launch(): Promise<Cdp> {
  return new Cdp(await startChrome());
}

export interface Bundle {
  dir: string;
  pageJs: string;
  toolsJs: string;
  figUrl: string | null;
}

function commonDir(paths: string[]): string {
  let parts: string[] = [];
  for (let i = 0; i < paths.length; i++) {
    const p = dirname(resolve(paths[i] ?? '')).split(sep);
    if (i === 0) { parts = p; continue; }
    let n = 0;
    while (n < parts.length && n < p.length && parts[n] === p[n]) n++;
    parts = parts.slice(0, n);
  }
  return parts.join(sep) === '' ? sep : parts.join(sep);
}

function bundleErrors(e: unknown): string {
  if (e instanceof AggregateError) {
    const msgs: string[] = [];
    for (const x of e.errors) msgs.push(describeError(x));
    return msgs.join('\n');
  }
  return describeError(e);
}

function outName(root: string, entry: string): string {
  return relative(root, entry).split(sep).join('/').replace(/\.[cm]?[jt]sx?$/, '.js');
}

export async function buildBundle(foundation: string, figAbs: string | null): Promise<Bundle> {
  const page = join(resolve(foundation), 'engine', 'page.ts');
  const tools = join(resolve(foundation), 'tools', 'lib', 'inpage.ts');
  const entries = figAbs === null ? [page, tools] : [page, tools, resolve(figAbs)];
  const root = commonDir(entries);
  const dir = mkdtempSync(join(tmpdir(), 'schem-bundle-'));
  bundleDirs.push(dir);
  try {
    await Bun.build({ entrypoints: entries, splitting: true, target: 'browser', outdir: dir, root });
  } catch (e) {
    throw new Error(`bundle failed\n${bundleErrors(e)}`, { cause: e });
  }
  const fig = figAbs === null ? null : `${BUNDLE_URL}${outName(root, resolve(figAbs))}`;
  return { dir, pageJs: outName(root, page), toolsJs: outName(root, tools), figUrl: fig };
}

async function waitDone(cdp: Cdp): Promise<void> {
  let waited = 0;
  for await (const tick of every(50, 1)) {
    waited += tick;
    if (waited >= 1600 || await cdp.evaluate('window.schemDone === true') === true) break;
  }
}

export async function openBlank(cdp: Cdp, port: number): Promise<void> {
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/engine/page.html?v=${Date.now()}` });
  await waitDone(cdp);
}

export interface LoadOptions {
  dpi?: number;
  transparent?: boolean;
}

export interface Loaded {
  manifest: Manifest | null;
  error: string | null;
}

async function fitViewport(cdp: Cdp, m: Manifest, scale: number, transparent: boolean): Promise<void> {
  const wpx = Math.ceil(m.widthMM * 96 / 25.4), hpx = Math.ceil(m.heightMM * 96 / 25.4);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: wpx, height: hpx, deviceScaleFactor: scale, mobile: false });
  if (!transparent) return;
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp.evaluate('window.schemTools.makeTransparent()');
}

export async function loadFigure(cdp: Cdp, port: number, bundle: Bundle, opts: LoadOptions = {}): Promise<Loaded> {
  const scale = (opts.dpi ?? 96) / 96;
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: scale, mobile: false });
  const url = `http://127.0.0.1:${port}/engine/page.html?fig=${encodeURIComponent(bundle.figUrl ?? '')}&v=${Date.now()}`;
  await cdp.send('Page.navigate', { url });
  await waitDone(cdp);
  const err = await cdp.evaluate('window.schemError || null');
  if (typeof err === 'string') return { manifest: null, error: err };
  const manifest = parseManifest(await cdp.evaluate('window.schemManifest'));
  await fitViewport(cdp, manifest, scale, opts.transparent === true);
  return { manifest, error: null };
}

export interface ShotOptions {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scale?: number;
}

export async function screenshot(cdp: Cdp, o: ShotOptions = {}): Promise<Buffer> {
  const clip = o.w === undefined ? undefined : { x: o.x ?? 0, y: o.y ?? 0, width: o.w, height: o.h ?? 0, scale: o.scale ?? 1 };
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true, fromSurface: true });
  return Buffer.from(asString(field(r, 'data')), 'base64');
}

export async function evalString(cdp: Cdp, expression: string): Promise<string> {
  return asString(await cdp.evaluate(expression));
}

export async function evalNumber(cdp: Cdp, expression: string): Promise<number> {
  return asNumber(await cdp.evaluate(expression));
}

export interface Args {
  rest: string[];
  opts: Record<string, string | true>;
}

export function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const o: Args = { rest: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (!a.startsWith('--')) { o.rest.push(a); continue; }
    const next = argv[i + 1];
    if (next !== undefined && next !== '' && !next.startsWith('--')) { o.opts[a.slice(2)] = next; i++; } else o.opts[a.slice(2)] = true;
  }
  return o;
}

export function optStr(a: Args, key: string): string | undefined {
  const v = a.opts[key];
  return typeof v === 'string' ? v : undefined;
}

export function optNum(a: Args, key: string, fallback: number): number {
  const v = a.opts[key];
  return v === undefined ? fallback : +v;
}

export function hasFlag(a: Args, key: string): boolean {
  const v = a.opts[key];
  return v !== undefined;
}

export function shutdown(cdp: Cdp | null, srv: StaticServer | null): never {
  if (cdp !== null) cdp.close();
  if (srv !== null) srv.srv.close();
  for (const d of bundleDirs) rmSync(d, { recursive: true, force: true });
  const code = process.exitCode;
  process.exit(typeof code === 'number' ? code : 0);
}
