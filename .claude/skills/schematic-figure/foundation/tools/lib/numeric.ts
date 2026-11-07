export function sortNumbers(a: number[]): number[] {
  const out = a.slice();
  for (let i = 1; i < out.length; i++) {
    const v = out[i] ?? 0;
    let j = i - 1;
    while (j >= 0 && (out[j] ?? 0) > v) {
      out[j + 1] = out[j] ?? 0;
      j--;
    }
    out[j + 1] = v;
  }
  return out;
}

export function minOf(a: number[]): number {
  let m = Infinity;
  for (const v of a) if (v < m) m = v;
  return m;
}

export function maxOf(a: number[]): number {
  let m = -Infinity;
  for (const v of a) if (v > m) m = v;
  return m;
}

export function uniq(a: string[]): string[] {
  const out: string[] = [];
  for (const v of a) if (!out.includes(v)) out.push(v);
  return out;
}
