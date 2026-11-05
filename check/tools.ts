import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { assert, type Finding, REPO_ROOT, lineOf, need, orToolFailure, run, trackedFiles } from "./lib.ts";

const TSC = join(REPO_ROOT, "node_modules/.bin/tsc");

function tscFindings(stdout: string, fallbackFile: string): readonly Finding[] {
  assert(fallbackFile !== "", "a finding names a file");
  assert(TSC.endsWith("/tsc"), "tsc is the compiler that runs");
  const findings: Finding[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.includes(": error TS")) continue;
    const found = /^(.*?)\((\d+),\d+\): (.*)$/.exec(line);
    findings.push({ file: found?.[1] ?? fallbackFile, line: Number(found?.[2] ?? 0), message: found?.[3] ?? line });
  }
  return findings;
}

export async function typeCheck(): Promise<readonly Finding[]> {
  assert(TSC !== "", "the compiler has a path");
  assert(REPO_ROOT !== "", "the repo root is known");
  const ran = await run([TSC, "-p", "tsconfig.json"]);
  assert(Number.isInteger(ran.code), "tsc exited");
  return orToolFailure(ran, "tsconfig.json", ran.code === 0 ? [] : tscFindings(ran.stdout, "tsconfig.json"));
}

const INLINE_SCRIPT_TSCONFIG = {
  compilerOptions: {
    target: "esnext",
    module: "esnext",
    lib: ["esnext", "dom"],
    types: [],
    allowJs: true,
    checkJs: true,
    noEmit: true,
    strict: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,
    skipLibCheck: false,
  },
  include: ["*.js"],
};

function scriptOf(html: string): string {
  assert(html !== "", "a page has content");
  assert(html.includes("<"), "a page has markup");
  const chunks: string[] = [];
  for (const match of html.matchAll(/<script\b[^>]*>(.*?)<\/script>/gsu)) chunks.push(match[1] ?? "");
  const script = chunks.join("");
  assert(script.length <= html.length, "the scripts of a page are part of the page");
  return script;
}

