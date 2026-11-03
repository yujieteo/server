import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLocalConf } from "./conf.ts";
import { type Finding, REPO_ROOT, run, trackedFiles } from "./lib.ts";
import { runPut } from "./put.ts";

export type Rendered = ReadonlyMap<string, string>;

export async function renderConfigs(): Promise<Rendered> {
  const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
  const rendered = new Map<string, string>();
  for (const path of await trackedFiles()) {
    if (!path.startsWith("etc/")) continue;
    const template = readFileSync(join(REPO_ROOT, path), "utf8");
    const output = await runPut(REPO_ROOT, { name: path, template, mode: null, knownIps: conf.KNOWN_IPS, fhToken: conf.FH_TOKEN });
    rendered.set(path, output.content);
  }
  return rendered;
}

interface Statement {
  readonly line: number;
  readonly depth: number;
  readonly tokens: readonly string[];
}

function statements(text: string, file: string, findings: Finding[]): readonly Statement[] {
  const found: Statement[] = [];
  let depth = 0;
  text.split("\n").forEach((raw, index) => {
    const line = index + 1;
    const tokens: string[] = [];
    let at = 0;
    let startDepth = depth;
    while (at < raw.length) {
      const c = raw[at] ?? "";
      if (c === " " || c === "\t") at += 1;
      else if (c === '"') {
        const close = raw.indexOf('"', at + 1);
        if (close === -1) {
          findings.push({ file, line, message: "a quote is not closed" });
          break;
        }
        tokens.push(raw.slice(at, close + 1));
        at = close + 1;
      } else if (c === "{" || c === "}") {
        if (c === "}") {
          depth -= 1;
          if (tokens.length === 0) startDepth = depth;
        } else depth += 1;
        tokens.push(c);
        at += 1;
      } else {
        let end = at;
        while (end < raw.length && !" \t{}\"".includes(raw[end] ?? "")) end += 1;
        tokens.push(raw.slice(at, end));
        at = end;
      }
    }
    if (depth < 0) {
      findings.push({ file, line, message: "a } has no {" });
      depth = 0;
    }
    if (tokens.length > 0) found.push({ line, depth: startDepth, tokens });
  });
  if (depth !== 0) findings.push({ file, line: 0, message: "a { has no }" });
  return found;
}

interface Grammar {
  readonly top: ReadonlySet<string>;
  readonly inner: ReadonlySet<string>;
}

const words = (list: string): ReadonlySet<string> => new Set(list.split(" "));

const GRAMMARS: Readonly<Record<string, Grammar>> = {
  "etc/httpd.conf": {
    top: words("types server include prefork chroot logdir ext default"),
    inner: words("listen alias tls root location block errdocs fastcgi request include log connection directory authenticate hsts no certificate key include ciphers protocols types default"),
  },
  "etc/relayd.conf": {
    top: words("table http relay tcp log interval timeout prefork include"),
    inner: words("tls http return block match pass listen protocol forward websockets tcp"),
  },
  "etc/pf.conf": { top: words("set block pass match table anchor include antispoof"), inner: words("") },
  "etc/smtpd.conf": {
    top: words("pki table listen action match include srs queue smtp mta ca filter proc expire bounce"),
    inner: words(""),
  },
  "etc/acme-client.conf": { top: words("authority domain include"), inner: words("api account domain alternative sign contact env challengedir") },
};

const BUILTIN_VARIABLES = new Set(["$REQUEST_URI", "$HTTP_HOST"]);

function grammarFindings(file: string, text: string): readonly Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(/@[A-Z_]+@/g)) {
    findings.push({ file, line: text.slice(0, match.index).split("\n").length, message: `the placeholder ${match[0]} is not put in` });
  }
  const parsed = statements(text, file, findings);
  const grammar = GRAMMARS[file];
  if (grammar === undefined) return findings;
  for (const statement of parsed) {
    const first = statement.tokens[0] ?? "";
    const allowed = statement.depth === 0 ? grammar.top : grammar.inner;
    const mediaType = file === "etc/httpd.conf" && statement.depth > 0 && /^[a-z]+\/[a-z0-9.+-]+$/.test(first);
    if (first !== "}" && !mediaType && !allowed.has(first)) {
      findings.push({ file, line: statement.line, message: `"${first}" is not a keyword here` });
    }
    for (const token of statement.tokens) {
      for (const variable of token.matchAll(/\$[A-Z_]+/g)) {
        if (!BUILTIN_VARIABLES.has(variable[0])) findings.push({ file, line: statement.line, message: `the variable ${variable[0]} is not defined` });
      }
    }
  }
  return findings;
}

