import { dark, gray, hex, hue, light, PX, token, type TokenName } from "./tokens.ts";

export { card, gray, hue, onSolid, patentFigure, PX, TOKENS, weight } from "./tokens.ts";

export type Rect = { x: number; y: number; w: number; h: number };

export type StyleDecl = {
  fontFeatureSettings: string;
  animationDelay: string;
  setProperty(name: string, value: string): void;
};

export type SvgNode = {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  style: StyleDecl;
  getBBox(): { y: number };
  querySelector(selector: string): SvgNode | null;
  querySelectorAll(selector: string): Iterable<SvgNode>;
  insertBefore(node: { textContent: string | null }, before: unknown): void;
  firstChild: unknown;
};

export type Figure = {
  svg: SvgNode;
  root: unknown;
  widthMM: number;
  heightMM: number;
  sight?: Rect;
  sightMM?: Rect;
  drawing?: { node: unknown };
};

export type Library = {
  STYLE: {
    font: { family: string; math: string };
    color: Record<string, string>;
    text: Record<string, number>;
    line: Record<string, number>;
    arrow: Record<string, number>;
  };
  PATENT: {
    text: { fig: number; legend: number; numeral: number };
    line: Record<string, number>;
    arrow: Record<string, number>;
    margin: { left: number; top: number; right: number; bottom: number };
  };
  mm(value: number): number;
  el(parent: unknown, tag: string, attrs: Record<string, string>): unknown;
};

export type Look = {
  s: number;
  r: { card: number; chip: number };
  line: Record<string, number>;
  text: Record<string, number>;
};

const INTER_FEATURES = '"cv01", "ss03"';

const inter = new FontFace("Inter", `url(${new URL("./fonts/InterVariable.woff2", import.meta.url)})`, { weight: "100 900" });
document.fonts.add(inter);
await inter.load();

const VENUES = new Map<string, { scale: number; lineMin: number }>([
  ["web", { scale: 0.5, lineMin: 0.25 }],
  ["journal", { scale: 0.5, lineMin: 0.25 }],
  ["slide", { scale: 18 / 14, lineMin: 0.8 }],
  ["poster", { scale: 2, lineMin: 1.5 }],
  ["patent-colour", { scale: 1, lineMin: 0.35 }],
]);

function placeSheetNumber(F: Figure, S: Library["STYLE"]): void {
  const sheetNumber = F.svg.querySelector("text[data-role=sheet]");
  sheetNumber?.setAttribute("font-family", S.font.family);
  const box = sheetNumber?.getBBox();
  if (sheetNumber !== null && box !== undefined && F.sight !== undefined && box.y < F.sight.y) {
    sheetNumber.setAttribute("y", String(Number(sheetNumber.getAttribute("y")) + F.sight.y - box.y + 0.5));
  }
}

function paintColors(c: Record<string, string>): void {
  Object.assign(c, {
    text: gray[1200], ink: gray[1200], mid: gray[900], light: gray[800], faint: gray[400], paper: gray[100],
    blue: hue.blue[9], sky: hue.sky[9], green: hue.grass[9], yellow: hue.amber[9], orange: hue.orange[9], vermillion: hue.tomato[9], purple: hue.violet[9],
    beam: hue.tomato[9], beamIR: hue.tomato[11], beamGreen: hue.grass[9], beamBlue: hue.blue[9], glass: hue.sky[3],
    metal: gray[700], silicon: gray[900], substrate: gray[500], gold: hue.amber[9],
    tintBlue: hue.blue[3], tintOrange: hue.orange[3], tintGreen: hue.grass[3], tintGrey: gray[300],
  });
}

function sizeFromPatent(F: Figure, L: Library): void {
  const P = L.PATENT;
  const S = L.STYLE;
  Object.assign(S.text, { panel: P.text.fig, title: P.text.legend, label: P.text.numeral, small: P.text.numeral, tick: P.text.numeral, min: P.text.numeral, max: P.text.fig });
  Object.assign(S.line, P.line);
  Object.assign(S.arrow, P.arrow);
  giveSight(F, L);
}

