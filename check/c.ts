import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXCLUDED } from "./comments.ts";
import { type Finding, REPO_ROOT, errorText, need, run } from "./lib.ts";
import { fastcgiPost } from "./fastcgi.ts";

const PROGRAMS = ["pond/main.c", "pond/pond_read.c", "room/room.c"] as const;
const OWNED_C = new Set(["pond/main.c", "room/room_net.h"]);
const STACK_RESERVE = "-DGS_STACK_RESERVE=(16ull<<20)";
const STRICT = [
  "-std=gnu11", "-O2", "-Wall", "-Wextra", "-Wpedantic", "-Wshadow", "-Wconversion", "-Wstrict-prototypes",
  "-Wformat=2", "-Wundef", "-Wcast-qual", "-Wwrite-strings", "-Wno-unused-command-line-argument",
] as const;

async function includeFlags(): Promise<readonly string[]> {
  const ran = await run(["pkg-config", "--cflags", "openssl"]);
  return [
    "-Ipond", "-Iroom", "-include", "check/shim/openbsd.h", STACK_RESERVE,
    ...(ran.code === 0 ? ran.stdout.trim().split(/\s+/).filter((flag) => flag !== "") : []),
  ];
}

interface Diagnostic extends Finding {
  readonly fatal: boolean;
}

function diagnostics(output: string): readonly Diagnostic[] {
  const found: Diagnostic[] = [];
  for (const text of output.split("\n")) {
    const match = /^(\S+?):(\d+):\d+: (warning|error|fatal error): (.*)$/.exec(text);
    if (match?.[1] !== undefined) found.push({ file: match[1], line: Number(match[2]), message: match[4] ?? "", fatal: match[3] !== "warning" });
  }
  return found;
}

async function ownedFindings(mode: readonly string[]): Promise<readonly Finding[]> {
  const missing = need("clang", "pkg-config");
  if (missing.length > 0) return missing;
  const flags = await includeFlags();
  const results = await Promise.all(
    PROGRAMS.map(async (program) => {
      const ran = await run(["clang", ...STRICT, ...mode, ...flags, program, "-o", "/dev/null"]);
      return { program, found: diagnostics(`${ran.stdout}\n${ran.stderr}`) };
    }),
  );
  const findings: Finding[] = [];
  for (const { program, found } of results) {
    const owned = found.filter((diagnostic) => diagnostic.fatal || OWNED_C.has(diagnostic.file));
    findings.push(...owned.map(({ file, line, message }) => ({ file, line, message })));
    const rest = found.length - owned.length;
    if (rest > 0) console.log(`  note: ${program}: ${rest} diagnostics in generated or copied C (${Object.keys(EXCLUDED).length} files are excluded; fix the Goose compiler)`);
  }
  return findings;
}

export async function cWarnings(): Promise<readonly Finding[]> {
  return ownedFindings(["-c"]);
}

export async function cAnalyze(): Promise<readonly Finding[]> {
  return ownedFindings(["--analyze", "-Xanalyzer", "-analyzer-opt-analyze-headers", "-Xanalyzer", "-analyzer-checker=security", "-Xanalyzer", `-analyzer-disable-checker=${Object.keys(ANALYZER_OFF).join(",")}`]);
}

const ANALYZER_OFF: Readonly<Record<string, string>> = {
  "security.insecureAPI.DeprecatedOrUnsafeBufferHandling": "it asks for the memset_s and memcpy_s of Annex K of C11, which OpenBSD and glibc do not have",
};

const SANITIZER_OFF: Readonly<Record<string, string>> = {
  alignment: "room.c, pond_read.c and pond_save.c, written by the Goose compiler, load an int64_t from a misaligned address (room.c:6311); the fix belongs in the Goose compiler",
};

const SANITIZE = [
  "-g", "-O1", "-w", "-std=gnu11", "-fsanitize=undefined,address", "-fno-sanitize-recover=all", "-fno-omit-frame-pointer",
  `-fno-sanitize=${Object.keys(SANITIZER_OFF).join(",")}`,
] as const;
const SANITIZER_REPORT = /AddressSanitizer|runtime error|LeakSanitizer|UndefinedBehaviorSanitizer/;

function sanitizerFindings(program: string, stderr: string): readonly Finding[] {
  return SANITIZER_REPORT.test(stderr) ? [{ file: program, line: 0, message: stderr.slice(0, 400) }] : [];
}

async function cgi(binary: string, env: Readonly<Record<string, string>>, stdin: string): Promise<{ stderr: string }> {
  const ran = await run([binary], { env: { ASAN_OPTIONS: "detect_leaks=0", ...env }, stdin });
  return { stderr: ran.stderr };
}

