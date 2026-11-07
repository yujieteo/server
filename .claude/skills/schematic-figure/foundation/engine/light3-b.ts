// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/light3.js
import type { Parent } from './types.ts';
import type { Proj } from './geo-proj.ts';
import type { V3 } from './geo-vec.ts';
import { add3, dot3, scale3, sub3, unit3 } from './geo-vec.ts';
import { hull2 } from './geo-vec.ts';
import { STYLE } from './style.ts';
import { at } from './util.ts';
import type { BeamStop, Box, Item, LensItem, LensSpec, PlaneItem, Scene3, Scene3Opts, SeenSpec, SegItem, Style3, SurfaceItem, SurfaceSpec } from './light3-a.ts';
import { basis, bbox, boxHit, mean3, pageOf, ring3 } from './light3-a.ts';

const C = STYLE.color;

export function lightScene3(p: Parent, P: Proj, o: Scene3Opts = {}): Scene3 {
  return { p, P, o, eps: o.eps ?? 1e-6, items: [], named: {}, beams: [], slots: {} };
}

function addItem<T extends PlaneItem>(S: Scene3, it: T): T {
  S.items.push(it);
  S.named[it.name] = it;
  return it;
}

export function sceneSurface(S: Scene3, name: string, s: SurfaceSpec): void {
  const sil = s.pts === undefined ? null : hull2(pageOf(S.P, s.pts));
  const item: SurfaceItem = {
    kind: 'surface', idx: S.items.length, name, point: s.point, normal: unit3(s.normal), box: sil === null ? null : bbox(sil), sil, veil: s.veil ?? 1,
  };
  addItem(S, item);
}

function lensAxes(s: LensSpec, axis: V3): [V3, V3] {
  if (s.e1 !== undefined && s.e2 !== undefined) return [s.e1, s.e2];
  const [b1, b2] = basis(axis);
  const r = s.r ?? 10;
  return [scale3(b1, r), scale3(b2, r)];
}

function seenOf(s: LensSpec): SeenSpec {
  return { transmission: s.seen?.transmission ?? 0.8, tint: s.seen?.tint ?? '#2f7f95', mix: s.seen?.mix ?? 0.35 };
}

export function sceneLens(S: Scene3, name: string, s: LensSpec): void {
  const axis = unit3(s.axis);
  const t = s.t ?? 4;
  const n = s.n ?? 72;
  const [e1, e2] = lensAxes(s, axis);
  const front = dot3(axis, S.P.view) > 0 ? 1 : -1;
  const faceRing = ring3(add3(s.c, axis, (front * t) / 2), e1, e2, n);
  const backRing = ring3(add3(s.c, axis, (-front * t) / 2), e1, e2, n);
  const sil = hull2(pageOf(S.P, faceRing.concat(backRing)));
  const item: LensItem = {
    kind: 'lens', idx: S.items.length, name, point: s.c, normal: axis, axis, t, e1, e2, front, faceRing, sil, box: bbox(sil), inner: [], blendSegs: [], s,
    seen: seenOf(s), glass: s.glass ?? C.glass,
  };
  addItem(S, item);
}

export function sceneBeam(S: Scene3, stops: readonly BeamStop[], style: Style3 = {}): void {
  S.beams.push({ stops, style });
}

interface PtsStop {
  kind: 'pts';
  pts: readonly V3[];
}

interface LensStop {
  kind: 'lens';
  lens: LensItem;
  mid: V3[];
  entry: V3[];
  exit: V3[];
}

type Stop = PtsStop | LensStop;

function stopPts(s: Stop): readonly V3[] {
  return s.kind === 'pts' ? s.pts : s.mid;
}

function isPoints(s: BeamStop): s is readonly V3[] {
  return Array.isArray(s);
}

function resolveStop(S: Scene3, s: BeamStop): Stop {
  if (isPoints(s)) return { kind: 'pts', pts: s };
  const it = S.named[s.at];
  if (it === undefined) throw new Error(`lightScene3: unknown stop "${s.at}"`);
  if (it.kind === 'surface') {
    if (s.pts === undefined) throw new Error(`lightScene3: stop "${s.at}" needs pts`);
    return { kind: 'pts', pts: s.pts };
  }
  const k = s.fill ?? 0.92;
  const mid = s.pts === undefined ? ring3(it.point, scale3(it.e1, k), scale3(it.e2, k), 48) : [...s.pts];
  return { kind: 'lens', lens: it, mid, entry: [], exit: [] };
}

function shifted(pts: readonly V3[], axis: V3, k: number): V3[] {
  const out: V3[] = [];
  for (const q of pts) out.push(add3(q, axis, k));
  return out;
}

