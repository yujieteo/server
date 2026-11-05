import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { checkJpl } from "./jpl.ts";

function project(files: Record<string, string>): string {
  const root = mkdtempSync(`${tmpdir()}/jpl-`);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(`${root}/${name.split("/")[0]}`, { recursive: true });
    writeFileSync(`${root}/${name}`, body);
  }
  return root;
}

const body = (n: number): string => Array.from({ length: n }, (_, i) => `  x = ${i};`).join("\n");

test("SCR-187: recursion, direct or through another function, fails in Goose and TypeScript", () => {
  const root = project({
    "room/a.goose": "fn f(n: i64) -> i64 { g(n) }\nfn g(n: i64) -> i64 { f(n) }\nfn ok() { f2() }\nfn f2() {}\n",
    "check/a.ts": "function h(n: number): number { return n ? h(n - 1) : 0; }\nfunction fine(): number { return 1; }\n",
  });
  const names = checkJpl(root, {}).filter((p) => p.message.includes("rule 1")).map((p) => p.message.split(" ")[0]);
  expect(names.sort()).toEqual(["f", "g", "h"]);
});

test("SCR-187: a function of 61 lines fails and one of 60 passes, in Goose and TypeScript", () => {
  const root = project({
    "room/a.goose": `fn long() {\n${body(59)}\n}\nfn exact() {\n${body(58)}\n}\n`,
    "check/a.ts": `function long(): void {\n${body(59)}\n}\nfunction exact(): void {\n${body(58)}\n}\n`,
  });
  expect(checkJpl(root, {}).map((p) => `${p.file}:${p.line}`)).toEqual(["room/a.goose:1", "check/a.ts:1"]);
});

test("SCR-187: the list of long functions only shrinks, so a too generous or stale entry fails", () => {
  const root = project({ "check/a.ts": `function long(): void {\n${body(69)}\n}\nfunction gone(): void {}\n` });
  const generous = checkJpl(root, { "check/a.ts:long": 80, "check/a.ts:gone": 70, "check/a.ts:missing": 70 });
  expect(generous.map((p) => p.message.split(" ").slice(0, 3).join(" ")).sort()).toEqual([
    "gone has 1",
    "is in JPL_LONG_FUNCTIONS",
    "long has 71",
  ]);
  expect(checkJpl(root, { "check/a.ts:long": 71 })).toEqual([]);
});
