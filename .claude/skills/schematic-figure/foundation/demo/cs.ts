// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/cs.js
import type { Figure, FigureOpts, Panel, Point } from '../engine/types.ts';
import * as L from '../engine/lib.ts';
import * as D from '../engine/cs.ts';
import { at } from '../engine/util.ts';

export const figure: FigureOpts = { width: 183, height: 180, name: 'cs' };

const C = L.STYLE.color;
const INK = '#000';
const BW = 1.0;
const U = D.units(L.mm(1));

function ux(v: number): number {
  return D.unitX(U, v);
}

function up(x: number, y: number): Point {
  return D.unitP(U, [x, y]);
}

function encoderInput(F: Figure, a: Panel, conn: L.Handle, cx: number): void {
  D.blockStack(a, cx, 250, 64, [{ name: 'emb', label: 'Input\nEmbedding', h: 20, fill: '#F9D8DC' }], { width: BW, stroke: INK, F });
  L.text(a, cx, 272, 'Inputs', { anchor: 'middle', valign: 'middle', size: 7 });
  D.link(conn, [cx, 264], 'emb.bottom', { F, outline: BW, width: 0.8 });
  D.opNode(a, cx, 216, 4.5, { op: '+', width: 0.7, F, name: 'add' });
  D.sineGlyph(a, cx - 28, 216, 8, { width: 0.7, F, name: 'pe' });
  L.text(a, cx - 38, 216, 'Positional\nEncoding', { anchor: 'end', valign: 'middle', size: 6 });
  D.wire(conn, 'pe.right', 'add.left', { F, width: 1.0, relate: true, kind: 'sum' });
  D.link(conn, 'emb.top', 'add.bottom', { F, outline0: BW, width: 0.8, relate: true });
}

function encoderLayer(F: Figure, a: Panel, conn: L.Handle, cx: number): void {
  D.blockStack(a, cx, 190, 64, [
    { name: 'mha', label: 'Multi-Head\nAttention', h: 22, fill: '#FDDBB0', gap: 4 },
    { name: 'an1', label: 'Add & Norm', h: 10, fill: '#EFF3BE', gap: 20 },
    { name: 'ff', label: 'Feed\nForward', h: 22, fill: '#BDE5F6', gap: 4 },
    { name: 'an2', label: 'Add & Norm', h: 10, fill: '#EFF3BE' },
  ], { width: BW, stroke: INK, F, relate: true, linkWidth: 0.8 });
  D.wire(conn, 'add.top', [cx, 199], { F, width: 1.1 });
  D.fork(conn, [cx, 199], [[cx - 20, 190], [cx, 190], [cx + 20, 190]], { outline: BW, width: 0.8, radius: 3 });
  D.residual(conn, [cx, 203], 'an1.left', { F, outline: BW, width: 0.8, rail: 7, relate: true, relFrom: 'add.top' });
  D.residual(conn, [cx, 147], 'an2.left', { F, outline: BW, width: 0.8, rail: 7, relate: true, relFrom: 'an1.top' });
  D.link(conn, 'an2.top', [cx, 52], { F, outline0: BW, width: 0.8 });
  L.text(a, cx, 44, 'Encoder output', { anchor: 'middle', valign: 'middle', size: 7 });
}

function panelA(F: Figure): void {
  const a = F.panel('a', { x: 1, y: 1, w: 62, h: 98 });
  const cx = 92;
  D.repeatFrame(a, cx - 44, 70, 88, 136, { label: 'N×', labelSide: 'left', r: 7, width: BW, fill: '#F2F2F2' });
  const conn = L.group(a, { part: 'connectors' });
  encoderInput(F, a, conn, cx);
  encoderLayer(F, a, conn, cx);
}

