export const MM: number = 72 / 25.4;
export const CAP: number = 0.716;
export const XH: number = 0.519;
export const MIN_MM: number = 3.2;
export const FLOOR: number = 0.3;
export const SHEETS: [string, number, number][] = [['letter', 215.9, 279.4], ['a4', 210, 297]];
export const LEGEND_WORDS: number = 5;
const NUM_ONE = String.raw`S?\d{1,5}[A-Za-z]{0,2}['′″]*`;
export const NUMERAL: RegExp = new RegExp(`^${NUM_ONE}(\\s*,\\s*${NUM_ONE})*$`);
export const FIG: RegExp = /^FIG\. \d+[A-Z]?$/;
export const FIGISH: RegExp = /^(fig|figure)\b/i;
export const SHEET: RegExp = /^\d+\/\d+$/;
export const BRACKETED: RegExp = /^[([{“"'‘<]\s*S?\d+[A-Za-z]*\s*[)\]}”"'’>]$/;

export function parseNumerals(src: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const ln of src.split(/\r?\n/)) {
    if (/^\s*#/.test(ln) || /^\s*\|?\s*-{3,}/.test(ln)) continue;
    const m = /^\s*(?:[-*+]\s+|\|\s*)?`?([A-Za-z]{0,3}\d+[A-Za-z]{0,2}['′″]*|[A-Za-z]{1,3}\d{0,3}['′]*)`?\s*(?::|\||—|–|\s-\s)\s*(\S.*)$/.exec(ln);
    if (m !== null && m[1] !== undefined && m[2] !== undefined) map.set(m[1], m[2].replace(/[|]\s*$/, '').trim());
  }
  return map;
}
