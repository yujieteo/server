import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./lib.ts";

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
  const start = installScript.indexOf("\nput() {");
  const end = installScript.indexOf("\n}\n", start);
  if (start === -1 || end === -1) throw new Error("install.sh has no put() function");
  return installScript.slice(start + 1, end + 3);
}

export function putCallsOf(installScript: string): readonly { readonly source: string; readonly mode: string | null }[] {
  const calls: { readonly source: string; readonly mode: string | null }[] = [];
  for (const line of installScript.split("\n")) {
    const found = /^put (\S+) (\S+)(?: (\d+))?$/.exec(line);
    if (found?.[1] !== undefined) calls.push({ source: found[1], mode: found[3] ?? null });
  }
  return calls;
}

export function captureInput(input: PutInput): void {
  const dir = process.env[CAPTURE_ENV];
  if (dir === undefined || dir === "") return;
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "inputs.jsonl"), `${JSON.stringify(input)}\n`);
}

export async function runPut(tree: string, input: PutInput): Promise<PutOutput> {
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
    if (ran.code !== 0) return { content: "", mode: "", exit: ran.code };
    return { content: readFileSync(dest, "utf8"), mode: (statSync(dest).mode & 0o777).toString(8), exit: 0 };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