export async function cSanitizers(): Promise<readonly Finding[]> {
  const missing = need("clang", "pkg-config");
  if (missing.length > 0) return missing;
  const work = mkdtempSync(join(tmpdir(), "sanitize-"));
  try {
    const flags = await includeFlags();
    const libs = (await run(["pkg-config", "--libs", "openssl"])).stdout.trim().split(/\s+/).filter((flag) => flag !== "");
    const findings: Finding[] = [];
    const built = new Map<string, string>();
    for (const program of PROGRAMS) {
      const binary = join(work, program.replace(/\W/g, "_"));
      const ran = await run(["clang", ...SANITIZE, ...flags, program, "-o", binary, ...libs, "-lm", "-lpthread"]);
      if (ran.code !== 0) findings.push({ file: program, line: 0, message: `the sanitizer build fails: ${ran.stderr.slice(-300)}` });
      else built.set(program, binary);
    }
    const reader = built.get("pond/pond_read.c");
    if (reader !== undefined) {
      for (const uri of ["/pond/entries.json", "/log/", "/log/feed.xml", "/log/%66eed.xml", "/x"]) {
        findings.push(...sanitizerFindings(`pond_read ${uri}`, (await cgi(reader, { REQUEST_METHOD: "GET", REQUEST_URI: uri }, "")).stderr));
      }
      findings.push(...sanitizerFindings("pond_read POST", (await cgi(reader, { REQUEST_METHOD: "POST", REQUEST_URI: "/log/" }, "")).stderr));
    }
    const saver = built.get("pond/main.c");
    if (saver !== undefined) {
      const bodies = ['{"id":"a","key":"k","op":"put","rev":1,"v":1}', "", "{", "x".repeat(9000), "\u0000\u0001"];
      for (const body of bodies) {
        const env = { REQUEST_METHOD: "POST", REQUEST_URI: "/pond/entry", CONTENT_LENGTH: String(body.length), HTTP_SIGNATURE: "AAAA" };
        findings.push(...sanitizerFindings(`pond_save body of ${body.length} bytes`, (await cgi(saver, env, body)).stderr));
      }
    }
    const room = built.get("room/room.c");
    if (room !== undefined) findings.push(...(await roomScenario(room)));
    return findings;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function waitForPort(port: number): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const probe = await Bun.connect({ hostname: "127.0.0.1", port, socket: { data() {}, open(connection) { connection.end(); } } });
      probe.end();
      return;
    } catch {
      await Bun.sleep(100);
    }
  }
  throw new Error(`nothing listens on port ${port}`);
}

async function roomScenario(binary: string): Promise<readonly Finding[]> {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const daemon = Bun.spawn([binary, "--port", String(port)], {
    env: { ...process.env, ASAN_OPTIONS: "detect_leaks=0" },
    stdout: "ignore",
    stderr: "pipe",
    cwd: REPO_ROOT,
  });
  await waitForPort(port);
  const attempt = async (): Promise<Finding[]> => {
    const room = Math.random().toString(16).slice(2).padEnd(22, "0").slice(0, 22);
    const post = (op: string, member: string, extra = ""): Promise<number | null> =>
      fastcgiPost(port, JSON.stringify({ op, room, member, name: "test", since: -1 }).replace(/}$/, `${extra}}`));
    const expected: readonly (readonly [string, number | null, number | null])[] = [
      ["create", await post("create", "member-a"), 200],
      ["create again", await post("create", "member-a"), 409],
      ["poll", await post("poll", "member-b"), 200],
      ["view", await post("view", "member-a", ',"view":"{\\"layer\\":16}"'), 200],
      ["leave", await post("leave", "member-b"), 200],
      ["big", await fastcgiPost(port, " ".repeat(9000)), 413],
      ["garbage", await fastcgiPost(port, "not json"), 400],
    ];
    const findings: Finding[] = expected
      .filter(([, got, want]) => got !== want)
      .map(([name, got, want]) => ({ file: "room/room.c", line: 0, message: `${name}: status ${String(got)}, expected ${String(want)}` }));
    return findings;
  };
  let findings: Finding[];
  try {
    findings = await attempt();
  } catch (error) {
    findings = [{ file: "room/room.c", line: 0, message: `the daemon stopped: ${errorText(error)}` }];
  }
  daemon.kill("SIGTERM");
  const stderr = await new Response(daemon.stderr).text();
  await daemon.exited;
  return [...findings, ...sanitizerFindings("room", stderr)];
}
