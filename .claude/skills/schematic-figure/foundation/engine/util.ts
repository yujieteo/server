// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/engine/core.js

export function at<T>(a: readonly T[], i: number): T {
  const v = a[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
}

export function f3(v: number): number {
  return +v.toFixed(3);
}

export function linspace(x0: number, x1: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(x0 + ((x1 - x0) * i) / n);
  return out;
}

export function unit(dx: number, dy: number): [number, number] {
  const h = Math.hypot(dx, dy);
  const n = h === 0 || Number.isNaN(h) ? 1 : h;
  return [dx / n, dy / n];
}
