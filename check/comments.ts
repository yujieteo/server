import { readFile } from "node:fs/promises";
import { type Finding, REPO_ROOT, lineOf, trackedFiles } from "./lib.ts";

export type CommentSyntax = "shell" | "line-hash" | "c-like" | "html" | "none";

export interface Comment {
  readonly line: number;
  readonly text: string;
}

const GENERATED_BY_GOOSE = "C that the Goose compiler writes; the fix belongs in the generator";
const COPIED_FROM_POND = "copy of server/ in github.com/yujieteo/pond at commit cb6bbac6ffcb050347d1fab6852e4302184d1362 (README.md)";

export const EXCLUDED: Readonly<Record<string, string>> = {
  "room/room.c": GENERATED_BY_GOOSE,
  "pond/pond_save.c": GENERATED_BY_GOOSE,
  "pond/pond_read.c": GENERATED_BY_GOOSE,
  "pond/pond_lock.h": COPIED_FROM_POND,
  "pond/pond_verify.h": COPIED_FROM_POND,
  "pond/pond_read.h": COPIED_FROM_POND,
  "room/room.goose": "Goose source; the Goose compiler is not in this repo, so a rename cannot be rebuilt and checked here",
  "docs/figures/private-names.js": "figure source; it imports emil.js of the schematic-emil skill, which is not in this repo",
  "bun.lock": "written by bun",
};

const NO_COMMENT_SYNTAX = new Set([
  "README.md",
  "docs/figures/private-names.svg",
  "www/contact.gpg",
  "www/.well-known/mta-sts.txt",
  "www/.well-known/security.txt",
  "www/.well-known/openpgpkey/policy",
  "www/.well-known/openpgpkey/hu/dj3498u4hyyarh35rkjfnghbjxug6b19",
  "package.json",
  "knip.json",
]);

const SHELL_FILES = new Set([
  "apply",
  "share",
  "mail-alias",
  "private-setup",
  "install.sh",
  "test.sh",
  "local.conf.example",
  ".githooks/pre-commit",
]);

function syntaxOf(path: string): CommentSyntax | "unclassified" {
  if (NO_COMMENT_SYNTAX.has(path)) return "none";
  if (SHELL_FILES.has(path) || path.startsWith("bin/") || path.startsWith("etc/rc.d/")) return "shell";
  if (path.startsWith("etc/") || path === ".gitignore" || path === ".gitleaks.toml" || path.endsWith(".yml")) return "line-hash";
  if (path.endsWith(".ts") || path.endsWith(".c") || path.endsWith(".h") || path === "tsconfig.json") return "c-like";
  if (path.endsWith(".html")) return "html";
  return "unclassified";
}

const HASH_WORD_START = new Set([" ", "\t", "\n", ";", "|", "&", "("]);

function endOfLine(text: string, from: number): number {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
}

type ShellFrame =
  | { readonly kind: "scan"; readonly closing: boolean; depth: number }
  | { readonly kind: "double" }
  | { readonly kind: "braces"; depth: number };

interface ShellScan {
  readonly text: string;
  readonly found: Comment[];
  readonly pending: { readonly word: string; readonly stripTabs: boolean }[];
  readonly stack: ShellFrame[];
  pos: number;
}

function skipSingle(s: ShellScan): void {
  const close = s.text.indexOf("'", s.pos + 1);
  s.pos = close === -1 ? s.text.length : close + 1;
}

function skipBackquote(s: ShellScan): void {
  const close = s.text.indexOf("`", s.pos + 1);
  s.pos = close === -1 ? s.text.length : close + 1;
}

function readHeredocs(s: ShellScan): void {
  for (let next = s.pending.shift(); next !== undefined; next = s.pending.shift()) {
    while (s.pos < s.text.length) {
      const end = endOfLine(s.text, s.pos);
      const raw = s.text.slice(s.pos, end);
      s.pos = Math.min(end + 1, s.text.length);
      if ((next.stripTabs ? raw.replace(/^\t+/, "") : raw) === next.word) break;
    }
  }
}