function sizeFromPx(S: Library["STYLE"], found: { scale: number; lineMin: number }): void {
  const s = found.scale;
  const min = found.lineMin;
  Object.assign(S.text, { panel: PX.title * s, title: PX.title * s, label: PX.label * s, small: PX.small * s, tick: PX.small * s, min: PX.small * s, max: PX.title * s });
  Object.assign(S.line, {
    hair: Math.max(min, PX.hair * s), thin: Math.max(min, PX.thin * s), normal: Math.max(min, PX.normal * s), bold: Math.max(min, PX.bold * s), min,
  });
}

export function useEmil(F: Figure, L: Library, venue: string): Look {
  const S = L.STYLE;
  S.font.family = "Inter, sans-serif";
  S.font.math = "Inter, sans-serif";
  F.svg.style.fontFeatureSettings = INTER_FEATURES;
  if (venue === "patent") {
    placeSheetNumber(F, S);
    return { s: 1, r: { card: 0, chip: 0 }, line: S.line, text: S.text };
  }
  const found = VENUES.get(venue);
  if (found === undefined) throw new Error(`useEmil: unknown venue "${venue}"`);
  paintColors(S.color);
  if (venue === "patent-colour") sizeFromPatent(F, L);
  else sizeFromPx(S, found);
  F.svg.querySelector("[data-role=background]")?.setAttribute("fill", gray[100]);
  return { s: found.scale, r: { card: PX.card * found.scale, chip: PX.chip * found.scale }, line: S.line, text: S.text };
}

function giveSight(F: Figure, L: Library): void {
  const m = L.PATENT.margin;
  F.sightMM = { x: m.left, y: m.top, w: F.widthMM - m.left - m.right, h: F.heightMM - m.top - m.bottom };
  F.sight = { x: L.mm(F.sightMM.x), y: L.mm(F.sightMM.y), w: L.mm(F.sightMM.w), h: L.mm(F.sightMM.h) };
  F.drawing = { node: L.el(F.root, "g", { transform: `translate(${F.sight.x.toFixed(3)} ${F.sight.y.toFixed(3)})`, "data-part": "sight" }) };
}

const THEMED_ATTRIBUTES = ["fill", "stroke", "stop-color", "flood-color"];

const ENTRANCE_CSS = `@media screen and (prefers-reduced-motion: no-preference) {
  [data-panel] { animation: emil-in 300ms cubic-bezier(0.23, 1, 0.32, 1) both; }
  @keyframes emil-in { from { opacity: 0; translate: 0 4px; } }
}
#host > svg [data-panel] { animation: none; }\n`;

const PANEL_STAGGER_MS = 60;

function darkDeclarations(used: Set<TokenName>): string {
  const parts: string[] = [];
  for (const n of [...used].toSorted()) parts.push(`--color-${n}: ${dark(n)};`);
  return parts.join(" ");
}

export function emilTheme(F: Figure, { animate = false }: { animate?: boolean } = {}): void {
  const used = new Set<TokenName>();
  for (const e of [F.svg, ...F.svg.querySelectorAll("*")]) {
    for (const a of THEMED_ATTRIBUTES) {
      const h = hex(e.getAttribute(a) ?? "");
      if (h === null) continue;
      const n = token(h);
      used.add(n);
      e.style.setProperty(a, `var(--color-${n}, ${light(n)})`);
    }
  }
  const darkValues = darkDeclarations(used);
  let css = `@media (prefers-color-scheme: dark) { svg:root { ${darkValues} } }\n.dark svg { ${darkValues} }\n`;
  if (animate) {
    css += ENTRANCE_CSS;
    let i = 0;
    for (const p of F.svg.querySelectorAll("[data-panel]")) p.style.animationDelay = `${i++ * PANEL_STAGGER_MS}ms`;
  }
  const st = document.createElementNS("http://www.w3.org/2000/svg", "style");
  st.textContent = css;
  F.svg.insertBefore(st, F.svg.firstChild);
}