function galleryOps(b: Panel): void {
  const ops = ['+', '×', '⊙', '−', '∥', 'σ'];
  for (let i = 0; i < ops.length; i++) {
    const op = at(ops, i);
    const [x, y] = up(8 + i * 8, 12);
    D.opNode(b, x, y, ux(2.6), { op, width: 0.7 });
    L.text(b, x, y + ux(5), op, { anchor: 'middle', valign: 'middle', size: 5, color: C.mid });
  }
  const g1 = up(14, 30);
  const g2 = up(34, 30);
  D.sineGlyph(b, g1[0], g1[1], ux(5), { lobes: 'sine', width: 0.8 });
  D.sineGlyph(b, g2[0], g2[1], ux(5), { lobes: 'arc', width: 0.8 });
  L.text(b, g1[0], g1[1] + ux(8), "lobes: 'sine'", { anchor: 'middle', valign: 'middle', size: 5 });
  L.text(b, g2[0], g2[1] + ux(8), "lobes: 'arc'", { anchor: 'middle', valign: 'middle', size: 5 });
}

function galleryWires(b: Panel): void {
  const bx = up(28, 50);
  L.rect(b, bx[0], bx[1], ux(20), ux(10), { r: 2, fill: C.tintBlue, stroke: INK, width: 2 });
  L.text(b, bx[0] + ux(10), bx[1] + ux(5), 'outline 2 pt', { anchor: 'middle', valign: 'middle', size: 5 });
  D.link(b, up(8, 53), [bx[0], bx[1] + ux(3)], { outline: 2, width: 0.8 });
  D.wire(b, up(8, 57), [bx[0], bx[1] + ux(7)], { gap1: 1, width: 0.8 });
  L.text(b, ux(8), ux(51.5), 'link', { size: 5 });
  L.text(b, ux(8), ux(59.5), 'wire', { size: 5, valign: 'top' });
  L.text(b, ux(8), ux(66), '2 pt stub, then a routed wire with a dot', { size: 5 });
  D.wire(b, up(8, 68), up(10, 68), { width: 1 });
  D.wire(b, up(12, 68), up(46, 78), { via: D.unitPts(U, [[30, 68], [30, 78]]), radius: 4, dot: true, width: 0.8 });
}

function galleryFork(b: Panel): void {
  const src = up(8, 88);
  D.fork(b, src, [up(20, 82), up(20, 88), up(20, 94)], { order: 'vh', width: 0.7, dot: true });
  L.rect(b, ux(20), ux(80), ux(12), ux(16), { r: 1.5, fill: '#FDDBB0', stroke: INK, width: 0.8 });
  L.text(b, ux(26), ux(88), 'Q K V', { anchor: 'middle', valign: 'middle', size: 5, rotate: -90 });
  L.rect(b, ux(38), ux(84), ux(10), ux(6), { r: 1.2, fill: '#EFF3BE', stroke: INK, width: 0.8 });
  D.link(b, up(43, 97), up(43, 90), { outline: 0.8, width: 0.7 });
  D.residual(b, up(43, 95), up(48, 87), { side: 'right', rail: ux(3), outline: 0.8, width: 0.7 });
}

function panelB(F: Figure): void {
  const b = F.panel('b', { x: 64, y: 1, w: 55, h: 98 });
  galleryOps(b);
  galleryWires(b);
  galleryFork(b);
}

const B = { width: 0, stroke: 'none', size: 5.5 };
const BL = '#C6DAFD';
const GR = '#C3E3BD';
const OR = '#F9CC8B';
const GY = '#D4D7E3';
const TX = 72;
const BX0 = 44;
const BWID = 56;

