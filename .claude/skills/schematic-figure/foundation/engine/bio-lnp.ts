// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/bio.js
import type { Loose, Parent, Point } from './types.ts';
import { el, group } from './core.ts';
import { STYLE, shade } from './style.ts';
import { circle, path, radialGradient, smooth } from './draw.ts';
import type { Part, Rand, Reg } from './bio-util.ts';
import { BIO, floorOf, fw, pol, reg, rnd, rng } from './bio-util.ts';
import { dna } from './bio-organelle.ts';
import { mrna } from './bio-virus.ts';

export type LnpOpts = Reg &
  Loose<{
    heads: number;
    tails: number;
    bilayer: boolean;
    color: string;
    core: string;
    cargo: number;
    cargoKind: 'mrna' | 'dna' | 'drug';
    rna: string;
    seed: number;
  }>;

interface Leaflet {
  g: Parent;
  cx: number;
  cy: number;
  r: number;
  nh: number;
  nt: number;
  hr: number;
  col: string;
  tailCol: string;
  tw: number;
  K: number;
  R: Rand;
}

function leaflet(c: Leaflet, rh: number, dir: number): void {
  const { g, cx, cy, r, nh, nt, hr, col, tailCol, tw, K, R } = c;
  for (let i = 0; i < nh; i++) {
    const a = (i * 360) / nh + (rnd(R) - 0.5) * 3;
    for (let j = 0; j < nt; j++) {
      const da = (j - (nt - 1) / 2) * (hr / rh) * 50;
      const len = 0.2 * r * (0.85 + 0.25 * rnd(R));
      const pts: Point[] = [];
      for (let q = 0; q < 7; q++) {
        const t = q / 6;
        const rr = rh + dir * (hr * 0.6 + t * len);
        pts.push(pol(cx, cy, rr, a + da + 1.2 * Math.sin(t * 7 + i) * t));
      }
      path(g, smooth(pts), { stroke: tailCol, width: tw, part: 'lipid-tail' });
    }
    const [x, y] = pol(cx, cy, rh, a);
    circle(g, x, y, hr, { fill: col, stroke: shade(col, -0.3), width: fw(K, 0.012 * r) });
  }
}

function cargoDrug(g: Parent, cx: number, cy: number, r: number, nc: number, o: LnpOpts, R: Rand): void {
  for (let j = 0; j < nc; j++) {
    const [x, y] = pol(cx, cy, (o.bilayer === true ? 0.3 : 0.42) * r * Math.sqrt(rnd(R)), rnd(R) * 360);
    circle(g, x, y, 0.06 * r, { fill: o.rna ?? BIO.rna, part: 'cargo' });
  }
}

function cargoDna(g: Parent, cx: number, cy: number, r: number, nc: number, o: LnpOpts, R: Rand): void {
  const rna = o.rna ?? BIO.rna;
  for (let j = 0; j < nc; j++) {
    const a = (j * 360) / nc + rnd(R) * 40;
    const [x, y] = pol(cx, cy, nc > 1 ? 0.2 * r : 0, a);
    const L2 = (o.bilayer === true ? 0.34 : 0.5) * r;
    dna(group(g, { x, y, rotate: a + 90 }), -L2 / 2, L2 / 2, 0, { amp: 0.07 * r, c1: rna, c2: shade(rna, 0.5) });
  }
}

function cargoMrna(g: Parent, cx: number, cy: number, r: number, nc: number, o: LnpOpts, R: Rand): void {
  for (let j = 0; j < nc; j++) {
    const a = (j * 360) / nc + rnd(R) * 40;
    const [x, y] = pol(cx, cy, nc > 1 ? 0.24 * r : 0, a);
    const L2 = (o.bilayer === true ? 0.35 : 0.5) * r;
    const b = a + 90 + (rnd(R) - 0.5) * 40;
    mrna(g, pol(x, y, L2 / 2, b + 180), pol(x, y, L2 / 2, b), { amp: 0.12, turns: 4, width: 0.028 * r, color: o.rna ?? BIO.rna });
  }
}

export function lnp(p: Parent, cx: number, cy: number, r: number, o: LnpOpts = {}): Part {
  const K = floorOf(p);
  const g = el(p, 'g', { 'data-part': o.part ?? 'lnp' });
  const R = rng(o.seed ?? 5);
  const col = o.color ?? BIO.lipid;
  const nh = o.heads ?? 30;
  const nt = o.tails ?? 2;
  const hr = Math.min(0.075 * r, ((Math.PI * r) / nh) * 0.42);
  const core = o.core ?? shade(col, 0.7);
  const tw = fw(K, Math.max(0.018 * r, STYLE.line.hair));
  circle(g, cx, cy, r * 0.93, { fill: shade(col, 0.55) });
  const cf = radialGradient(g, [[0, shade(core, 0.4)], [0.8, core], [1, shade(core, -0.08)]], { cx: 0.45, cy: 0.4 });
  circle(g, cx, cy, r * (o.bilayer === true ? 0.5 : 0.64), { fill: cf });
  const lf: Leaflet = { g, cx, cy, r, nh, nt, hr, col, tailCol: shade(col, -0.1), tw, K, R };
  leaflet(lf, r * 0.9, -1);
  if (o.bilayer === true) leaflet(lf, r * 0.5, 1);
  const nc = o.cargo ?? 3;
  const ck = o.cargoKind ?? 'mrna';
  if (ck === 'drug') cargoDrug(g, cx, cy, r, nc, o, R);
  if (ck === 'dna') cargoDna(g, cx, cy, r, nc, o, R);
  if (ck === 'mrna') cargoMrna(g, cx, cy, r, nc, o, R);
  const ports = reg(o, p, { center: [cx, cy], left: [cx - r, cy], right: [cx + r, cy], top: [cx, cy - r], bottom: [cx, cy + r] });
  return { node: g, ports };
}
