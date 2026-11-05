import { mkdtempSync, rmSync } from "node:fs";
import { once } from "node:events";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXCLUDED } from "./comments.ts";
import { assert, type Finding, REPO_ROOT, errorText, need, orToolFailure, run } from "./lib.ts";
import { fastcgiPost } from "./fastcgi.ts";

const PROGRAMS = ["pond/main.c", "pond/pond_read.c", "room/room.c"] as const;
const OWNED_C = new Set(["pond/main.c", "room/room_net.h"]);
const STACK_RESERVE = "-DGS_STACK_RESERVE=(16ull<<20)";
const STRICT = [
  "-std=gnu11", "-O2", "-Wall", "-Wextra", "-Wpedantic", "-Wshadow", "-Wconversion", "-Wstrict-prototypes",
  "-Wformat=2", "-Wundef", "-Wcast-qual", "-Wwrite-strings", "-Wno-unused-command-line-argument",
] as const;

function splitFlags(text: string): readonly string[] {
  assert(text.length >= 0, "a text has a length");
  assert(!text.includes("\0"), "a flag text has no NUL byte");
  const flags: string[] = [];
  for (const flag of text.trim().split(/\s+/u)) if (flag !== "") flags.push(flag);
  return flags;
}

async function includeFlags(): Promise<readonly string[]> {
  const ran = await run(["pkg-config", "--cflags", "openssl"]);
  assert(Number.isInteger(ran.code), "pkg-config exited");
  assert(STACK_RESERVE.startsWith("-D"), "the stack reserve is a define");
  return ["-Ipond", "-Iroom", "-include", "check/shim/openbsd.h", STACK_RESERVE, ...(ran.code === 0 ? splitFlags(ran.stdout) : [])];
}

interface Diagnostic extends Finding {
  readonly fatal: boolean;
}

function diagnostics(output: string): readonly Diagnostic[] {
  assert(output.length >= 0, "an output has a length");
  assert(!output.includes("\0"), "an output has no NUL byte");
  const found: Diagnostic[] = [];
  for (const text of output.split("\n")) {
    const match = /^(\S+?):(\d+):\d+: (warning|error|fatal error): (.*)$/u.exec(text);
    if (match?.[1] !== undefined) found.push({ file: match[1], line: Number(match[2]), message: match[4] ?? "", fatal: match[3] !== "warning" });
  }
  return found;
}

async function programFindings(program: string, mode: readonly string[], flags: readonly string[]): Promise<readonly Finding[]> {
  const known: readonly string[] = PROGRAMS;
  assert(known.includes(program), "a known program");
  assert(mode.length > 0, "a mode is set");
  const ran = await run(["clang", ...STRICT, ...mode, ...flags, program, "-o", "/dev/null"]);
  const found = diagnostics(`${ran.stdout}\n${ran.stderr}`);
  const owned: Finding[] = [];
  for (const { fatal, file, line, message } of found) if (fatal || OWNED_C.has(file)) owned.push({ file, line, message });
  const rest = found.length - owned.length;
  if (rest > 0) console.log(`  note: ${program}: ${rest} diagnostics in generated or copied C (${Object.keys(EXCLUDED).length} files are excluded; fix the Goose compiler)`);
  assert(rest >= 0, "the owned diagnostics are part of all");
  return orToolFailure(ran, program, owned);
}

async function ownedFindings(mode: readonly string[]): Promise<readonly Finding[]> {
  assert(mode.length > 0, "a mode is set");
  assert(PROGRAMS.length > 0, "there are programs");
  const missing = need("clang", "pkg-config");
  if (missing.length > 0) return missing;
  const flags = await includeFlags();
  const jobs: Promise<readonly Finding[]>[] = [];
  for (const program of PROGRAMS) jobs.push(programFindings(program, mode, flags));
  return (await Promise.all(jobs)).flat();
}

export async function cWarnings(): Promise<readonly Finding[]> {
  assert(STRICT.length > 0, "warnings are on");
  assert(STRICT.includes("-Wall"), "-Wall is on");
  const found = await ownedFindings(["-c"]);
  assert(found.length >= 0, "findings are a list");
  return found;
}

const ANALYZER_OFF: Readonly<Record<string, string>> = {
  "security.insecureAPI.DeprecatedOrUnsafeBufferHandling": "it asks for the memset_s and memcpy_s of Annex K of C11, which OpenBSD and glibc do not have",
};

export async function cAnalyze(): Promise<readonly Finding[]> {
  assert(Object.keys(ANALYZER_OFF).length > 0, "a checker is off, with a reason");
  assert(STRICT.length > 0, "warnings are on");
  const off = `-analyzer-disable-checker=${Object.keys(ANALYZER_OFF).join(",")}`;
  const found = await ownedFindings(["--analyze", "-Xanalyzer", "-analyzer-opt-analyze-headers", "-Xanalyzer", "-analyzer-checker=security", "-Xanalyzer", off]);
  assert(found.length >= 0, "findings are a list");
  return found;
}