function ditTrunk(F: Figure, e: Panel, eL: L.Handle): void {
  D.route(eL, [[TX, 236], [TX, 12]], { width: 0.7 });
  D.box(e, BX0, 236, BWID, 14, { ...B, label: 'Input Tokens', fill: GY, F, name: 'tok' });
  D.box(e, BX0, 216, BWID, 12, { ...B, label: 'Layer Norm', fill: BL });
  D.box(e, BX0, 200, BWID, 12, { ...B, label: 'Scale, Shift', fill: BL, F, name: 'ss1' });
  D.box(e, BX0, 172, BWID, 24, { ...B, label: 'Multi-Head\nSelf-Attention', fill: OR });
  D.box(e, BX0, 156, BWID, 12, { ...B, label: 'Scale', fill: BL, F, name: 's1' });
  D.opNode(e, TX, 142, 5.5, { op: '⊕', width: 0.8, F, name: 'add1' });
  D.box(e, BX0, 118, BWID, 12, { ...B, label: 'Layer Norm', fill: BL });
  D.box(e, BX0, 102, BWID, 12, { ...B, label: 'Scale, Shift', fill: BL, F, name: 'ss2' });
  D.box(e, BX0, 74, BWID, 24, { ...B, label: 'Pointwise\nFeedforward', fill: GR });
  D.box(e, BX0, 58, BWID, 12, { ...B, label: 'Scale', fill: BL, F, name: 's2' });
  D.opNode(e, TX, 42, 5.5, { op: '⊕', width: 0.8, F, name: 'add2' });
  D.residual(eL, [TX, 233], 'add1.left', { F, railX: 28, radius: 0, width: 0.7, relate: true, relFrom: 'tok.top' });
  D.residual(eL, [TX, 134], 'add2.left', { F, railX: 28, radius: 0, width: 0.7, relate: true, relFrom: 'add1.top' });
}

function ditBus(F: Figure, e: Panel, eL: L.Handle): void {
  D.box(e, 108, 236, 50, 14, { ...B, label: 'Conditioning', fill: BL, F, name: 'cond' });
  D.box(e, 113, 212, 40, 16, { ...B, label: 'MLP', fill: BL, F, name: 'mlp' });
  D.wire(eL, 'cond.top', 'mlp.bottom', { F, width: 0.7, relate: true });
  const taps: D.BusTap[] = [];
  for (const y of [206, 162, 108, 64]) taps.push({ y, to: BX0 + BWID });
  D.bus(eL, 133, 212, taps, { width: 0.7, head: 'fill' });
  const gains: [number, string][] = [[206, 'γ_{1}, β_{1}'], [162, 'α_{1}'], [108, 'γ_{2}, β_{2}'], [64, 'α_{2}']];
  for (const [y, s] of gains) L.text(e, 117, y - 3.5, s, { size: 5.5, anchor: 'middle', family: L.STYLE.font.latex, italic: true });
  D.richRow(e, 91, 270, ['DiT block ×', { s: 'N', family: L.STYLE.font.latex, italic: true, size: 7, gap: 1 }], { anchor: 'middle', valign: 'middle', size: 6.5 });
}

function panelE(F: Figure): void {
  const e = F.panel('e', { x: 120, y: 1, w: 62, h: 98 });
  L.rect(e, 16, 8, 150, 250, { r: 10, fill: '#F3F3F6', stroke: INK, width: 0.8 });
  const eL = L.group(e, { part: 'connectors' });
  ditTrunk(F, e, eL);
  ditBus(F, e, eL);
}

const TEAL = '#2F7F93';
const TEALF = '#DCEDF3';
const GREY = '#707070';

function unetStack(F: Figure, c: Panel): D.StackOut {
  const widths = [118, 104, 90, 80, 90, 104, 118];
  const labels = ['Encoder Block A 64×64', 'Encoder Block B 32×32', 'Encoder Block C 16×16', 'Middle Block 8×8', 'Decoder Block C 16×16', 'Decoder Block B 32×32', 'Decoder Block A 64×64'];
  const items: D.StackItem[] = [];
  for (let i = 0; i < labels.length; i++) items.push({ name: `u${i}`, label: at(labels, i), w: at(widths, i), h: 18 });
  return D.blockStack(c, 100, 30, 118, items, {
    dir: 'down', gap: 6, fill: '#F2F2F2', stroke: GREY, width: 0.8, r: 3, size: 6, fit: true, badge: 'lock', badgeColor: '#8E8E8E', badgeSize: 5, F,
  });
}

