import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Finding, REPO_ROOT, lineOf, need, run, trackedFiles } from "./lib.ts";

const TSC = join(REPO_ROOT, "node_modules/.bin/tsc");

function tscFindings(stdout: string, fallbackFile: string): readonly Finding[] {
  return stdout
    .split("\n")
    .filter((line) => line.includes(": error TS"))
    .map((line) => {
      const found = /^(.*?)\((\d+),\d+\): (.*)$/.exec(line);
      return { file: found?.[1] ?? fallbackFile, line: Number(found?.[2] ?? 0), message: found?.[3] ?? line };
    });
}

export async function typeCheck(): Promise<readonly Finding[]> {
  const ran = await run([TSC, "-p", "tsconfig.json"]);
  return ran.code === 0 ? [] : tscFindings(ran.stdout, "tsconfig.json");
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

export async function inlineScripts(): Promise<readonly Finding[]> {
  const findings: Finding[] = [];
  const pages = (await trackedFiles()).filter((path) => path.endsWith(".html"));
  for (const page of pages) {
    const html = readFileSync(join(REPO_ROOT, page), "utf8");
    const chunks: string[] = [];
    const rewriter = new HTMLRewriter().on("script", {
      text(chunk) {
        chunks.push(chunk.text);
      },
    });
    await rewriter.transform(new Response(html)).text();
    const script = chunks.join("");
    if (script.trim() === "") continue;
    const work = mkdtempSync(join(tmpdir(), "inline-"));
    try {
      writeFileSync(join(work, "script.js"), script);
      writeFileSync(join(work, "tsconfig.json"), JSON.stringify(INLINE_SCRIPT_TSCONFIG));
      const ran = await run([TSC, "-p", work]);
      const offset = lineOf(html, html.indexOf(script));
      for (const finding of tscFindings(ran.stdout, page)) {
        findings.push({ file: page, line: finding.line + offset - 1, message: finding.message });
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
  return findings;
}

interface Exclusion {
  readonly code: string;
  readonly files: RegExp | null;
  readonly reason: string;
}

const SHELLCHECK_EXCLUDED: readonly Exclusion[] = [
  { code: "SC2250", files: null, reason: "pedantic: it asks for braces on each variable, and the scripts use $x where it is exact" },
  { code: "SC2248", files: null, reason: "pedantic: it asks for quotes on each variable, also where the value has no space (a number or a fixed word)" },
  { code: "SC2312", files: null, reason: "pedantic: it asks for a check of each command inside $(...) of a pipeline, and the scripts test the final text" },
  { code: "SC2029", files: null, reason: "the scripts expand the variable on the client side on purpose, in the ssh command" },
  { code: "SC2086", files: /^test\.sh$/, reason: "each test is a string for eval, and its variables are mktemp paths, hex ids and numbers, which have no space or glob character" },
  { code: "SC2016", files: /^test\.sh$/, reason: "test.sh writes the scripts of test commands, and their $ must stay literal" },
  { code: "SC2059", files: /^test\.sh$/, reason: "test.sh builds the octal escapes of a FastCGI record in the printf format on purpose" },
  { code: "SC1091", files: /^etc\/rc\.d\//, reason: "rc.subr is a file of the OpenBSD base system, which is not in this repo" },
  { code: "SC2086", files: /^etc\/rc\.d\//, reason: "an rc.d script calls rc_cmd $1 with no quotes, so that a missing argument gives the usage message of rc.subr" },
  { code: "SC2034", files: /^etc\/rc\.d\//, reason: "rc.subr, which the script sources, reads the daemon_* and rc_* variables" },
];

function excludedFor(file: string): string {
  return SHELLCHECK_EXCLUDED.filter((exclusion) => exclusion.files === null || exclusion.files.test(file)).map((exclusion) => exclusion.code).sort().join(",");
}

const SHELL_FILES = /^(apply|share|mail-alias|private-setup|install\.sh|test\.sh|bin\/.*|\.githooks\/pre-commit)$/;
const KSH_FILES = /^etc\/rc\.d\/.*$/;

export async function shellcheck(): Promise<readonly Finding[]> {
  const missing = need("shellcheck");
  if (missing.length > 0) return missing;
  const work = mkdtempSync(join(tmpdir(), "shellcheck-"));
  try {
    const files = await trackedFiles();
    for (const file of files) {
      if (!SHELL_FILES.test(file) && !KSH_FILES.test(file) && file !== "local.conf.example") continue;
      mkdirSync(dirname(join(work, file)), { recursive: true });
      cpSync(join(REPO_ROOT, file), join(work, file));
    }
    cpSync(join(REPO_ROOT, "local.conf.example"), join(work, "local.conf"));
    const groups = new Map<string, { dialect: string; targets: string[] }>();
    for (const file of files) {
      const dialect = SHELL_FILES.test(file) ? "sh" : KSH_FILES.test(file) ? "ksh" : null;
      if (dialect === null) continue;
      const key = `${dialect} ${excludedFor(file)}`;
      const group = groups.get(key) ?? { dialect, targets: [] };
      group.targets.push(file);
      groups.set(key, group);
    }
    const findings: Finding[] = [];
    for (const [key, group] of groups) {
      const exclude = key.slice(group.dialect.length + 1);
      const ran = await run(["shellcheck", "-x", "-s", group.dialect, "-o", "all", "-e", exclude, "-f", "gcc", ...group.targets], { cwd: work });
      for (const line of ran.stdout.split("\n")) {
        const found = /^(.*?):(\d+):\d+: (.*)$/.exec(line);
        if (found?.[1] !== undefined) findings.push({ file: found[1], line: Number(found[2]), message: found[3] ?? "" });
      }
    }
    return findings;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function deadCode(): Promise<readonly Finding[]> {
  const ran = await run([join(REPO_ROOT, "node_modules/.bin/knip"), "--no-progress", "--reporter", "compact"]);
  if (ran.code === 0) return [];
  return `${ran.stdout}${ran.stderr}`
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => ({ file: "knip", line: 0, message: line }));
}

export async function bunTests(): Promise<readonly Finding[]> {
  const ran = await run(["bun", "test", "check/"]);
  return ran.code === 0 ? [] : [{ file: "bun test", line: 0, message: `${ran.stdout}${ran.stderr}`.trim() }];
}
