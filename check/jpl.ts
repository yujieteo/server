import ts from "ts-parser";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { type Finding, REPO_ROOT } from "./lib.ts";

const JPL_GOOSE_GLOBS = ["room/**/*.goose"];
const SOURCE_GLOBS = ["check/**/*.ts"];
const JPL_MAX_LINES = 60;
const JPL_LONG_FUNCTIONS: Record<string, number> = {
  "room/room.goose:handle": 132,
  "check/comments.ts:findCLikeComments": 71,
  "check/scripts.test.ts:file>anonymous#9": 65,
};

type Kind = "fn" | "member" | "ctor";
type Via = "id" | "this" | "member" | "new" | "new-member";
type Call = { readonly via: Via; readonly object: string; readonly name: string };
type Fn = { file: string; name: string; start: number; lines: number; calls: Call[]; scope: string[]; cls: string; kind: Kind; edges: Fn[] };
type Import = { readonly file: string; readonly name: string };
type Parsed = { fns: Fn[]; imports: Map<string, Import> };
type Walk = { outer: string; scope: string[]; cls: string };
type Ctx = { index: Map<string, Fn[]>; imports: Map<string, Map<string, Import>> };

function files(root: string, patterns: readonly string[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) for (const f of new Glob(pattern).scanSync({ cwd: root })) found.add(f);
  return [...found].sort();
}

function blankCommentsAndStrings(text: string): string {
  return text.replace(/\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"/g, (m) => " ".repeat(m.length));
}

function gooseFunctions(file: string, text: string): Fn[] {
  const code = blankCommentsAndStrings(text);
  const found: Fn[] = [];
  const header = /^(?:export\s+)?fn\s+(\w+)/gm;
  for (let m = header.exec(code); m !== null; m = header.exec(code)) {
    const open = code.indexOf("{", m.index);
    let depth = 0;
    let end = open;
    for (; end < code.length; end++) {
      if (code[end] === "{") depth++;
      else if (code[end] === "}" && --depth === 0) break;
    }
    const line = (at: number): number => code.slice(0, at).split("\n").length;
    const calls = [...code.slice(open, end).matchAll(/\b(\w+)\s*\(/g)].map((c): Call => ({ via: "id", object: "", name: c[1] as string }));
    const name = m[1] as string;
    found.push({ file, name, start: line(m.index), lines: line(end) - line(m.index) + 1, calls, scope: [name], cls: "", kind: "fn", edges: [] });
  }
  return found;
}

const FUNCTION_KINDS = [
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.Constructor,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.SetAccessor,
];

function callOf(node: ts.Node): Call | null {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return null;
  const isNew = ts.isNewExpression(node);
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return { via: isNew ? "new" : "id", object: "", name: callee.text };
  if (!ts.isPropertyAccessExpression(callee)) return null;
  const name = callee.name.text;
  if (callee.expression.kind === ts.SyntaxKind.ThisKeyword) return isNew ? null : { via: "this", object: "", name };
  if (ts.isIdentifier(callee.expression)) return { via: isNew ? "new-member" : "member", object: callee.expression.text, name };
  return null;
}

function callsIn(function_: ts.Node): Call[] {
  const calls: Call[] = [];
  const stack = [...function_.getChildren()];
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    if (FUNCTION_KINDS.includes(c.kind)) continue;
    const call = callOf(c);
    if (call !== null) calls.push(call);
    stack.push(...c.getChildren());
  }
  return calls;
}

function ownName(node: ts.Node, source: ts.SourceFile): string {
  const parent = node.parent;
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) && node.name) return node.name.getText(source);
  if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) return `${ts.isGetAccessor(node) ? "get" : "set"} ${node.name.getText(source)}`;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText(source);
  return ts.isConstructorDeclaration(node) ? "constructor" : "";
}

function kindOf(node: ts.Node): Kind {
  if (ts.isConstructorDeclaration(node)) return "ctor";
  const parent = node.parent;
  const member = ts.isClassLike(parent) || ts.isObjectLiteralExpression(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent);
  return member ? "member" : "fn";
}

function containerName(node: ts.Node, source: ts.SourceFile): string | null {
  if (!ts.isClassLike(node) && !ts.isObjectLiteralExpression(node)) return null;
  const parent = node.parent;
  const named = ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) ? parent.name.getText(source) : null;
  if (ts.isClassLike(node)) return node.name?.getText(source) ?? named ?? "<class>";
  return named ?? "<object>";
}

function importsOf(source: ts.SourceFile, known: ReadonlySet<string>): Map<string, Import> {
  const found = new Map<string, Import>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const base = normalize(join(dirname(source.fileName), statement.moduleSpecifier.text));
    const file = [base, `${base}.ts`].find((candidate) => known.has(candidate));
    const bindings = statement.importClause?.namedBindings;
    if (file === undefined || bindings === undefined) continue;
    if (ts.isNamespaceImport(bindings)) found.set(bindings.name.text, { file, name: "*" });
    else for (const element of bindings.elements) found.set(element.name.text, { file, name: (element.propertyName ?? element.name).text });
  }
  return found;
}