function tableFindings(file: string, text: string): readonly Finding[] {
  const defined = new Set<string>();
  for (const match of text.matchAll(/^table\s+<?([A-Za-z0-9_]+)>?/gm)) defined.add(match[1] ?? "");
  const findings: Finding[] = [];
  text.split("\n").forEach((line, index) => {
    if (/^table\s/.test(line)) return;
    for (const match of line.matchAll(/<([A-Za-z0-9_]+)>/g)) {
      if (!defined.has(match[1] ?? "")) findings.push({ file, line: index + 1, message: `the table <${match[1] ?? ""}> is not defined` });
    }
  });
  return findings;
}

function relaydTagFindings(file: string, text: string): readonly Finding[] {
  const set = new Set([...text.matchAll(/\btag "([^"]+)"/g)].map((match) => match[1] ?? ""));
  const findings: Finding[] = [];
  text.split("\n").forEach((line, index) => {
    for (const match of line.matchAll(/\btagged "([^"]+)"/g)) {
      if (!set.has(match[1] ?? "")) findings.push({ file, line: index + 1, message: `the tag "${match[1] ?? ""}" is never set` });
    }
  });
  return findings;
}

const CRON_RANGE: readonly (readonly [string, number, number])[] = [
  ["minute", 0, 59], ["hour", 0, 23], ["day", 1, 31], ["month", 1, 12], ["weekday", 0, 7],
];

function cronFindings(file: string, text: string): readonly Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((raw, index) => {
    if (raw.trim() === "") return;
    const fields = raw.replace(/^-\S+\s+/, "").split(/\s+/);
    if (fields.length < 6) {
      findings.push({ file, line: index + 1, message: "a job needs 5 time fields and a command" });
      return;
    }
    CRON_RANGE.forEach(([name, low, high], at) => {
      for (const part of (fields[at] ?? "").split(",")) {
        const [range = "", step] = part.split("/");
        const ok =
          range === "*" || range === "~" ||
          range.split("-").every((n) => /^\d+$/.test(n) && Number(n) >= low && Number(n) <= high);
        if (!ok || (step !== undefined && !/^\d+$/.test(step))) findings.push({ file, line: index + 1, message: `bad ${name} field "${part}"` });
      }
    });
  });
  return findings;
}

function simpleFindings(file: string, text: string): readonly Finding[] {
  const findings: Finding[] = [];
  text.split("\n").forEach((raw, index) => {
    if (raw.trim() === "") return;
    const ok =
      file === "etc/sysctl.conf" ? /^[a-z0-9_.]+=\S+$/.test(raw)
      : file === "etc/doas.conf" ? /^(permit|deny)\s/.test(raw)
      : file === "etc/unbound.conf" ? /^(server:|remote-control:|\t[a-z-]+: .+)$/.test(raw)
      : true;
    if (!ok) findings.push({ file, line: index + 1, message: "a line that the daemon cannot read" });
  });
  return findings;
}

async function sshdFindings(rendered: Rendered): Promise<readonly Finding[]> {
  const config = rendered.get("etc/sshd_config") ?? "";
  if (Bun.which("sshd") === null || Bun.which("ssh-keygen") === null) {
    return statements(config, "etc/sshd_config", []).flatMap((statement) =>
      statement.tokens.length < 2 ? [{ file: "etc/sshd_config", line: statement.line, message: "a keyword has no value" }] : [],
    );
  }
  const work = mkdtempSync(join(tmpdir(), "sshd-"));
  try {
    await run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", join(work, "host")]);
    const path = join(work, "sshd_config");
    await Bun.write(path, `${config.replace(/^Subsystem .*$/m, "")}\n`);
    const ran = await run(["sshd", "-t", "-f", path, "-h", join(work, "host")]);
    return ran.code === 0 ? [] : [{ file: "etc/sshd_config", line: 0, message: ran.stderr.trim() }];
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export async function configSyntax(): Promise<readonly Finding[]> {
  const rendered = await renderConfigs();
  const findings: Finding[] = [];
  for (const [file, text] of rendered) {
    findings.push(...grammarFindings(file, text), ...simpleFindings(file, text));
    if (file === "etc/relayd.conf" || file === "etc/smtpd.conf" || file === "etc/pf.conf") findings.push(...tableFindings(file, text));
    if (file === "etc/relayd.conf") findings.push(...relaydTagFindings(file, text));
    if (file === "etc/crontab") findings.push(...cronFindings(file, text));
  }
  findings.push(...(await sshdFindings(rendered)));
  return findings;
}