function setLensSides(st: Stop[], i: number, style: Style3, bi: number): void {
  const s = at(st, i);
  if (s.kind !== 'lens') return;
  const L = s.lens;
  const prev = st[i - 1];
  const nb = prev ?? at(st, i + 1);
  const ref = mean3(stopPts(nb));
  const d = Math.sign(dot3(sub3(ref, L.point), L.axis));
  const side = d === 0 || Number.isNaN(d) ? -1 : d;
  const sgn = prev === undefined ? -side : side;
  s.entry = shifted(s.mid, L.axis, (sgn * L.t) / 2);
  s.exit = shifted(s.mid, L.axis, (-sgn * L.t) / 2);
  L.inner.push({ pts: s.entry.concat(s.exit), style, beam: bi });
}

function blendLens(a: Stop, b: Stop): LensItem[] {
  const out: LensItem[] = [];
  for (const s of [a, b]) {
    if (s.kind === 'lens' && s.lens.s.blend !== undefined && s.lens.s.blend !== false) out.push(s.lens);
  }
  return out;
}

function addSegments(S: Scene3, st: Stop[], style: Style3, bi: number): void {
  const total = st.length - 1;
  for (let i = 0; i < total; i++) {
    const a = at(st, i);
    const b = at(st, i + 1);
    const A = a.kind === 'lens' ? a.exit : a.pts;
    const B = b.kind === 'lens' ? b.entry : b.pts;
    const page = hull2(pageOf(S.P, [...A, ...B]));
    const seg: SegItem = {
      kind: 'seg', idx: S.items.length, beam: bi, i, total, pts3: [...A, ...B], a3: mean3(A), b3: mean3(B), page, box: bbox(page), style, front: [], veils: [],
      blends: blendLens(a, b),
    };
    S.items.push(seg);
    for (const L of seg.blends) L.blendSegs.push(seg);
  }
}

export function resolveBeams(S: Scene3): void {
  for (let bi = 0; bi < S.beams.length; bi++) {
    const b = at(S.beams, bi);
    const st: Stop[] = [];
    for (const s of b.stops) st.push(resolveStop(S, s));
    for (let i = 0; i < st.length; i++) setLensSides(st, i, b.style, bi);
    addSegments(S, st, b.style, bi);
  }
}

function sideOf(it: Item, pl: PlaneItem, eps: number): number {
  const pts: readonly V3[] = it.kind === 'seg' ? it.pts3 : [it.point];
  let best = 0;
  for (const q of pts) {
    const d = dot3(sub3(q, pl.point), pl.normal);
    if (Math.abs(d) > Math.abs(best)) best = d;
  }
  return Math.abs(best) < eps ? 0 : Math.sign(best);
}

function apart(a: Box | null, b: Box | null): boolean {
  return a !== null && b !== null && !boxHit(a, b);
}

function constrain(before: Set<number>[], pl: PlaneItem, it: Item, s: number, vs: number): void {
  if (s === vs) {
    at(before, it.idx).add(pl.idx);
    if (pl.kind === 'surface' && it.kind === 'seg' && pl.sil !== null && pl.veil < 1) it.veils.push(pl);
  } else {
    at(before, pl.idx).add(it.idx);
    if (pl.kind === 'lens' && it.kind === 'seg') it.front.push(pl);
  }
}

function ready(deps: ReadonlySet<number>, done: ReadonlySet<number>): boolean {
  for (const j of deps) if (!done.has(j)) return false;
  return true;
}

function pickNext(items: readonly Item[], before: readonly Set<number>[], done: ReadonlySet<number>): Item {
  let fallback: Item | null = null;
  for (const it of items) {
    if (done.has(it.idx)) continue;
    fallback ??= it;
    if (ready(at(before, it.idx), done)) return it;
  }
  if (fallback === null) throw new Error('lightScene3: nothing left to order');
  return fallback;
}

export function depthOrder(S: Scene3): Item[] {
  const before: Set<number>[] = [];
  for (let i = 0; i < S.items.length; i++) before.push(new Set());
  for (const pl of S.items) {
    if (pl.kind === 'seg') continue;
    const vs = Math.sign(dot3(S.P.view, pl.normal));
    for (const it of S.items) {
      if (it === pl) continue;
      if (apart(pl.box, it.box)) continue;
      const s = sideOf(it, pl, S.eps);
      if (s === 0 || vs === 0) continue;
      constrain(before, pl, it, s, vs);
    }
  }
  const order: Item[] = [];
  const done = new Set<number>();
  for (let n = 0; n < S.items.length; n++) {
    const next = pickNext(S.items, before, done);
    done.add(next.idx);
    order.push(next);
  }
  return order;
}