function tsFile(file: string, text: string, known: ReadonlySet<string>): Parsed {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Fn[] = [];
  const seen = new Map<string, number>();
  const pending: [ts.Node, Walk][] = [[source, { outer: "file", scope: [], cls: "" }]];
  for (let item = pending.shift(); item !== undefined; item = pending.shift()) {
    const [node, walk] = item;
    let next = walk;
    const container = containerName(node, source);
    if (container !== null) {
      const scope = [...walk.scope, container];
      next = { outer: walk.outer, scope, cls: scope.join(".") };
    } else if (FUNCTION_KINDS.includes(node.kind)) {
      const own = ownName(node, source);
      const base = own === "" ? `${walk.outer}>anonymous` : own;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const name = n === 1 ? base : `${base}#${n}`;
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const last = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const scope = [...walk.scope, own === "" ? "<anonymous>" : own];
      found.push({ file, name, start: first, lines: last - first + 1, calls: callsIn(node), scope, cls: walk.cls, kind: kindOf(node), edges: [] });
      next = { outer: name, scope, cls: walk.cls };
    }
    for (const child of node.getChildren(source)) pending.push([child, next]);
  }
  return { fns: found, imports: importsOf(source, known) };
}

function pick(ctx: Ctx, file: string, path: string[], kinds: readonly Kind[]): Fn[] {
  if (path.length === 0) return [];
  return (ctx.index.get(`${file}\0${path.join(".")}`) ?? []).filter((f) => kinds.includes(f.kind));
}

function lexical(ctx: Ctx, caller: Fn, path: string[], kinds: readonly Kind[]): Fn[] {
  for (let depth = caller.scope.length; depth >= 0; depth--) {
    const found = pick(ctx, caller.file, [...caller.scope.slice(0, depth), ...path], kinds);
    if (found.length > 0) return found;
  }
  return [];
}

function imported(ctx: Ctx, caller: Fn, local: string, rest: string[], kinds: readonly Kind[]): Fn[] {
  const target = ctx.imports.get(caller.file)?.get(local);
  if (target === undefined) return [];
  return pick(ctx, target.file, target.name === "*" ? rest : [target.name, ...rest], kinds);
}

function resolve(ctx: Ctx, f: Fn, c: Call): Fn[] {
  switch (c.via) {
    case "id":
      return [...lexical(ctx, f, [c.name], ["fn"]), ...imported(ctx, f, c.name, [], ["fn"])];
    case "this":
      return f.cls === "" ? [] : pick(ctx, f.file, [...f.cls.split("."), c.name], ["member"]);
    case "member":
      return [...lexical(ctx, f, [c.object, c.name], ["member"]), ...imported(ctx, f, c.object, [c.name], ["fn", "member"])];
    case "new":
      return [...lexical(ctx, f, [c.name, "constructor"], ["ctor"]), ...imported(ctx, f, c.name, ["constructor"], ["ctor"])];
    case "new-member":
      return imported(ctx, f, c.object, [c.name, "constructor"], ["ctor"]);
  }
}

function recursion(fns: Fn[], ctx: Ctx): Finding[] {
  const problems: Finding[] = [];
  for (const f of fns) f.edges = f.calls.flatMap((c) => resolve(ctx, f, c));
  for (const f of fns) {
    const visited = new Set<Fn>();
    const stack = [...f.edges];
    for (let g = stack.pop(); g !== undefined; g = stack.pop()) {
      if (g === f) {
        problems.push({ file: f.file, line: f.start, message: `${f.name} can call itself (JPL rule 1: no recursion)` });
        break;
      }
      if (!visited.has(g)) {
        visited.add(g);
        stack.push(...g.edges);
      }
    }
  }
  return problems;
}

function lengths(fns: Fn[], allowedLong: Record<string, number>): Finding[] {
  const problems: Finding[] = [];
  const listed = new Set<string>();
  for (const f of fns) {
    const key = `${f.file}:${f.name}`;
    const allowed = allowedLong[key];
    if (allowed !== undefined) listed.add(key);
    if (f.lines > (allowed ?? JPL_MAX_LINES)) {
      problems.push({ file: f.file, line: f.start, message: `${f.name} has ${f.lines} lines (JPL rule 4: at most ${allowed ?? JPL_MAX_LINES})` });
    } else if (allowed !== undefined && f.lines < allowed) {
      problems.push({ file: f.file, line: f.start, message: `${f.name} has ${f.lines} lines: lower its limit in JPL_LONG_FUNCTIONS to ${f.lines > JPL_MAX_LINES ? f.lines : "nothing (remove it)"}` });
    }
  }
  for (const key of Object.keys(allowedLong)) if (!listed.has(key)) problems.push({ file: key, line: 0, message: "is in JPL_LONG_FUNCTIONS but no such function exists: remove it" });
  return problems;
}

export function checkJpl(root: string, allowedLong: Record<string, number> = JPL_LONG_FUNCTIONS): Finding[] {
  const tsFiles = files(root, SOURCE_GLOBS);
  const known = new Set(tsFiles);
  const parsed = tsFiles.map((f) => ({ file: f, ...tsFile(f, readFileSync(`${root}/${f}`, "utf8"), known) }));
  const fns = [
    ...files(root, JPL_GOOSE_GLOBS).flatMap((f) => gooseFunctions(f, readFileSync(`${root}/${f}`, "utf8"))),
    ...parsed.flatMap((p) => p.fns),
  ];
  const ctx: Ctx = { index: new Map(), imports: new Map(parsed.map((p) => [p.file, p.imports])) };
  for (const f of fns) {
    const key = `${f.file}\0${f.scope.join(".")}`;
    ctx.index.set(key, [...(ctx.index.get(key) ?? []), f]);
  }
  return [...recursion(fns, ctx), ...lengths(fns, allowedLong)];
}

export async function jpl(): Promise<readonly Finding[]> {
  return checkJpl(REPO_ROOT);
}
