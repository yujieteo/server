import type { Manifest, TextItem } from './manifest.ts';
import type { Report } from './report.ts';

export interface Format {
  min: number;
  max: number;
  line: number;
  heavy: number;
  ppi: number;
}

export const JOURNAL: Format = { min: 5, max: 8, line: 0.25, heavy: 2.5, ppi: 300 };

export const FORMATS: Record<string, Format> = {
  journal: JOURNAL,
  slide: { min: 14, max: 40, line: 0.8, heavy: 8, ppi: 150 },
  poster: { min: 20, max: 120, line: 1.5, heavy: 12, ppi: 150 },
};

export interface Ctx {
  M: Manifest;
  r: Report;
  rep: boolean;
  fm: Format;
  T: TextItem[];
  journal: boolean;
}

export function quoteList(L: TextItem[], n: number, len: number): string {
  const out: string[] = [];
  for (const t of L.slice(0, n)) out.push(JSON.stringify(t.s.slice(0, len)));
  return out.join(', ');
}

export function wordCount(s: string, re: RegExp): number {
  return (s.match(re) ?? []).length;
}

export function isBold(t: TextItem): boolean {
  return /^(bold|[6-9]00)$/.test(t.weight);
}

export function overlaps(T: TextItem[], padItalic: boolean): string[] {
  const ov: string[] = [];
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) {
      const p = T[i], q = T[j];
      if (p === undefined || q === undefined || p.rotate !== 0 || q.rotate !== 0) continue;
      const a = p.box, b = q.box, e = padItalic && (p.italic || q.italic) ? 0.9 : 0.4;
      if (a.x + e < b.x + b.w - e && b.x + e < a.x + a.w - e && a.y + e < b.y + b.h - e && b.y + e < a.y + a.h - e) {
        ov.push(`${JSON.stringify(p.s.slice(0, 18))} x ${JSON.stringify(q.s.slice(0, 18))}`);
      }
    }
  }
  return ov;
}
