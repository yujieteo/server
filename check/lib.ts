import { dirname, resolve } from "node:path";

export const REPO_ROOT = resolve(dirname(import.meta.dir));

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
  return { code, stdout, stderr };
}

function missingTool(name: string): Finding {
  return { file: name, line: 0, message: `the tool ${name} is not in PATH` };
}

export function need(...tools: readonly string[]): readonly Finding[] {
  return tools.filter((tool) => Bun.which(tool) === null).map(missingTool);
}

export async function trackedFiles(root: string = REPO_ROOT): Promise<readonly string[]> {
  const ran = await run(["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root });
  if (ran.code !== 0) throw new Error(`git ls-files failed: ${ran.stderr}`);
  return ran.stdout.split("\0").filter((name) => name.length > 0);
}

export function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
