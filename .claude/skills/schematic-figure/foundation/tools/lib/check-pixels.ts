import { addInfo, addWarn } from './report.ts';
import type { Ctx } from './check-ctx.ts';
import { heroLine } from './check-heroline.ts';
import { parseLeaderResult, parsePixelResult, parseStyleProbe } from './check-types.ts';
import type { PanelBox, StyleProbe, TextBox } from './check-types.ts';
import type { Cdp } from './cdp.ts';
import type { PanelItem, TextItem } from './manifest.ts';

const HOLE = 0.18;

function textBoxes(L: TextItem[]): TextBox[] {
  const out: TextBox[] = [];
  for (const t of L) out.push({ s: t.s, halo: t.halo, rotate: t.rotate, box: t.box });
  return out;
}

function panelBoxes(L: PanelItem[]): PanelBox[] {
  const out: PanelBox[] = [];
  for (const p of L) out.push({ x: p.x, y: p.y, w: p.w, h: p.h, label: p.label });
  return out;
}

export async function checkPixels(c: Ctx, cdp: Cdp): Promise<void> {
  const { M, r } = c;
  const arg = { W: M.W, H: M.H, texts: textBoxes(M.texts), panels: panelBoxes(M.panels) };
  const px = parsePixelResult(await cdp.evaluate(`window.schemTools.pixelChecks(${JSON.stringify(arg)})`));
  if (px.busy.length) {
    const parts: string[] = [];
    for (const [s, d] of px.busy.slice(0, 8)) parts.push(`${JSON.stringify(s)} ${d}`);
    addWarn(r, `text over busy art (use a halo, move it, or add a leader line): ${parts.join(', ')}`);
  }
  addInfo(r, `ink coverage ${(px.ink * 100).toFixed(1)}% of the page (calibration: see reference/style.md)`);
  const hs: string[] = [];
  const big: string[] = [];
  for (const [l, f, s] of px.holes) {
    hs.push(`${l} ${f}`);
    if (f > HOLE) big.push(`${l} (${Math.round(f * 100)}% of the panel, ${(s / 72 * 25.4).toFixed(0)} mm square)`);
  }
  addInfo(r, `largest empty square per panel (share of panel area): ${hs.join(', ')}`);
  if (big.length && !c.rep && M.format === 'journal') addWarn(r, `large empty area in panel ${big.join(', ')}: enlarge the main art, move a neighbour in, or shrink the panel`);
}

export function checkHero(c: Ctx, figAbs: string): void {
  if (c.rep || c.M.format !== 'journal' || c.M.images.length) return;
  const hl = heroLine(figAbs);
  if (!hl.none && !hl.routed) addWarn(c.r, 'no rendered hero: render the hero object in Blender (blender/bio3d.py, device3d.py, apparatus3d.py), name the route in a "Hero:" line (vector 3D, lightScene3, Blender, illustrated finish), or write "Hero: none, <reason>" in docs/spec.md or as a "// Hero: none, <reason>" comment in the figure file');
}

function anyPart(st: StyleProbe, re: RegExp): boolean {
  for (const p of st.parts) if (re.test(p)) return true;
  return false;
}

export async function checkRoute(c: Ctx, cdp: Cdp, figAbs: string): Promise<StyleProbe> {
  const st = parseStyleProbe(await cdp.evaluate('window.schemTools.styleProbe()'));
  if (c.M.format === 'patent') return st;
  const has3d = anyPart(st, /^(oblique-box|cylinder(-body)?|prism(-side|-top)?|box-back|tray|tube-array|wire-box|wheel)$/);
  const hasBeam = anyPart(st, /^beam/);
  const hasScene = anyPart(st, /^(light-scene|surface-.*|.*through-glass|lens-(face|rim))$/);
  if (has3d && hasBeam && !hasScene) addWarn(c.r, 'oblique 3D parts and beams, but no L.lightScene3 scene: beams drawn as flat polygons look the same in front of, through and beside glass (SKILL.md step 7, "Light meets 3D parts")');
  if (has3d && !st.illustrate) addWarn(c.r, '3D parts without the illustrated finish: set illustrate: true in the figure export, or say in docs/spec.md why the figure stays flat (SKILL.md step 7)');
  const hl = heroLine(figAbs);
  if (hl.spec && !hl.has) addWarn(c.r, 'docs/spec.md and the figure file have no "Hero:" line: write "Hero: <object>, rendered with <kit function>" or "Hero: none, <reason>", and report the drawing route to the user (SKILL.md step 3)');
  return st;
}

export function checkSpill(c: Ctx, own: (string | null)[]): void {
  const { M } = c;
  const spill: string[] = [];
  for (let i = 0; i < M.texts.length; i++) {
    const t = M.texts[i], lab = own[i];
    if (t === undefined || lab === undefined || lab === null || !t.s.trim() || t.rotate) continue;
    let P: PanelItem | undefined;
    for (const q of M.panels) if (q.label === lab) { P = q; break; }
    if (P === undefined) continue;
    const b = t.box, tol = 0.5;
    if (b.x >= P.x - tol && b.y >= P.y - tol && b.x + b.w <= P.x + P.w + tol && b.y + b.h <= P.y + P.h + tol) continue;
    for (const q of M.panels) {
      if (q === P) continue;
      if (Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x) > 1 && Math.min(b.y + b.h, q.y + q.h) - Math.max(b.y, q.y) > 1) {
        spill.push(`${JSON.stringify(t.s.slice(0, 24))} (panel ${lab === '' ? '?' : lab} into panel ${q.label === null || q.label === '' ? '?' : q.label})`);
        break;
      }
    }
  }
  if (spill.length) addWarn(c.r, `text crosses its panel's bounds into another panel (${spill.length}): ${spill.slice(0, 8).join(', ')}${spill.length > 8 ? ` (+${spill.length - 8})` : ''}. Shorten the label, move it, or widen its panel`);
}

export async function checkLeaders(c: Ctx, cdp: Cdp): Promise<void> {
  const res = parseLeaderResult(await cdp.evaluate(`window.schemTools.leaderCheck(${JSON.stringify(textBoxes(c.M.texts))})`));
  if (res.err !== null) addInfo(c.r, 'leader check did not run: ' + res.err);
  if (res.nLines) addInfo(c.r, `leader lines checked for crossings: ${res.nLines}`);
  const lead = res.found;
  if (!lead.length) return;
  const parts: string[] = [];
  for (const f of lead.slice(0, 6)) {
    const what = f.kind === 'label' ? 'the label ' + JSON.stringify(f.what) : 'a shape (' + f.what + ')';
    parts.push(`${JSON.stringify(f.leader.slice(0, 24))} runs through ${what} at ${mmOf(f.x)}, ${mmOf(f.y)} mm`);
  }
  addWarn(c.r, `leader line crosses another drawn object (${lead.length}): ${parts.join('; ')}${lead.length > 6 ? ` (+${lead.length - 6})` : ''}. Move the label, bend the leader (elbow), or point it at a part that is not behind another`);
}

function mmOf(v: number): string {
  return (v / 72 * 25.4).toFixed(0);
}
