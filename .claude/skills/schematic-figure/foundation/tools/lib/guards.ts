// Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/lib/cdp.mjs
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function asRecord(v: unknown): Record<string, unknown> {
  if (!isRecord(v)) throw new TypeError('expected an object');
  return v;
}

export function asArray(v: unknown): unknown[] {
  if (!Array.isArray(v)) throw new TypeError('expected an array');
  const out: unknown[] = [];
  for (const x of v) out.push(x);
  return out;
}

export function asNumber(v: unknown): number {
  if (typeof v !== 'number') throw new TypeError('expected a number');
  return v;
}

export function asString(v: unknown): string {
  if (typeof v !== 'string') throw new TypeError('expected a string');
  return v;
}

export function asBool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new TypeError('expected a boolean');
  return v;
}

export function field(v: unknown, key: string): unknown {
  return asRecord(v)[key];
}

export function optString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function describeError(e: unknown): string {
  if (e instanceof Error) return e.stack ?? e.message;
  return String(e);
}

export function numList(text: string): number[] {
  const out: number[] = [];
  for (const p of text.split(',')) out.push(Number(p));
  return out;
}