const SANITIZER_OFF: Readonly<Record<string, string>> = {
  alignment: "room.c, pond_read.c and pond_save.c, written by the Goose compiler, load an int64_t from a misaligned address (room.c:6311); the fix belongs in the Goose compiler",
};

const SANITIZE = [
  "-g", "-O1", "-w", "-std=gnu11", "-fsanitize=undefined,address", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer",
  `-fno-sanitize=${Object.keys(SANITIZER_OFF).join(",")}`,
] as const;
const SANITIZER_REPORT = /AddressSanitizer|runtime error|LeakSanitizer|UndefinedBehaviorSanitizer/u;

function sanitizerFindings(program: string, stderr: string): readonly Finding[] {
  assert(program !== "", "a finding names a program");
  assert(stderr.length >= 0, "stderr has a length");
  return SANITIZER_REPORT.test(stderr) ? [{ file: program, line: 0, message: stderr.slice(0, 400) }] : [];
}

async function cgi(binary: string, env: Readonly<Record<string, string>>, stdin: string): Promise<string> {
  assert(binary !== "", "a program has a path");
  assert(env["REQUEST_METHOD"] !== undefined, "a CGI request has a method");
  const ran = await run([binary], { env: { ASAN_OPTIONS: "detect_leaks=0", ...env }, stdin });
  return ran.stderr;
}

interface Built {
  readonly findings: readonly Finding[];
  readonly binaries: ReadonlyMap<string, string>;
}

interface Toolchain {
  readonly flags: readonly string[];
  readonly libs: readonly string[];
}

async function buildOne(work: string, program: string, chain: Toolchain): Promise<Finding | string> {
  assert(work !== "", "a work folder has a path");
  assert(program !== "", "a program has a path");
  const binary = join(work, program.replaceAll(/\W/gu, "_"));
  const ran = await run(["clang", ...SANITIZE, ...chain.flags, program, "-o", binary, ...chain.libs, "-lm", "-lpthread"]);
  if (ran.code !== 0) return { file: program, line: 0, message: `the sanitizer build fails: ${ran.stderr.slice(-300)}` };
  return binary;
}

async function buildAll(work: string): Promise<Built> {
  assert(work !== "", "a work folder has a path");
  assert(PROGRAMS.length > 0, "there are programs");
  const flags = await includeFlags();
  const libs = splitFlags((await run(["pkg-config", "--libs", "openssl"])).stdout);
  const jobs: Promise<Finding | string>[] = [];
  for (const program of PROGRAMS) jobs.push(buildOne(work, program, { flags, libs }));
  const results = await Promise.all(jobs);
  const findings: Finding[] = [];
  const binaries = new Map<string, string>();
  for (const [index, result] of results.entries()) {
    const program = PROGRAMS[index];
    assert(program !== undefined, "a result has a program");
    if (typeof result === "string") binaries.set(program, result);
    else findings.push(result);
  }
  return { findings, binaries };
}

interface CgiRun {
  readonly label: string;
  readonly program: string;
  readonly env: Readonly<Record<string, string>>;
  readonly body: string;
}

async function sanitizedCgi(job: Readonly<CgiRun>): Promise<readonly Finding[]> {
  assert(job.label !== "", "a run has a label");
  assert(job.program !== "", "a program has a path");
  const stderr = await cgi(job.program, job.env, job.body);
  return sanitizerFindings(job.label, stderr);
}

async function readerFindings(reader: string): Promise<readonly Finding[]> {
  assert(reader !== "", "a program has a path");
  assert(reader.includes("pond"), "the reader is a pond program");
  const jobs: Promise<readonly Finding[]>[] = [];
  for (const uri of ["/pond/entries.json", "/log/", "/log/feed.xml", "/log/%66eed.xml", "/x"]) {
    jobs.push(sanitizedCgi({ label: `pond_read ${uri}`, program: reader, env: { REQUEST_METHOD: "GET", REQUEST_URI: uri }, body: "" }));
  }
  jobs.push(sanitizedCgi({ label: "pond_read POST", program: reader, env: { REQUEST_METHOD: "POST", REQUEST_URI: "/log/" }, body: "" }));
  return (await Promise.all(jobs)).flat();
}

async function saverFindings(saver: string): Promise<readonly Finding[]> {
  assert(saver !== "", "a program has a path");
  assert(saver.includes("main"), "the saver is the pond main");
  const bodies = ['{"id":"a","key":"k","op":"put","rev":1,"v":1}', "", "{", "x".repeat(9000), "\u0000\u0001"];
  const jobs: Promise<readonly Finding[]>[] = [];
  for (const body of bodies) {
    const env = { REQUEST_METHOD: "POST", REQUEST_URI: "/pond/entry", CONTENT_LENGTH: String(body.length), HTTP_SIGNATURE: "AAAA" };
    jobs.push(sanitizedCgi({ label: `pond_save body of ${body.length} bytes`, program: saver, env, body }));
  }
  return (await Promise.all(jobs)).flat();
}

