// Source: https://emilkowal.ski (CSS read 2026-11-03) and Radix Colors 3.0.0 https://www.radix-ui.com/colors
type GrayStep = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000 | 1100 | 1200;
export type HueName = "blue" | "sky" | "grass" | "amber" | "orange" | "tomato" | "violet";
export type TokenName = `gray-${GrayStep}` | `${HueName}-${3 | 7 | 9 | 11}`;

export const TOKENS: Readonly<Record<TokenName, readonly [string, string]>> = {
  "gray-100": ["#fdfdfc", "#111110"], "gray-200": ["#f9f9f8", "#191918"], "gray-300": ["#f1f0ef", "#222221"],
  "gray-400": ["#e9e9e7", "#2a2a28"], "gray-500": ["#e2e1de", "#31312e"], "gray-600": ["#dad9d6", "#3b3a37"],
  "gray-700": ["#cfceca", "#494844"], "gray-800": ["#bcbbb5", "#62605b"], "gray-900": ["#8d8d86", "#6f6d66"],
  "gray-1000": ["#82827c", "#7c7b74"], "gray-1100": ["#63635e", "#b5b3ad"], "gray-1200": ["#21201c", "#eeeeec"],
  "blue-3": ["#e6f4fe", "#0d2847"], "blue-7": ["#8ec8f6", "#205d9e"], "blue-9": ["#0090ff", "#0090ff"], "blue-11": ["#0d74ce", "#70b8ff"],
  "sky-3": ["#e1f6fd", "#112840"], "sky-7": ["#8dcae3", "#1f6692"], "sky-9": ["#7ce2fe", "#7ce2fe"], "sky-11": ["#00749e", "#75c7f0"],
  "grass-3": ["#e9f6e9", "#1b2a1e"], "grass-7": ["#94ce9a", "#366740"], "grass-9": ["#46a758", "#46a758"], "grass-11": ["#2a7e3b", "#71d083"],
  "amber-3": ["#fff7c2", "#302008"], "amber-7": ["#e9c162", "#714f19"], "amber-9": ["#ffc53d", "#ffc53d"], "amber-11": ["#ab6400", "#ffca16"],
  "orange-3": ["#ffefd6", "#331e0b"], "orange-7": ["#f5ae73", "#7e451d"], "orange-9": ["#f76b15", "#f76b15"], "orange-11": ["#cc4e00", "#ffa057"],
  "tomato-3": ["#feebe7", "#391714"], "tomato-7": ["#f5a898", "#853a2d"], "tomato-9": ["#e54d2e", "#e54d2e"], "tomato-11": ["#d13415", "#ff977d"],
  "violet-3": ["#f4f0fe", "#291f43"], "violet-7": ["#c2b5f5", "#56468b"], "violet-9": ["#6e56cf", "#6e56cf"], "violet-11": ["#6550b9", "#baa7ff"],
};

type Rgb = readonly [number, number, number];

function isTokenName(n: string): n is TokenName {
  return Object.hasOwn(TOKENS, n);
}

function tokenNames(): TokenName[] {
  const names: TokenName[] = [];
  for (const n of Object.keys(TOKENS)) {
    if (isTokenName(n)) names.push(n);
  }
  return names;
}

const TOKEN_NAMES: TokenName[] = tokenNames();

export function light(n: TokenName): string {
  return TOKENS[n][0];
}

export function dark(n: TokenName): string {
  return TOKENS[n][1];
}

function rgb(h: string): Rgb {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

export const gray: Readonly<Record<GrayStep, string>> = {
  100: light("gray-100"), 200: light("gray-200"), 300: light("gray-300"), 400: light("gray-400"),
  500: light("gray-500"), 600: light("gray-600"), 700: light("gray-700"), 800: light("gray-800"),
  900: light("gray-900"), 1000: light("gray-1000"), 1100: light("gray-1100"), 1200: light("gray-1200"),
};

export type Steps = { 3: string; 7: string; 9: string; 11: string };

function steps(h: HueName): Steps {
  return { 3: light(`${h}-3`), 7: light(`${h}-7`), 9: light(`${h}-9`), 11: light(`${h}-11`) };
}

export const hue: Readonly<Record<HueName, Steps>> = {
  blue: steps("blue"), sky: steps("sky"), grass: steps("grass"), amber: steps("amber"),
  orange: steps("orange"), tomato: steps("tomato"), violet: steps("violet"),
};

const WHITE = "rgb(255, 255, 255)";
const DARK = `rgb(${rgb(light("gray-1200")).join(", ")})`;
export const onSolid: Readonly<Record<HueName, string>> = { blue: WHITE, grass: WHITE, orange: WHITE, tomato: WHITE, violet: WHITE, sky: DARK, amber: DARK };

export const PX: Readonly<Record<"label" | "small" | "title" | "hair" | "thin" | "normal" | "bold" | "card" | "chip" | "pad" | "gap", number>> = {
  label: 14, small: 12, title: 16, hair: 0.5, thin: 1, normal: 1.5, bold: 2, card: 12, chip: 6, pad: 16, gap: 24,
};
export const weight: Readonly<Record<"name" | "text" | "title", number>> = { name: 500, text: 400, title: 600 };

export function hex(c: string): string | null {
  const s = c.trim().toLowerCase();
  if (s === "white") return "#ffffff";
  if (s === "black") return "#000000";
  if (/^#[0-9a-f]{3}$/u.test(s)) {
    let out = "#";
    for (const h of s.slice(1)) out += h + h;
    return out;
  }
  return /^#[0-9a-f]{6}$/u.test(s) ? s : null;
}

function byHex(): Map<string, TokenName> {
  const found = new Map<string, TokenName>();
  for (const n of TOKEN_NAMES) found.set(light(n), n);
  return found;
}

const BY_HEX: Map<string, TokenName> = byHex();

function distance(a: Rgb, b: Rgb): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

export function token(h: string): TokenName {
  const known = BY_HEX.get(h);
  if (known !== undefined) return known;
  const a = rgb(h);
  let best: TokenName = "gray-100";
  let nearest = Infinity;
  for (const n of TOKEN_NAMES) {
    const d = distance(rgb(light(n)), a);
    if (d < nearest) {
      nearest = d;
      best = n;
    }
  }
  return best;
}

export function card(r: number): { fill: string; stroke: string; r: number } {
  return { fill: gray[100], stroke: gray[400], r };
}

export type FigureExport = { sheet?: unknown; name?: unknown } & Record<string, unknown>;

const SHEETS = new Map<string, readonly [number, number]>([["letter", [215.9, 279.4]], ["a4", [210, 297]]]);
const SHEET_KEYS = new Set(["sheet", "sheetId", "numerals"]);

function without(base: FigureExport): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (!SHEET_KEYS.has(k)) rest[k] = v;
  }
  return rest;
}

export function patentFigure(base: FigureExport, colour: boolean): FigureExport {
  if (!colour) return { ...base, format: "patent" };
  const sheetName = base.sheet ?? "letter";
  const size = typeof sheetName === "string" ? SHEETS.get(sheetName) : undefined;
  if (size === undefined) throw new Error(`patentFigure: unknown sheet "${JSON.stringify(sheetName)}"`);
  return { ...without(base), format: "slide", width: size[0], height: size[1], name: `${typeof base.name === "string" ? base.name : "fig"}-colour` };
}