function unetBus(F: Figure, c: Panel, cL: L.Handle, st: D.StackOut): void {
  D.box(c, 12, 2, 50, 16, { label: 'Prompt & Time', size: 5.5, fill: '#F8F8F8', stroke: GREY, width: 0.8, r: 3, badge: 'lock', badgeAt: 'tr', badgeColor: '#8E8E8E', badgeSize: 4.5, F, name: 'enc' });
  const taps: D.BusTap[] = [];
  for (const bb of st.list) taps.push({ y: bb.y + 7, to: bb.x });
  D.bus(cL, 30, 18, taps, { rails: [{ dx: 0, stroke: '#666' }, { dx: -10, stroke: '#CFCFCF', tapDy: 5 }], width: 0.8 });
  D.link(cL, [100, 18], 'u0.top', { F, outline: 0.8, width: 0.8, stroke: '#666' });
  L.text(c, 104, 20, 'Input', { size: 5.5, valign: 'middle' });
}

function controlCopy(F: Figure, c: Panel, cL: L.Handle, st: D.StackOut): void {
  D.blockStack(c, 233, 30, 84, [
    { name: 'cA', label: 'Encoder A (trainable copy)', h: 18, badge: 'flame' },
    { name: 'cM', label: 'Middle (trainable copy)', h: 18, w: 72, badge: 'flame' },
  ], { dir: 'down', gap: 6, fill: TEALF, stroke: TEAL, width: 0.8, r: 3, size: 5.5, fit: true, badgeSize: 6, F });
  D.elbow(cL, 'cM.bottom', 'u3.right', { F, order: 'vh', head: 'chevron', stroke: TEAL, width: 0.8, outline: 0.8, relate: true });
  for (let j = 0; j < 3; j++) {
    const bb = at(st.list, 4 + j);
    const cy = bb.y + bb.h / 2;
    D.pill(c, 196, cy - 6, 74, 12, { label: 'zero convolution', size: 5.5, stroke: '#C4C4C4', width: 0.8 });
    D.route(cL, [[196, cy], [bb.x + bb.w, cy]], { head: 'chevron', stroke: TEAL, width: 0.8, outline: 0.8 });
    D.route(cL, [[250 + j * 8, 72], [250 + j * 8, cy - 6]], { head: 'chevron', headLength: 2.4, stroke: TEAL, width: 0.6, dash: '1.5 1.2', outline: 0.8 });
  }
}

function badgeKey(c: Panel): void {
  const kx = 10;
  const ky = 210;
  D.lock(c, kx, ky, 5);
  L.text(c, kx + 6, ky, 'lock', { size: 5.5, valign: 'middle' });
  D.lock(c, kx + 36, ky, 5, { open: true, color: TEAL });
  L.text(c, kx + 42, ky, 'lock, open', { size: 5.5, valign: 'middle' });
  D.snowflake(c, kx + 90, ky, 7);
  L.text(c, kx + 96, ky, 'snowflake', { size: 5.5, valign: 'middle' });
  D.flame(c, kx + 138, ky, 7);
  L.text(c, kx + 144, ky, 'flame', { size: 5.5, valign: 'middle' });
  D.pill(c, kx + 172, ky - 5, 44, 10, { label: 'pill', size: 5.5, stroke: GREY, width: 0.7 });
}

function panelC(F: Figure): void {
  const c = F.panel('c', { x: 1, y: 101, w: 100, h: 78 });
  D.repeatFrame(c, 186, 22, 94, 172, { label: false, fill: 'none', stroke: '#8EC9D6', dash: '3 2', r: 6, width: 0.7 });
  const cL = L.group(c, { part: 'connectors' });
  const st = unetStack(F, c);
  unetBus(F, c, cL, st);
  controlCopy(F, c, cL, st);
  badgeKey(c);
}

const RULE = '#4472C4';
const PB = '#8FAADC';
const GB = '#F4B183';
const OB = '#A9D18E';

function memoryGrid(d: Panel): D.GridOut {
  return D.grid(d, 0, 6, [36, 146, 44], [22, 34, 34, 34, 34], {
    stroke: RULE,
    width: 0.6,
    size: 6.5,
    h: [{ at: 1, from: 2 }, { at: 2, from: 0.4 }, { at: 3, from: 0.4 }, { at: 4, from: 0.4 }, { at: 5, from: 0.4 }],
    v: [{ at: 1, from: 0.5, to: 5, ext1: 4 }, { at: 2, from: 0, to: 5, ext1: 4 }],
    cells: [[null, null, 'Memory'], ['Baseline'], ['P_{os}'], ['P_{os+g}'], ['P_{os+g+p}']],
    fit: true,
  });
}

