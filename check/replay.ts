import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { assert, run } from "./lib.ts";
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
  const base = process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache");
  assert(base !== "", "a cache folder has a path");
  assert(!base.includes("\0"), "a path has no NUL byte");
  return join(base, "server-process-replay");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  assert(value !== undefined, "a value is there");
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function capturedText(record: Readonly<Record<string, unknown>>, key: string): string {
  assert(key !== "", "a key has a name");
  assert(Object.keys(record).length >= 0, "a record has keys");
  const value = record[key];
  if (typeof value !== "string") throw new Error(`a captured input has no text for ${key}`);
  return value;
}

function parseInput(line: string): PutInput {
  assert(line !== "", "a line has content");
  assert(!line.includes("\n"), "a line has no newline");
  const raw: unknown = JSON.parse(line);
  if (!isRecord(raw)) throw new Error("a captured input is not an object");
  const record = raw;
  const { mode } = record;
  if (mode !== null && typeof mode !== "string") throw new Error("a captured input has a bad mode");
  return {
    name: capturedText(record, "name"),
    template: capturedText(record, "template"),
    mode,
    knownIps: capturedText(record, "knownIps"),
    fhToken: capturedText(record, "fhToken"),
  };
}

function readInputs(dir: string): readonly PutInput[] {
  assert(dir !== "", "a folder has a path");
  assert(!dir.includes("\0"), "a path has no NUL byte");
  const file = join(dir, "inputs.jsonl");
  if (!existsSync(file)) return [];
  const inputs: PutInput[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) if (line !== "") inputs.push(parseInput(line));
  return inputs;
}

function compare(input: PutInput, base: PutOutput, head: PutOutput): Difference | null {
  assert(input.name !== "", "an input has a name");
  assert(base.exit >= 0 && head.exit >= 0, "exit codes are not negative");
  return base.content === head.content && base.mode === head.mode && base.exit === head.exit ? null : { input, base, head };
}

function describe(difference: Difference): string {
  const { input, base, head } = difference;
  assert(input.name !== "", "an input has a name");
  assert(base.content !== head.content || base.mode !== head.mode || base.exit !== head.exit, "a difference differs");
  const baseLines = base.content.split("\n");
  const headLines = head.content.split("\n");
  const lines = [`--- ${input.name} (exit ${base.exit} to ${head.exit}, mode ${base.mode} to ${head.mode})`];
  for (let at = 0; at < Math.max(baseLines.length, headLines.length); at += 1) {
    if (baseLines[at] !== headLines[at]) lines.push(`-${baseLines[at] ?? ""}`, `+${headLines[at] ?? ""}`);
  }
  return lines.join("\n");
}

async function baseRevision(options: ReplayOptions): Promise<string> {
  assert(options.base === null || options.base !== "", "a base revision has a name");
  assert(typeof options.accept === "boolean", "accept is a switch");
  if (options.base !== null) return options.base;
  const mergeBase = (await run(["git", "merge-base", "HEAD", "origin/main"])).stdout.trim();
  const head = (await run(["git", "rev-parse", "HEAD"])).stdout.trim();
  if (mergeBase !== "" && mergeBase !== head) return mergeBase;
  return (await run(["git", "rev-parse", "HEAD~1"])).stdout.trim();
}

async function isolatedCopy(into: string, revision: string | null): Promise<void> {
  assert(into !== "", "a folder has a path");
  assert(revision === null || revision !== "", "a revision has a name");
  mkdirSync(into, { recursive: true });
  const command =
    revision === null
      ? `git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf - | tar -xf - -C "$1"`
      : `git archive "$2" | tar -xf - -C "$1"`;
  const ran = await run(["sh", "-c", command, "copy", into, revision ?? ""]);
  if (ran.code !== 0) throw new Error(`copy failed: ${ran.stderr}`);
}

interface Replays {
  readonly differences: readonly Difference[];
  readonly total: number;
  readonly done: number;
  readonly large: boolean;
}

async function replayOne(baseTree: string, headTree: string, input: PutInput): Promise<Difference | null> {
  assert(baseTree !== headTree, "the trees differ");
  assert(input.name !== "", "an input has a name");
  const base = await runPut(baseTree, input);
  return compare(input, base, await runPut(headTree, input));
}

async function replayAll(baseTree: string, headTree: string, inputs: readonly PutInput[]): Promise<Replays> {
  assert(inputs.length > 0, "there are inputs");
  assert(baseTree !== headTree, "the trees differ");
  const jobs: Promise<Difference | null>[] = [];
  for (const input of inputs) jobs.push(replayOne(baseTree, headTree, input));
  const results = await Promise.all(jobs);
  const differences: Difference[] = [];
  let done = 0;
  for (const difference of results) {
    if (difference !== null) differences.push(difference);
    done += 1;
    if (differences.length / inputs.length > LARGE_CHANGE_SHARE) return { differences, total: inputs.length, done, large: true };
  }
  return { differences, total: inputs.length, done, large: false };
}

function replayExit(replays: Replays, revision: string, accept: boolean): number {
  assert(replays.total > 0, "there are inputs");
  assert(replays.done <= replays.total, "no more replays than inputs");
  if (replays.large) {
    console.log(`large change: more than ${LARGE_CHANGE_SHARE * 100}% of ${replays.total} outputs differ after ${replays.done} replays (base ${revision})`);
    return accept ? 0 : 1;
  }
  for (const difference of replays.differences) console.log(describe(difference));
  console.log(`replayed ${replays.total} inputs of put() on base ${revision} and on the branch: ${replays.differences.length} differ`);
  return replays.differences.length === 0 || accept ? 0 : 1;
}

export async function replay(options: ReplayOptions): Promise<number> {
  const dir = cacheDir();
  assert(CAPTURE_TEST.endsWith(".test.ts"), "the capture is a test");
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
  assert(work !== "", "the work folder was made");
  try {
    const baseTree = join(work, "base");
    const headTree = join(work, "head");
    await isolatedCopy(baseTree, revision);
    await isolatedCopy(headTree, null);
    return replayExit(await replayAll(baseTree, headTree, inputs), revision, options.accept);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