async function inlineFindings(page: string): Promise<readonly Finding[]> {
  assert(page.endsWith(".html"), "only pages have inline scripts");
  const html = readFileSync(join(REPO_ROOT, page), "utf8");
  const script = scriptOf(html);
  assert(html.length > 0, "the page was read");
  if (script.trim() === "") return [];
  const work = mkdtempSync(join(tmpdir(), "inline-"));
  try {
    writeFileSync(join(work, "script.js"), script);
    writeFileSync(join(work, "tsconfig.json"), JSON.stringify(INLINE_SCRIPT_TSCONFIG));
    const ran = await run([TSC, "-p", work]);
    const offset = lineOf(html, html.indexOf(script));
    const found: Finding[] = [];
    for (const finding of tscFindings(ran.stdout, page)) found.push({ file: page, line: finding.line + offset - 1, message: finding.message });
    assert(offset >= 1, "the script is inside the page");
    return orToolFailure(ran, page, found);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function inlineScripts(): Promise<readonly Finding[]> {
  const tracked = await trackedFiles();
  assert(tracked.length > 0, "the repo tracks files");
  const jobs: Promise<readonly Finding[]>[] = [];
  for (const path of tracked) if (path.endsWith(".html")) jobs.push(inlineFindings(path));
  const found = await Promise.all(jobs);
  assert(found.length === jobs.length, "each page has its findings");
  return found.flat();
}

interface Exclusion {
  readonly code: string;
  readonly files: string | null;
  readonly reason: string;
}

const SHELLCHECK_EXCLUDED: readonly Exclusion[] = [
  { code: "SC2250", files: null, reason: "pedantic: it asks for braces on each variable, and the scripts use $x where it is exact" },
  { code: "SC2248", files: null, reason: "pedantic: it asks for quotes on each variable, also where the value has no space (a number or a fixed word)" },
  { code: "SC2312", files: null, reason: "pedantic: it asks for a check of each command inside $(...) of a pipeline, and the scripts test the final text" },
  { code: "SC2029", files: null, reason: "the scripts expand the variable on the client side on purpose, in the ssh command" },
  { code: "SC2086", files: "test.sh", reason: "each test is a string that t sources as shell text, and its variables are mktemp paths, hex ids and numbers, which have no space or glob character" },
  { code: "SC1090", files: "test.sh", reason: "t sources the text of each test from a temp file that it writes itself, so there is no fixed file to follow" },
  { code: "SC2016", files: "test.sh", reason: "test.sh writes the scripts of test commands, and their $ must stay literal" },
  { code: "SC2059", files: "test.sh", reason: "test.sh builds the octal escapes of a FastCGI record in the printf format on purpose" },
  { code: "SC1091", files: "etc/rc.d/", reason: "rc.subr is a file of the OpenBSD base system, which is not in this repo" },
  { code: "SC2086", files: "etc/rc.d/", reason: "an rc.d script calls rc_cmd $1 with no quotes, so that a missing argument gives the usage message of rc.subr" },
  { code: "SC2034", files: "etc/rc.d/", reason: "rc.subr, which the script sources, reads the daemon_* and rc_* variables" },
];

function appliesTo(files: string | null, file: string): boolean {
  assert(file !== "", "a file has a name");
  assert(files === null || files !== "", "a scope has a name");
  assert(!file.includes("\\"), "paths use slashes");
  if (files === null) return true;
  return files.endsWith("/") ? file.startsWith(files) : file === files;
}

function excludedFor(file: string): string {
  assert(file !== "", "a file has a name");
  assert(SHELLCHECK_EXCLUDED.length > 0, "some checks are excluded");
  const codes: string[] = [];
  for (const exclusion of SHELLCHECK_EXCLUDED) if (appliesTo(exclusion.files, file)) codes.push(exclusion.code);
  assert(codes.length <= SHELLCHECK_EXCLUDED.length, "no code is excluded twice");
  return codes.toSorted((left, right) => left.localeCompare(right)).join(",");
}

const SHELL_FILES = /^(apply|share|mail-alias|private-setup|install\.sh|test\.sh|bin\/.*|\.githooks\/pre-commit)$/;
const KSH_FILES = /^etc\/rc\.d\/.*$/;

interface ShellGroup {
  readonly dialect: string;
  readonly targets: readonly string[];
}

function dialectOf(file: string): string | null {
  assert(file !== "", "a file has a name");
  assert(!file.startsWith("/"), "a file is relative to the repo");
  if (SHELL_FILES.test(file)) return "sh";
  return KSH_FILES.test(file) ? "ksh" : null;
}

function stageShellFiles(work: string, files: readonly string[]): void {
  assert(work !== "", "the staging folder has a path");
  assert(files.length > 0, "there are files to stage");
  for (const file of files) {
    if (dialectOf(file) === null && file !== "local.conf.example") continue;
    mkdirSync(dirname(join(work, file)), { recursive: true });
    cpSync(join(REPO_ROOT, file), join(work, file));
  }
  cpSync(join(REPO_ROOT, "local.conf.example"), join(work, "local.conf"));
}

function groupShellFiles(files: readonly string[]): ReadonlyMap<string, ShellGroup> {
  assert(files.length > 0, "there are files to group");
  const targets = new Map<string, string[]>();
  for (const file of files) {
    const dialect = dialectOf(file);
    if (dialect === null) continue;
    const key = `${dialect} ${excludedFor(file)}`;
    targets.set(key, [...(targets.get(key) ?? []), file]);
  }
  const groups = new Map<string, ShellGroup>();
  assert(targets.size > 0, "some file is shell");
  for (const [key, list] of targets) groups.set(key, { dialect: key.slice(0, key.indexOf(" ")), targets: list });
  assert(groups.size <= targets.size, "no group is made twice");
  return groups;
}

async function shellcheckGroup(work: string, key: string, group: ShellGroup): Promise<readonly Finding[]> {
  assert(group.targets.length > 0, "a group has files");
  assert(key.startsWith(group.dialect), "the key names the dialect");
  const exclude = key.slice(group.dialect.length + 1);
  assert(group.dialect === "sh" || group.dialect === "ksh", "the dialect is sh or ksh");
  const ran = await run(["shellcheck", "-x", "-s", group.dialect, "-o", "all", "-e", exclude, "-f", "gcc", ...group.targets], { cwd: work });
  const found: Finding[] = [];
  for (const line of ran.stdout.split("\n")) {
    const match = /^(.*?):(\d+):\d+: (.*)$/.exec(line);
    if (match?.[1] !== undefined) found.push({ file: match[1], line: Number(match[2]), message: match[3] ?? "" });
  }
  return orToolFailure(ran, `shellcheck ${key}`, found);
}

export async function shellcheck(): Promise<readonly Finding[]> {
  const missing = need("shellcheck");
  assert(missing.length <= 1, "one tool is asked for");
  if (missing.length > 0) return missing;
  const work = mkdtempSync(join(tmpdir(), "shellcheck-"));
  assert(work !== "", "the staging folder was made");
  try {
    const files = await trackedFiles();
    stageShellFiles(work, files);
    const groups = groupShellFiles(files);
    assert(groups.size > 0, "the repo has shell files");
    const jobs: Promise<readonly Finding[]>[] = [];
    for (const [key, group] of groups) jobs.push(shellcheckGroup(work, key, group));
    return (await Promise.all(jobs)).flat();
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function deadCode(): Promise<readonly Finding[]> {
  assert(REPO_ROOT !== "", "the repo root is known");
  const ran = await run([join(REPO_ROOT, "node_modules/.bin/knip"), "--no-progress", "--reporter", "compact"]);
  assert(Number.isInteger(ran.code), "knip exited");
  if (ran.code === 0) return [];
  return `${ran.stdout}${ran.stderr}`
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => ({ file: "knip", line: 0, message: line }));
}

export async function bunTests(): Promise<readonly Finding[]> {
  assert(REPO_ROOT !== "", "the repo root is known");
  const ran = await run(["bun", "test", "check/"]);
  assert(Number.isInteger(ran.code), "bun test exited");
  return ran.code === 0 ? [] : [{ file: "bun test", line: 0, message: `${ran.stdout}${ran.stderr}`.trim() }];
}

const POWER10_COMMIT = "502925100c8d3b586662d0d87caa6531dbe8676c";
const POWER10_REPO = "https://github.com/yujieteo/power10-check";
const POWER10_VERSION = "0.1.0";

export async function power10(): Promise<readonly Finding[]> {
  assert(POWER10_COMMIT.length === 40, "the pin is a full commit id");
  assert(POWER10_REPO.startsWith("https://"), "the checker is fetched over https");
  const source = `git+${POWER10_REPO}@${POWER10_COMMIT}`;
  const ran = await run(["uvx", "--from", source, "power10-check", "--require-version", POWER10_VERSION]);
  const lines: Finding[] = [];
  if (ran.code !== 0) for (const line of `${ran.stdout}${ran.stderr}`.split("\n")) if (line.trim() !== "") lines.push({ file: "power10-check", line: 0, message: line });
  return orToolFailure(ran, "power10-check", lines);
}

export async function lint(): Promise<readonly Finding[]> {
  assert(REPO_ROOT !== "", "the repo root is known");
  const ran = await run([join(REPO_ROOT, "node_modules/.bin/oxlint"), "--type-aware", "--deny-warnings", "check"]);
  assert(Number.isInteger(ran.code), "oxlint exited");
  const lines: Finding[] = [];
  if (ran.code !== 0) for (const line of `${ran.stdout}${ran.stderr}`.split("\n")) if (line.trim() !== "") lines.push({ file: "oxlint", line: 0, message: line });
  return orToolFailure(ran, "oxlint", lines);
}