function stepBraces(s: ShellScan, frame: { depth: number }): void {
  const c = s.text[s.pos];
  if (c === "\\") s.pos += 2;
  else if (c === "'") skipSingle(s);
  else if (c === '"') {
    s.pos += 1;
    s.stack.push({ kind: "double" });
  } else {
    if (c === "{") frame.depth += 1;
    if (c === "}") frame.depth -= 1;
    s.pos += 1;
    if (frame.depth === 0) s.stack.pop();
  }
}

function stepDouble(s: ShellScan): void {
  const c = s.text[s.pos];
  if (c === "\\") s.pos += 2;
  else if (c === '"') {
    s.pos += 1;
    s.stack.pop();
  } else if (c === "$" && s.text[s.pos + 1] === "(") {
    s.pos += 2;
    s.stack.push({ kind: "scan", closing: true, depth: 0 });
  } else if (c === "$" && s.text[s.pos + 1] === "{") {
    s.pos += 1;
    s.stack.push({ kind: "braces", depth: 0 });
  } else if (c === "`") skipBackquote(s);
  else s.pos += 1;
}

function stepHeredocStart(s: ShellScan): void {
  const heredoc = /^<<(-?)[ \t]*(["']?)([A-Za-z_][A-Za-z_0-9]*)\2/.exec(s.text.slice(s.pos, s.pos + 80));
  if (heredoc === null) s.pos += 2;
  else {
    s.pending.push({ word: heredoc[3] ?? "", stripTabs: heredoc[1] === "-" });
    s.pos += heredoc[0].length;
  }
}

function stepScan(s: ShellScan, frame: { readonly closing: boolean; depth: number }): void {
  const c = s.text[s.pos] ?? "";
  const before = s.pos === 0 ? "\n" : (s.text[s.pos - 1] ?? "");
  if (c === "\\") s.pos += 2;
  else if (c === "'") skipSingle(s);
  else if (c === '"') {
    s.pos += 1;
    s.stack.push({ kind: "double" });
  } else if (c === "`") skipBackquote(s);
  else if (c === "$" && s.text[s.pos + 1] === "(") {
    s.pos += 2;
    s.stack.push({ kind: "scan", closing: true, depth: 0 });
  } else if (c === "$" && s.text[s.pos + 1] === "{") {
    s.pos += 1;
    s.stack.push({ kind: "braces", depth: 0 });
  } else if (c === "<" && s.text[s.pos + 1] === "<" && s.text[s.pos + 2] !== "<" && s.text[s.pos + 2] !== "=") stepHeredocStart(s);
  else if (c === "#" && HASH_WORD_START.has(before)) {
    const end = endOfLine(s.text, s.pos);
    s.found.push({ line: lineOf(s.text, s.pos), text: s.text.slice(s.pos, end) });
    s.pos = end;
  } else if (c === "\n") {
    s.pos += 1;
    readHeredocs(s);
  } else if (c === "(") {
    frame.depth += 1;
    s.pos += 1;
  } else if (c === ")") {
    s.pos += 1;
    if (frame.depth === 0 && frame.closing) s.stack.pop();
    else frame.depth -= 1;
  } else s.pos += 1;
}

export function findShellComments(text: string): readonly Comment[] {
  const s: ShellScan = { text, found: [], pending: [], stack: [{ kind: "scan", closing: false, depth: 0 }], pos: 0 };
  while (s.pos < text.length) {
    const frame = s.stack[s.stack.length - 1];
    if (frame === undefined) break;
    if (frame.kind === "scan") stepScan(s, frame);
    else if (frame.kind === "double") stepDouble(s);
    else stepBraces(s, frame);
  }
  return s.found;
}

export function findLineHashComments(text: string): readonly Comment[] {
  const found: Comment[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const end = endOfLine(text, lineStart);
    const line = text.slice(lineStart, end);
    let quote = "";
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i] ?? "";
      if (quote !== "") {
        if (c === "\\") i += 1;
        else if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === "#" && (i === 0 || HASH_WORD_START.has(line[i - 1] ?? ""))) {
        found.push({ line: lineOf(text, lineStart + i), text: line.slice(i) });
        break;
      }
    }
    lineStart = end + 1;
  }
  return found;
}

const REGEX_PREFIX = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

