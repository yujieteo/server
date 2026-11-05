import { dirname, resolve } from "node:path";

export const REPO_ROOT = resolve(dirname(import.meta.dir));

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

export interface Step {
  readonly name: string;
  readonly run: () => Promise<readonly Finding[]>;
}

export interface Ran {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function run(
  argv: readonly string[],
  options: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>>; readonly stdin?: string } = {},
): Promise<Ran> {
  assert(argv.length > 0, "a command to run");
  assert(argv[0] !== "", "the program to run has a name");
  assert(options.cwd !== "", "a working directory is a path");
  const proc = Bun.spawn([...argv], {
    cwd: options.cwd ?? REPO_ROOT,
    env: { ...process.env, ...options.env },
    stdin: options.stdin === undefined ? "ignore" : new Blob([options.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  assert(Number.isInteger(code), "the process exit code is an integer");
  return { code, stdout, stderr };
}

export function orToolFailure(ran: Ran, file: string, findings: readonly Finding[]): readonly Finding[] {
  assert(file !== "", "a failure names its file");
  assert(ran.stderr !== undefined && ran.stdout !== undefined, "the process output was read");
  assert(Number.isInteger(ran.code), "the exit code is an integer");
  if (ran.code === 0 || findings.length > 0) return findings;
  return [{ file, line: 0, message: `the tool exits with ${ran.code} and no finding: ${`${ran.stderr}${ran.stdout}`.trim()}` }];
}

function missingTool(name: string): Finding {
  assert(name !== "", "a tool has a name");
  assert(!name.includes("/"), "a tool is looked up in PATH by its bare name");
  return { file: name, line: 0, message: `the tool ${name} is not in PATH` };
}

export function need(...tools: readonly string[]): readonly Finding[] {
  assert(tools.length > 0, "at least one tool is asked for");
  assert(!tools.includes(""), "no empty tool name");
  assert(new Set(tools).size === tools.length, "no tool is asked for twice");
  return tools.filter((tool) => Bun.which(tool) === null).map((tool) => missingTool(tool));
}

export async function trackedFiles(root: string = REPO_ROOT): Promise<readonly string[]> {
  assert(root !== "", "the root is a path");
  assert(!root.includes("\0"), "a path has no NUL byte");
  const ran = await run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root });
  if (ran.code !== 0) throw new Error(`git ls-files failed: ${ran.stderr}`);
  const names = ran.stdout.split("\0").filter((name) => name.length > 0);
  assert(!ran.stdout.startsWith("/"), "tracked paths are relative to the root");
  return names;
}

export function lineOf(text: string, offset: number): number {
  assert(offset >= 0, "an offset is not negative");
  assert(Number.isInteger(offset), "an offset is an integer");
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.codePointAt(i) === 10) line += 1;
  assert(line >= 1, "lines count from 1");
  return line;
}

export function errorText(error: unknown): string {
  assert(error !== undefined, "there is an error to name");
  assert(error !== null, "an error is not null");
  if (error instanceof Error) return error.message;
  const text = typeof error === "string" ? error : JSON.stringify(error);
  assert(typeof text === "string", "a thrown value has a text");
  return text;
}
