import { readFile } from "node:fs/promises";
import { CLikeScanner } from "./clike-scan.ts";
import { assert, type Finding, REPO_ROOT, lineOf, trackedFiles } from "./lib.ts";
import { type Comment, endOfLine, HASH_WORD_START } from "./scan.ts";
import { ShellScanner } from "./shell-scan.ts";

export type CommentSyntax = "shell" | "line-hash" | "c-like" | "html" | "none";

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
  ".oxlintrc.json",
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
  assert(path !== "", "a file has a name");
  assert(!path.startsWith("/"), "a file is relative to the repo");
  if (NO_COMMENT_SYNTAX.has(path)) return "none";
  if (SHELL_FILES.has(path) || path.startsWith("bin/") || path.startsWith("etc/rc.d/")) return "shell";
  if (path.startsWith("etc/") || path === ".gitignore" || path === ".gitleaks.toml" || path === "power10.toml" || path.endsWith(".yml")) return "line-hash";
  if (path.endsWith(".ts") || path.endsWith(".c") || path.endsWith(".h") || path === "tsconfig.json") return "c-like";
  if (path.endsWith(".html")) return "html";
  return "unclassified";
}

export function findShellComments(text: string): readonly Comment[] {
  assert(!text.includes("\0"), "a shell text has no NUL byte");
  assert(text.length < 10 ** 8, "a text is bounded");
  return new ShellScanner(text).scan();
}

function lineHashComment(line: string, text: string, lineStart: number): Comment | null {
  assert(lineStart >= 0, "a line starts inside the text");
  assert(!line.includes("\n"), "a line has no newline");
  let quote = "";
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i] ?? "";
    if (quote !== "") {
      if (c === "\\") i += 1;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || HASH_WORD_START.has(line[i - 1] ?? ""))) {
      return { line: lineOf(text, lineStart + i), text: line.slice(i) };
    }
  }
  return null;
}

export function findLineHashComments(text: string): readonly Comment[] {
  assert(!text.includes("\0"), "a text has no NUL byte");
  assert(text.length < 10 ** 8, "a text is bounded");
  const found: Comment[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const end = endOfLine(text, lineStart);
    const comment = lineHashComment(text.slice(lineStart, end), text, lineStart);
    if (comment !== null) found.push(comment);
    lineStart = end + 1;
  }
  return found;
}

export function findCLikeComments(text: string): readonly Comment[] {
  assert(!text.includes("\0"), "a text has no NUL byte");
  assert(text.length < 10 ** 8, "a text is bounded");
  return new CLikeScanner(text).scan();
}

function scriptComments(text: string, body: string, start: number): readonly Comment[] {
  assert(start >= 0, "a script starts inside the page");
  assert(text.length >= body.length, "a script is part of the page");
  const found: Comment[] = [];
  const first = lineOf(text, start);
  for (const inner of findCLikeComments(body)) found.push({ line: first + inner.line - 1, text: inner.text });
  return found;
}

export function findHtmlComments(text: string): readonly Comment[] {
  assert(!text.includes("\0"), "a text has no NUL byte");
  assert(text.length < 10 ** 8, "a text is bounded");
  const found: Comment[] = [];
  for (const match of text.matchAll(/<(script|style)\b[^>]*>(.*?)<\/\1\s*>|<!--(.*?)-->/gsu)) {
    if (match[3] !== undefined) found.push({ line: lineOf(text, match.index), text: match[3] });
    else if ((match[2] ?? "") !== "") found.push(...scriptComments(text, match[2] ?? "", match.index + match[0].indexOf(">") + 1));
  }
  return found;
}

const OUTSIDE_LINK = /https?:\/\/[A-Za-z0-9-]+\.[A-Za-z]/;

function commentsOfSyntax(syntax: CommentSyntax, text: string): readonly Comment[] {
  assert(text.length >= 0, "a text has a length");
  assert(["shell", "line-hash", "c-like", "html", "none"].includes(syntax), "a known syntax");
  assert(text.length < 10 ** 8, "a text is bounded");
  if (syntax === "shell") return findShellComments(text);
  if (syntax === "line-hash") return findLineHashComments(text);
  if (syntax === "c-like") return findCLikeComments(text);
  if (syntax === "html") return findHtmlComments(text);
  return [];
}

export function findComments(syntax: CommentSyntax, text: string): readonly Comment[] {
  assert(text.length < 10 ** 8, "a text is bounded");
  assert(syntax !== undefined, "a syntax is set");
  const kept: Comment[] = [];
  for (const comment of commentsOfSyntax(syntax, text)) {
    if (!(comment.line === 1 && comment.text.startsWith("#!")) && !OUTSIDE_LINK.test(comment.text)) kept.push(comment);
  }
  return kept;
}

async function fileFindings(path: string): Promise<readonly Finding[]> {
  assert(path !== "", "a file has a name");
  assert(!(path in EXCLUDED), "an excluded file is not read");
  const syntax = syntaxOf(path);
  if (syntax === "unclassified") return [{ file: path, line: 0, message: "no comment syntax is set for this file in check/comments.ts" }];
  const text = await readFile(`${REPO_ROOT}/${path}`, "utf8");
  const findings: Finding[] = [];
  for (const comment of findComments(syntax, text)) findings.push({ file: path, line: comment.line, message: `comment: ${comment.text.slice(0, 60)}` });
  return findings;
}

export async function noComments(): Promise<readonly Finding[]> {
  const tracked = await trackedFiles();
  assert(tracked.length > 0, "the repo tracks files");
  assert(REPO_ROOT !== "", "the repo root is known");
  const jobs: Promise<readonly Finding[]>[] = [];
  for (const path of tracked) if (!(path in EXCLUDED)) jobs.push(fileFindings(path));
  return (await Promise.all(jobs)).flat();
}
