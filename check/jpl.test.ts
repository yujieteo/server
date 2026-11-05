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

const rule1 = (root: string): string[] =>
  checkJpl(root, {}).filter((p) => p.message.includes("rule 1")).map((p) => p.message.split(" ")[0] as string).sort();

test("SCR-225 R4: direct and mutual recursion fail in Goose", () => {
  const direct = project({ "room/a.goose": "fn f(n: i64) -> i64 { f(n) }\nfn ok() { f2() }\nfn f2() {}\n" });
  expect(rule1(direct)).toEqual(["f"]);
  const mutual = project({ "room/a.goose": "fn f(n: i64) -> i64 { g(n) }\nfn g(n: i64) -> i64 { f(n) }\nfn ok() { f2() }\nfn f2() {}\n" });
  expect(rule1(mutual)).toEqual(["f", "g"]);
});

test("SCR-225 R4: direct and mutual recursion fail in TypeScript", () => {
  const direct = project({ "check/a.ts": "function h(n: number): number { return n ? h(n - 1) : 0; }\nfunction fine(): number { return 1; }\n" });
  expect(rule1(direct)).toEqual(["h"]);
  const mutual = project({ "check/a.ts": "function p(n: number): number { return q(n); }\nfunction q(n: number): number { return p(n); }\nfunction fine(): number { return p; }\n" });
  expect(rule1(mutual)).toEqual(["p", "q"]);
});

test("SCR-225 R2: recursion through an object member, this, a static member and a constructor fails", () => {
  const root = project({
    "check/a.ts": [
      "const o = { f(): number { return o.f(); } };",
      "class C { constructor() { new C(); } m(): void { this.m(); } static s(): void { C.s(); } }",
      "class D { m(): void { this.n(); } n(): void { this.m(); } }",
    ].join("\n"),
  });
  expect(rule1(root)).toEqual(["constructor", "f", "m", "m#2", "n", "s"]);
});

test("SCR-225 R1: recursion across imports fails, and same names in other scopes do not", () => {
  const cycle = project({
    "check/a.ts": 'import { b } from "./b.ts";\nexport function a(): void { b(); }\n',
    "check/b.ts": 'import * as m from "./a.ts";\nexport function b(): void { m.a(); }\n',
  });
  expect(rule1(cycle)).toEqual(["a", "b"]);
  const clean = project({
    "check/a.ts": [
      "function top(): void {}",
      "function outer1(): void { function top(): void { return; } top(); }",
      "function outer2(): void { function inner(): void {} inner(); }",
      "function inner(): void { outer2(); }",
      "class K { top(): void { top(); } helper(): void { this.top(); } }",
    ].join("\n"),
  });
  expect(rule1(clean)).toEqual([]);
});

test("SCR-225 R3: a getter or setter of 61 lines fails rule 4", () => {
  const root = project({ "check/a.ts": `class K {\n  get big(): number {\n${body(59)}\n  return 1;\n  }\n  set big(v: number) {\n${body(59)}\n  }\n}\n` });
  expect(checkJpl(root, {}).map((p) => p.message.split(" ").slice(0, 4).join(" "))).toEqual(["get big has 62", "set big has 61"]);
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

test("SCR-225 round 2 R1: a parameter, local binding or block that shadows an import or function is not a call to it", () => {
  const root = project({
    "check/a.ts": 'import { b, c, d } from "./b.ts";\nexport function a(): void { b(a); c(); d(); }\n',
    "check/b.ts": [
      'import { a } from "./a.ts";',
      "export function b(a: () => void): void { a(); }",
      "export function c(): void { const a = (): void => {}; a(); }",
      "export function d(): void { { const a = (): void => {}; a(); } }",
    ].join("\n"),
    "check/e.ts": "function f(): void { { const g = (): void => {}; g(); } }\nfunction g(): void { f(); }\n",
  });
  expect(rule1(root)).toEqual([]);
});

test("SCR-225 round 2 R5: a named function expression bound to a variable, property or field is recursive through its outer name", () => {
  const root = project({
    "check/a.ts": [
      "const f = function inner(): void { f(); };",
      "const o = { g: function inner2(): void { o.g(); } };",
      "class K { h = function inner3(this: K): void { this.h(); }; }",
    ].join("\n"),
  });
  expect(rule1(root)).toEqual(["inner", "inner2", "inner3"]);
});

test("SCR-225 round 2 R6: a static member calling the same name on its class is not an instance method calling itself", () => {
  const root = project({
    "check/a.ts": "class C { static f(): void {} f(): void { C.f(); } }\nclass D { static f(): void { D.f(); } f(): void {} }\n",
  });
  expect(rule1(root)).toEqual(["f#3"]);
  const instance = project({ "check/a.ts": "class C { f(): void {} g(c: C): void { c.f(); } }\nclass E { f(e: E): void { e.f(); } }\n" });
  expect(rule1(instance)).toEqual(["f#2"]);
});

test("SCR-225 round 3 R7: an instance field initializer runs at construction, not in the function that declares the class", () => {
  const clean = project({ "check/a.ts": "function f(): unknown { class C { x = f(); } return C; }\n" });
  expect(rule1(clean)).toEqual([]);
  const implicit = project({ "check/a.ts": "function f(): object { return new C(); }\nclass C { x = f(); }\n" });
  expect(rule1(implicit)).toEqual(["C>init", "f"]);
  const explicit = project({ "check/a.ts": "function f(): object { return new C(); }\nclass C { x = f(); constructor() {} }\n" });
  expect(rule1(explicit)).toEqual(["constructor", "f"]);
  const staticField = project({ "check/a.ts": "function f(): unknown { class C { static x = f(); } return C; }\n" });
  expect(rule1(staticField)).toEqual(["f"]);
});

test("SCR-225 round 4 R7: constructing a derived class with an implicit constructor runs the base initializers", () => {
  const root = project({ "check/a.ts": "function f(): object { return new D(); }\nclass B { x = f(); }\nclass D extends B {}\n" });
  expect(rule1(root)).toEqual(["B>init", "D>init", "f"]);
  const clean = project({ "check/a.ts": "class B { x = 1; }\nclass D extends B {}\nfunction f(): object { return new D(); }\n" });
  expect(rule1(clean)).toEqual([]);
});

test("SCR-225 round 4 R8: construction through a variable or property bound to a class expression is resolved", () => {
  const variable = project({ "check/a.ts": "function f(): object { return new C(); }\nconst C = class { x = f(); };\n" });
  expect(rule1(variable)).toEqual(["class>init", "f"]);
  const property = project({ "check/a.ts": "const o = { C: class { constructor() { new o.C(); } } };\n" });
  expect(rule1(property)).toEqual(["constructor"]);
});
