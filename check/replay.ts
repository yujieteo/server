import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "./lib.ts";
import { CAPTURE_ENV, type PutInput, type PutOutput, runPut } from "./put.ts";

const LARGE_CHANGE_SHARE = 0.2;
const CAPTURE_TEST = "check/put.test.ts";

export interface ReplayOptions {
  readonly base: string | null;
  readonly accept: boolean;
}

interface Difference {
  readonly input: PutInput;
  readonly base: PutOutput;
  readonly head: PutOutput;
}

function cacheDir(): string {
  return join(process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"), "server-process-replay");
}

function readInputs(dir: string): readonly PutInput[] {
  const file = join(dir, "inputs.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line): PutInput => {
      const raw: unknown = JSON.parse(line);
      if (typeof raw !== "object" || raw === null) throw new Error("a captured input is not an object");
      const record = new Map(Object.entries(raw));
      const text = (key: string): string => {
        const value = record.get(key);
        if (typeof value !== "string") throw new Error(`a captured input has no text for ${key}`);
        return value;
      };
      const mode = record.get("mode");
      if (mode !== null && typeof mode !== "string") throw new Error("a captured input has a bad mode");
      return { name: text("name"), template: text("template"), mode, knownIps: text("knownIps"), fhToken: text("fhToken") };
    });
}

function compare(input: PutInput, base: PutOutput, head: PutOutput): Difference | null {
  return base.content === head.content && base.mode === head.mode && base.exit === head.exit ? null : { input, base, head };
}

function describe(difference: Difference): string {
  const { input, base, head } = difference;
  const baseLines = base.content.split("\n");
  const headLines = head.content.split("\n");
  const lines = [`--- ${input.name} (exit ${base.exit} to ${head.exit}, mode ${base.mode} to ${head.mode})`];
  for (let at = 0; at < Math.max(baseLines.length, headLines.length); at += 1) {
    if (baseLines[at] !== headLines[at]) lines.push(`-${baseLines[at] ?? ""}`, `+${headLines[at] ?? ""}`);
  }
  return lines.join("\n");
}

async function baseRevision(options: ReplayOptions): Promise<string> {
  if (options.base !== null) return options.base;
  const mergeBase = (await run(["git", "merge-base", "HEAD", "origin/main"])).stdout.trim();
  const head = (await run(["git", "rev-parse", "HEAD"])).stdout.trim();
  if (mergeBase !== "" && mergeBase !== head) return mergeBase;
  return (await run(["git", "rev-parse", "HEAD~1"])).stdout.trim();
}

async function isolatedCopy(into: string, revision: string | null): Promise<void> {
  mkdirSync(into, { recursive: true });
  const command =
    revision === null
      ? `git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf - | tar -xf - -C "$1"`
      : `git archive "$2" | tar -xf - -C "$1"`;
  const ran = await run(["sh", "-c", command, "copy", into, revision ?? ""]);
  if (ran.code !== 0) throw new Error(`copy failed: ${ran.stderr}`);
}

export async function replay(options: ReplayOptions): Promise<number> {
  const dir = cacheDir();
  rmSync(dir, { recursive: true, force: true });
  const captured = await run(["bun", "test", CAPTURE_TEST], { env: { [CAPTURE_ENV]: dir } });
  if (captured.code !== 0) console.log("the tests of put() fail on the branch; the replay shows how the outputs differ from the base");
  const inputs = readInputs(dir);
  if (inputs.length === 0) {
    console.log("no input was captured");
    return 1;
  }
  const revision = await baseRevision(options);
  const work = mkdtempSync(join(tmpdir(), "replay-"));
  try {
    const baseTree = join(work, "base");
    const headTree = join(work, "head");
    await isolatedCopy(baseTree, revision);
    await isolatedCopy(headTree, null);
    const differences: Difference[] = [];
    let done = 0;
    for (const input of inputs) {
      const difference = compare(input, await runPut(baseTree, input), await runPut(headTree, input));
      if (difference !== null) differences.push(difference);
      done += 1;
      if (differences.length / inputs.length > LARGE_CHANGE_SHARE) {
        console.log(`large change: more than ${LARGE_CHANGE_SHARE * 100}% of ${inputs.length} outputs differ after ${done} replays (base ${revision})`);
        return options.accept ? 0 : 1;
      }
    }
    for (const difference of differences) console.log(describe(difference));
    console.log(`replayed ${inputs.length} inputs of put() on base ${revision} and on the branch: ${differences.length} differ`);
    return differences.length === 0 || options.accept ? 0 : 1;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
