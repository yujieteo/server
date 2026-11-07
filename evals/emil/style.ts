import { deepStrictEqual, throws } from "node:assert/strict";
import type { Figure, Library, SvgNode } from "../../.claude/skills/schematic-emil/style.ts";
import { hex, patentFigure, token } from "../../.claude/skills/schematic-emil/tokens.ts";

class FakeFontFace {
  load(): Promise<FakeFontFace> {
    return Promise.resolve(this);
  }
}

class FakeStyle {
  fontFeatureSettings = "";
  animationDelay = "";
  setProperty(): void {}
}

class FakeNode implements SvgNode {
  readonly style = new FakeStyle();
  firstChild: unknown = null;
  getAttribute(): string | null {
    return null;
  }
  setAttribute(): void {}
  getBBox(): { y: number } {
    return { y: 0 };
  }
  querySelector(): SvgNode | null {
    return null;
  }
  querySelectorAll(): SvgNode[] {
    return [];
  }
  insertBefore(): void {}
}

class FakeDocument {
  readonly fonts = { add(): void {} };
  createElementNS(): { textContent: string } {
    return { textContent: "" };
  }
}

Object.assign(globalThis, { FontFace: FakeFontFace, document: new FakeDocument() });

function library(): Library {
  return {
    STYLE: { font: { family: "", math: "" }, color: {}, text: {}, line: {}, arrow: {} },
    PATENT: { text: { fig: 1, legend: 1, numeral: 1 }, line: {}, arrow: {}, margin: { left: 1, top: 1, right: 1, bottom: 1 } },
    mm(value: number): number {
      return value;
    },
    el(): null {
      return null;
    },
  };
}

function figure(): Figure {
  return { svg: new FakeNode(), root: null, widthMM: 100, heightMM: 100 };
}

function pass(label: string): void {
  console.log(`PASS ${label}`);
}

deepStrictEqual([hex("#fff"), hex("white"), hex("BLACK"), hex("#12345"), hex("rgb(0,0,0)")], ["#ffffff", "#ffffff", "#000000", null, null]);
pass("hex expands a short colour and names");
deepStrictEqual([token("#0090ff"), token("#ffffff"), token("#000000")], ["blue-9", "gray-100", "gray-1200"]);
pass("a colour that is not a token maps to the nearest token");
deepStrictEqual(patentFigure({ sheet: "a4", name: "fig1", sheetId: "1" }, true), { format: "slide", width: 210, height: 297, name: "fig1-colour" });
pass("patent colour version on a4 drops the sheet keys");
deepStrictEqual(patentFigure({ sheet: "a4" }, false), { sheet: "a4", format: "patent" });
pass("patent filing version keeps the base");
throws(patentFigure.bind(null, { sheet: "tabloid" }, true), /unknown sheet/u);
pass("patent colour version of an unknown sheet fails");

const style = await import("../../.claude/skills/schematic-emil/style.ts");
const lib = library();
const fig = figure();
const look = style.useEmil(fig, lib, "web");
deepStrictEqual(look.s, 0.5);
pass("web venue halves the site px scale");
deepStrictEqual(lib.STYLE.font.family, "Inter, sans-serif");
pass("web venue sets the Inter font");
deepStrictEqual(fig.svg.style.fontFeatureSettings, '"cv01", "ss03"');
pass("web venue sets the site font features");
throws(style.useEmil.bind(null, figure(), library(), "billboard"), /unknown venue/u);
pass("an unknown venue fails");