async function portOpens(port: number): Promise<boolean> {
  assert(port > 0 && port < 65536, "a port number");
  assert(Number.isInteger(port), "a port is an integer");
  const probe = createConnection({ host: "127.0.0.1", port });
  let opened = true;
  try {
    await once(probe, "connect");
    probe.end();
  } catch {
    opened = false;
  }
  if (!opened) await Bun.sleep(100);
  return opened;
}

async function waitForPort(port: number): Promise<void> {
  assert(port > 0 && port < 65536, "a port number");
  assert(Number.isInteger(port), "a port is an integer");
  for (let attempt = 0; attempt < 50; attempt += 1) if (await portOpens(port)) return;
  throw new Error(`nothing listens on port ${port}`);
}

interface RoomPost {
  readonly port: number;
  readonly room: string;
  readonly op: string;
  readonly member: string;
  readonly extra?: string;
}

async function roomPost(request: Readonly<RoomPost>): Promise<number | null> {
  assert(request.room.length === 22, "a room id has 22 characters");
  assert(request.op !== "", "a request has an operation");
  const { op, room, member } = request;
  const text = JSON.stringify({ op, room, member, name: "test", since: -1 }).replace(/\}$/u, `${request.extra ?? ""}}`);
  const status = await fastcgiPost(request.port, text);
  return status;
}

type Expectation = readonly [string, number | null, number | null];

async function roomExpectations(port: number): Promise<readonly Expectation[]> {
  assert(port > 0 && port < 65536, "a port number");
  assert(Number.isInteger(port), "a port is an integer");
  const room = Math.random().toString(16).slice(2).padEnd(22, "0").slice(0, 22);
  return [
    ["create", await roomPost({ port, room, op: "create", member: "member-a" }), 200],
    ["create again", await roomPost({ port, room, op: "create", member: "member-a" }), 409],
    ["poll", await roomPost({ port, room, op: "poll", member: "member-b" }), 200],
    ["view", await roomPost({ port, room, op: "view", member: "member-a", extra: ',"view":"{\\"layer\\":16}"' }), 200],
    ["leave", await roomPost({ port, room, op: "leave", member: "member-b" }), 200],
    ["big", await fastcgiPost(port, " ".repeat(9000)), 413],
    ["garbage", await fastcgiPost(port, "not json"), 400],
  ];
}

function roomFindings(expected: readonly Expectation[]): readonly Finding[] {
  assert(expected.length > 0, "there are expectations");
  assert(expected.length < 100, "the expectations are few");
  const findings: Finding[] = [];
  for (const [name, got, want] of expected) {
    if (got !== want) findings.push({ file: "room/room.c", line: 0, message: `${name}: status ${String(got)}, expected ${String(want)}` });
  }
  return findings;
}

async function roomScenario(binary: string): Promise<readonly Finding[]> {
  assert(binary !== "", "a program has a path");
  assert(REPO_ROOT !== "", "the repo root is known");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const daemon = Bun.spawn([binary, "--port", String(port)], {
    env: { ...process.env, ASAN_OPTIONS: "detect_leaks=0" },
    stdout: "ignore",
    stderr: "pipe",
    cwd: REPO_ROOT,
  });
  let findings: readonly Finding[];
  try {
    await waitForPort(port);
    findings = roomFindings(await roomExpectations(port));
  } catch (error) {
    findings = [{ file: "room/room.c", line: 0, message: `the daemon stopped: ${errorText(error)}` }];
  } finally {
    daemon.kill("SIGTERM");
  }
  const stderr = await new Response(daemon.stderr).text();
  await daemon.exited;
  return [...findings, ...sanitizerFindings("room", stderr)];
}

export async function cSanitizers(): Promise<readonly Finding[]> {
  const missing = need("clang", "pkg-config");
  assert(missing.length <= 2, "two tools are asked for");
  if (missing.length > 0) return missing;
  const work = mkdtempSync(join(tmpdir(), "sanitize-"));
  assert(work !== "", "the work folder was made");
  try {
    const { findings, binaries } = await buildAll(work);
    const reader = binaries.get("pond/pond_read.c");
    const saver = binaries.get("pond/main.c");
    const room = binaries.get("room/room.c");
    const more = await Promise.all([
      reader === undefined ? [] : readerFindings(reader),
      saver === undefined ? [] : saverFindings(saver),
      room === undefined ? [] : roomScenario(room),
    ]);
    return [...findings, ...more.flat()];
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