export function findCLikeComments(text: string): readonly Comment[] {
  const found: Comment[] = [];
  let pos = 0;
  let previous = "";
  const templateDepth: number[] = [];
  let braceDepth = 0;
  const scanTemplate = (): void => {
    while (pos < text.length) {
      const c = text[pos];
      if (c === "\\") pos += 2;
      else if (c === "`") {
        pos += 1;
        return;
      } else if (c === "$" && text[pos + 1] === "{") {
        pos += 2;
        templateDepth.push(braceDepth);
        braceDepth += 1;
        return;
      } else pos += 1;
    }
  };
  while (pos < text.length) {
    const c = text[pos] ?? "";
    const next = text[pos + 1];
    if (c === "/" && next === "/") {
      const end = endOfLine(text, pos);
      found.push({ line: lineOf(text, pos), text: text.slice(pos, end) });
      pos = end;
    } else if (c === "/" && next === "*") {
      const close = text.indexOf("*/", pos + 2);
      const end = close === -1 ? text.length : close + 2;
      found.push({ line: lineOf(text, pos), text: text.slice(pos, end) });
      pos = end;
    } else if (c === '"' || c === "'") {
      pos += 1;
      while (pos < text.length && text[pos] !== c && text[pos] !== "\n") pos += text[pos] === "\\" ? 2 : 1;
      pos += 1;
      previous = c;
    } else if (c === "`") {
      pos += 1;
      scanTemplate();
      previous = "`";
    } else if (c === "/" && (previous === "" || REGEX_PREFIX.has(previous))) {
      pos += 1;
      let inClass = false;
      while (pos < text.length && text[pos] !== "\n" && (inClass || text[pos] !== "/")) {
        if (text[pos] === "\\") pos += 1;
        else if (text[pos] === "[") inClass = true;
        else if (text[pos] === "]") inClass = false;
        pos += 1;
      }
      pos += 1;
      previous = "/";
    } else {
      if (c === "{") braceDepth += 1;
      if (c === "}") {
        braceDepth -= 1;
        if (templateDepth.at(-1) === braceDepth) {
          templateDepth.pop();
          pos += 1;
          scanTemplate();
          previous = "`";
          continue;
        }
      }
      pos += 1;
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") previous = c;
    }
  }
  return found;
}

export async function findHtmlComments(text: string): Promise<readonly Comment[]> {
  const found: Comment[] = [];
  const rewriter = new HTMLRewriter();
  rewriter.onDocument({
    comments(comment) {
      found.push({ line: lineOf(text, text.indexOf(comment.text)), text: comment.text });
    },
  });
  for (const tag of ["script", "style"] as const) {
    rewriter.on(tag, {
      text(chunk) {
        if (chunk.text.length === 0) return;
        const start = text.indexOf(chunk.text);
        for (const inner of findCLikeComments(chunk.text)) {
          found.push({ line: lineOf(text, start) + inner.line - 1, text: inner.text });
        }
      },
    });
  }
  await rewriter.transform(new Response(text)).text();
  return found;
}

const OUTSIDE_LINK = /https?:\/\/[A-Za-z0-9-]+\.[A-Za-z]/;
const SHEBANG = /^#!/;

export async function findComments(syntax: CommentSyntax, text: string): Promise<readonly Comment[]> {
  const all = await (async (): Promise<readonly Comment[]> => {
    switch (syntax) {
      case "shell":
        return findShellComments(text);
      case "line-hash":
        return findLineHashComments(text);
      case "c-like":
        return findCLikeComments(text);
      case "html":
        return findHtmlComments(text);
      case "none":
        return [];
    }
  })();
  return all.filter((comment) => !(comment.line === 1 && SHEBANG.test(comment.text)) && !OUTSIDE_LINK.test(comment.text));
}

export async function noComments(): Promise<readonly Finding[]> {
  const findings: Finding[] = [];
  for (const path of await trackedFiles()) {
    if (path in EXCLUDED) continue;
    const syntax = syntaxOf(path);
    if (syntax === "unclassified") {
      findings.push({ file: path, line: 0, message: "no comment syntax is set for this file in check/comments.ts" });
      continue;
    }
    const text = await readFile(`${REPO_ROOT}/${path}`, "utf8");
    for (const comment of await findComments(syntax, text)) {
      findings.push({ file: path, line: comment.line, message: `comment: ${comment.text.slice(0, 60)}` });
    }
  }
  return findings;
}