function memoryBars(d: Panel, G: D.GridOut): void {
  const gx = [40, 94, 148];
  const bwid = 34;
  const heads = ['gpu_{0}', 'gpu_{i}', 'gpu_{N-1}'];
  for (let k = 0; k < gx.length; k++) {
    L.text(d, at(gx, k) + bwid / 2, D.gridCell(G, 0, 1).cy + 2, at(heads, k), { size: 6.5, anchor: 'middle', valign: 'middle' });
  }
  const spans: ('full' | 'shard')[][] = [['full', 'full', 'full'], ['full', 'full', 'shard'], ['full', 'shard', 'shard'], ['shard', 'shard', 'shard']];
  for (let r = 0; r < spans.length; r++) {
    const sp = at(spans, r);
    const y0 = D.gridCell(G, r + 1, 1).y + 5;
    for (let j = 0; j < gx.length; j++) {
      D.stackedBar(d, at(gx, j), y0, bwid, [{ h: 3, fill: PB, span: at(sp, 0) }, { h: 3, fill: GB, span: at(sp, 1) }, { h: 17, fill: OB, span: at(sp, 2) }], { shardAt: j / 2, shardW: bwid / 8 });
    }
    for (const ex of [84, 138]) D.ellipsis(d, ex, y0 + 10, { r: 0.7 });
  }
}

function memoryCells(d: Panel, G: D.GridOut): void {
  const mc = D.gridCell(G, 1, 2).cx;
  const M = { size: 5.5, family: L.STYLE.font.math };
  L.text(d, mc, D.gridCell(G, 1, 2).cy, '16Ψ', { ...M, anchor: 'middle', valign: 'middle' });
  L.text(d, mc - 1, D.gridCell(G, 2, 2).cy, '4Ψ +', { ...M, anchor: 'end', valign: 'middle' });
  D.fraction(d, mc + 1, D.gridCell(G, 2, 2).cy, '12Ψ', '*N*_{d}', { ...M, anchor: 'start' });
  L.text(d, mc - 1, D.gridCell(G, 3, 2).cy, '2Ψ +', { ...M, anchor: 'end', valign: 'middle' });
  D.fraction(d, mc + 1, D.gridCell(G, 3, 2).cy, '14Ψ', '*N*_{d}', { ...M, anchor: 'start' });
  D.fraction(d, mc, D.gridCell(G, 4, 2).cy, '16Ψ', '*N*_{d}', M);
  D.fitText(d, 18, D.gridCell(G, 0, 0).cy, 'fitText demo', 30, { size: 6, anchor: 'middle', valign: 'middle', color: C.mid });
}

function headStyles(d: Panel): void {
  D.swatchLegend(d, 30, 180, [{ fill: PB, label: 'Parameters' }, { fill: GB, label: 'Gradients' }, { fill: OB, label: 'Optimizer states' }], { size: 6.5 });
  const styles: ('fill' | 'open' | 'chevron')[] = ['fill', 'open', 'chevron'];
  for (let k = 0; k < styles.length; k++) {
    const hd = at(styles, k);
    const x = 20 + k * 70;
    D.route(d, [[x, 200], [x + 30, 200], [x + 30, 212]], { head: hd, width: 0.7 });
    L.text(d, x + 34, 208, `head: '${hd}'`, { size: 5, valign: 'middle' });
  }
}

function panelD(F: Figure): void {
  const d = F.panel('d', { x: 102, y: 101, w: 80, h: 78 });
  const G = memoryGrid(d);
  memoryBars(d, G);
  memoryCells(d, G);
  headStyles(d);
}

export default function draw(F: Figure): void {
  panelA(F);
  panelB(F);
  panelE(F);
  panelC(F);
  panelD(F);
}
