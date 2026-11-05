import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, run } from "./lib.ts";

export interface PutInput {
  readonly name: string;
  readonly template: string;
  readonly mode: string | null;
  readonly knownIps: string;
  readonly fhToken: string;
}

export interface PutOutput {
  readonly content: string;
  readonly mode: string;
  readonly exit: number;
}

export const CAPTURE_ENV = "REPLAY_CAPTURE_DIR";

function putFunctionOf(installScript: string): string {
  assert(installScript !== "", "install.sh has content");
  assert(!installScript.includes("\0"), "a script has no NUL byte");
  const start = installScript.indexOf("\nput() {");
  const end = installScript.indexOf("\n}\n", start);
  if (start === -1 || end === -1) throw new Error("install.sh has no put() function");
  return installScript.slice(start + 1, end + 3);
}

export function putCallsOf(installScript: string): readonly { readonly source: string; readonly mode: string | null }[] {
  assert(installScript !== "", "install.sh has content");
  assert(!installScript.includes("\0"), "a script has no NUL byte");
  const calls: { readonly source: string; readonly mode: string | null }[] = [];
  for (const line of installScript.split("\n")) {
    const found = /^put (\S+) (\S+)(?: (\d+))?$/.exec(line);
    if (found?.[1] !== undefined) calls.push({ source: found[1], mode: found[3] ?? null });
  }
  return calls;
}

export function captureInput(input: PutInput): void {
  assert(input.name !== "", "an input has a name");
  assert(CAPTURE_ENV === "REPLAY_CAPTURE_DIR", "the capture variable is the one the replay sets");
  const dir = process.env[CAPTURE_ENV];
  if (dir === undefined || dir === "") return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "inputs.jsonl"), `${JSON.stringify(input)}\n`);
}

export async function runPut(tree: string, input: PutInput): Promise<PutOutput> {
  assert(tree !== "", "a tree has a path");
  assert(input.name !== "", "an input has a name");
  const work = mkdtempSync(join(tmpdir(), "put-"));
  try {
    const source = join(work, "source");
    const dest = join(work, "dest");
    writeFileSync(source, input.template);
    const definition = putFunctionOf(readFileSync(join(tree, "install.sh"), "utf8"));
    const modeArgument = input.mode === null ? "" : ` "${input.mode}"`;
    const ran = await run(["sh", "-c", `set -eu\n${definition}\nput "$1" "$2"${modeArgument}`, "put", source, dest], {
      env: { KNOWN_IPS: input.knownIps, FH_TOKEN: input.fhToken },
    });
    assert(Number.isInteger(ran.code), "put exited");
    if (ran.code !== 0) return { content: "", mode: "", exit: ran.code };
    return { content: readFileSync(dest, "utf8"), mode: (statSync(dest).mode & 0o777).toString(8), exit: 0 };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
