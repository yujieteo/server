import ts from "ts-parser";
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { type Finding, REPO_ROOT } from "./lib.ts";

const JPL_GOOSE_GLOBS = ["room/**/*.goose"];
const SOURCE_GLOBS = ["check/**/*.ts"];
const JPL_MAX_LINES = 60;
const JPL_LONG_FUNCTIONS: Record<string, number> = {
  "room/room.goose:handle": 132,
  "check/comments.ts:findCLikeComments": 71,
  "check/scripts.test.ts:file>anonymous#9": 65,
};

type Fn = { file: string; name: string; start: number; lines: number; calls: string[]; sites: Site[]; bases: ts.Expression[]; node: ts.Node | null; edges: Fn[] };

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
    const calls = [...code.slice(open, end).matchAll(/\b(\w+)\s*\(/g)].map((c) => c[1] as string);
    const name = m[1] as string;
    found.push({ file, name, start: line(m.index), lines: line(end) - line(m.index) + 1, calls, sites: [], bases: [], node: null, edges: [] });
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

type Site = ts.CallExpression | ts.NewExpression;

function isInstanceField(node: ts.Node): node is ts.PropertyDeclaration {
  return ts.isPropertyDeclaration(node) && !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
}

function callsIn(function_: ts.Node): Site[] {
  const sites: Site[] = [];
  const stack = [...function_.getChildren()];
  for (let c = stack.pop(); c !== undefined; c = stack.pop()) {
    if (FUNCTION_KINDS.includes(c.kind) || isInstanceField(c)) continue;
    if (ts.isCallExpression(c) || ts.isNewExpression(c)) sites.push(c);
    stack.push(...c.getChildren());
  }
  return sites;
}

function ownName(node: ts.Node, source: ts.SourceFile): string {
  const parent = node.parent;
  if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node)) && node.name) return node.name.getText(source);
  if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) return `${ts.isGetAccessor(node) ? "get" : "set"} ${node.name.getText(source)}`;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText(source);
  return ts.isConstructorDeclaration(node) ? "constructor" : "";
}

function baseOf(cls: ts.ClassLikeDeclaration): ts.Expression[] {
  const base = cls.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
  return base === undefined ? [] : [base.expression];
}

function initializerSites(cls: ts.ClassLikeDeclaration): Site[] {
  return cls.members.filter(isInstanceField).flatMap((field) => callsIn(field));
}

function tsFile(file: string, source: ts.SourceFile): Fn[] {
  const found: Fn[] = [];
  const seen = new Map<string, number>();
  const pending: [ts.Node, string][] = [[source, "file"]];
  for (let item = pending.shift(); item !== undefined; item = pending.shift()) {
    const [node, outer] = item;
    let scope = outer;
    if (ts.isClassLike(node) && !node.members.some(ts.isConstructorDeclaration)) {
      const sites = initializerSites(node);
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const bases = baseOf(node);
      if (sites.length > 0 || bases.length > 0) found.push({ file, name: `${node.name?.getText(source) ?? "class"}>init`, start: line, lines: 1, calls: [], sites, bases, node, edges: [] });
    }
    if (FUNCTION_KINDS.includes(node.kind)) {
      const own = ownName(node, source);
      const base = own === "" ? `${outer}>anonymous` : own;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const name = n === 1 ? base : `${base}#${n}`;
      const first = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const last = source.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      found.push({ file, name, start: first, lines: last - first + 1, calls: [], sites: ts.isConstructorDeclaration(node) ? [...callsIn(node), ...initializerSites(node.parent)] : callsIn(node), bases: ts.isConstructorDeclaration(node) ? baseOf(node.parent) : [], node, edges: [] });
      scope = name;
    }
    for (const child of node.getChildren(source)) pending.push([child, scope]);
  }
  return found;
}

function classNodes(declaration: ts.ClassLikeDeclaration): ts.Node[] {
  const constructors = declaration.members.filter(ts.isConstructorDeclaration);
  return constructors.length > 0 ? constructors : [declaration];
}

function functionNodes(declaration: ts.Node): ts.Node[] {
  if (ts.isClassLike(declaration)) return classNodes(declaration);
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) {
    let init = declaration.initializer;
    while (init !== undefined && ts.isParenthesizedExpression(init)) init = init.expression;
    if (init !== undefined && ts.isClassExpression(init)) return classNodes(init);
    return init !== undefined && FUNCTION_KINDS.includes(init.kind) ? [init] : [];
  }
  return FUNCTION_KINDS.includes(declaration.kind) ? [declaration] : [];
}

function nodesOf(checker: ts.TypeChecker, expression: ts.Expression): ts.Node[] {
  let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(expression) ? expression.name : expression);
  if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return (symbol?.declarations ?? []).flatMap(functionNodes);
}

function link(fns: Fn[], checker: ts.TypeChecker): void {
  const byNode = new Map<ts.Node, Fn>(fns.flatMap((f) => (f.node === null ? [] : [[f.node, f] as [ts.Node, Fn]])));
  const byName = new Map<string, Fn[]>();
  for (const f of fns) if (f.node === null) byName.set(`${f.file}\0${f.name}`, [...(byName.get(`${f.file}\0${f.name}`) ?? []), f]);
  for (const f of fns) {
    const named = f.calls.flatMap((c) => byName.get(`${f.file}\0${c}`) ?? []);
    const typed = [...f.sites.map((site) => site.expression), ...f.bases].flatMap((e) => nodesOf(checker, e).flatMap((n) => byNode.get(n) ?? []));
    f.edges = [...named, ...typed];
  }
}

function recursion(fns: Fn[]): Finding[] {
  const problems: Finding[] = [];
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

const COMPILER_OPTIONS: ts.CompilerOptions = {
  noEmit: true,
  noLib: true,
  types: [],
  allowImportingTsExtensions: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
};

export function checkJpl(root: string, allowedLong: Record<string, number> = JPL_LONG_FUNCTIONS): Finding[] {
  const tsFiles = files(root, SOURCE_GLOBS);
  const program = ts.createProgram(tsFiles.map((f) => `${root}/${f}`), COMPILER_OPTIONS, ts.createCompilerHost(COMPILER_OPTIONS, true));
  const fns = [
    ...files(root, JPL_GOOSE_GLOBS).flatMap((f) => gooseFunctions(f, readFileSync(`${root}/${f}`, "utf8"))),
    ...tsFiles.flatMap((f) => tsFile(f, program.getSourceFile(`${root}/${f}`) as ts.SourceFile)),
  ];
  link(fns, program.getTypeChecker());
  return [...recursion(fns), ...lengths(fns, allowedLong)];
}

export async function jpl(): Promise<readonly Finding[]> {
  return checkJpl(REPO_ROOT);
}
