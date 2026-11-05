import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLocalConf } from "./conf.ts";
import { assert, type Finding, REPO_ROOT, run, trackedFiles } from "./lib.ts";
import { runPut } from "./put.ts";

export type Rendered = Readonly<Record<string, string>>;

async function renderOne(path: string, conf: ReturnType<typeof parseLocalConf>): Promise<string> {
  assert(path.startsWith("etc/"), "only configs are rendered");
  assert(conf.KNOWN_IPS !== "", "the example conf has known addresses");
  const template = readFileSync(join(REPO_ROOT, path), "utf8");
  const output = await runPut(REPO_ROOT, { name: path, template, mode: null, knownIps: conf.KNOWN_IPS, fhToken: conf.FH_TOKEN });
  return output.content;
}

export async function renderConfigs(): Promise<Rendered> {
  assert(REPO_ROOT !== "", "the repo root is known");
  const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
  const paths: string[] = [];
  for (const path of await trackedFiles()) if (path.startsWith("etc/")) paths.push(path);
  const jobs: Promise<string>[] = [];
  for (const path of paths) jobs.push(renderOne(path, conf));
  const contents = await Promise.all(jobs);
  const rendered: Record<string, string> = {};
  for (const [index, content] of contents.entries()) rendered[paths[index] ?? ""] = content;
  assert(Object.keys(rendered).length === paths.length, "each config is rendered once");
  return rendered;
}

interface Statement {
  readonly line: number;
  readonly depth: number;
  readonly parent: string;
  readonly tokens: readonly string[];
}

interface Read {
  readonly found: readonly Statement[];
  readonly findings: readonly Finding[];
}

class StatementReader {
  private readonly found: Statement[] = [];
  private readonly findings: Finding[] = [];
  private readonly blocks: string[] = [];
  private depth = 0;
  private readonly file: string;

  public constructor(file: string) {
    assert(file !== "", "a finding names a file");
    assert(this.depth === 0, "a read starts outside blocks");
    this.file = file;
  }

  public read(text: string): Read {
    assert(text.length >= 0, "a text has a length");
    assert(this.found.length === 0, "a read starts empty");
    for (const [index, raw] of text.split("\n").entries()) this.readLine(raw, index + 1);
    if (this.depth !== 0) this.findings.push({ file: this.file, line: 0, message: "a { has no }" });
    return { found: this.found, findings: this.findings };
  }

  private brace(c: string, tokens: readonly string[]): boolean {
    assert(c === "{" || c === "}", "a brace");
    assert(Number.isInteger(this.depth), "the depth is a whole number");
    if (c === "}") {
      this.depth -= 1;
      this.blocks.pop();
      return tokens.length === 0;
    }
    this.depth += 1;
    this.blocks.push(tokens[0] ?? "");
    return false;
  }

  private tokenize(raw: string, line: number): { readonly tokens: readonly string[]; readonly startDepth: number } {
    assert(line >= 1, "lines count from 1");
    assert(!raw.includes("\n"), "a line has no newline");
    const tokens: string[] = [];
    let at = 0;
    let startDepth = this.depth;
    while (at < raw.length) {
      const c = raw[at] ?? "";
      if (c === " " || c === "\t") at += 1;
      else if (c === '"') {
        const close = raw.indexOf('"', at + 1);
        if (close === -1) {
          this.findings.push({ file: this.file, line, message: "a quote is not closed" });
          break;
        }
        tokens.push(raw.slice(at, close + 1));
        at = close + 1;
      } else if (c === "{" || c === "}") {
        if (this.brace(c, tokens)) startDepth = this.depth;
        tokens.push(c);
        at += 1;
      } else {
        let end = at;
        while (end < raw.length && !" \t{}\"".includes(raw[end] ?? "")) end += 1;
        tokens.push(raw.slice(at, end));
        at = end;
      }
    }
    return { tokens, startDepth };
  }

  private readLine(raw: string, line: number): void {
    assert(line >= 1, "lines count from 1");
    assert(this.blocks.length >= 0, "the blocks are a stack");
    const { tokens, startDepth } = this.tokenize(raw, line);
    if (this.depth < 0) {
      this.findings.push({ file: this.file, line, message: "a } has no {" });
      this.depth = 0;
      this.blocks.length = 0;
    }
    if (tokens.length > 0) this.found.push({ line, depth: startDepth, parent: this.blocks[startDepth - 1] ?? "", tokens });
  }
}

function statements(text: string, file: string): Read {
  assert(file !== "", "a finding names a file");
  assert(text.length >= 0, "a text has a length");
  return new StatementReader(file).read(text);
}

interface Grammar {
  readonly top: readonly string[];
  readonly inner: readonly string[];
}

function words(list: string): readonly string[] {
  assert(list.length >= 0, "a list is a text");
  assert(!list.includes("  "), "words are separated by one space");
  return list.split(" ");
}

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

function lineOfOffset(text: string, offset: number): number {
  assert(offset >= 0, "an offset is not negative");
  assert(offset <= text.length, "an offset is inside the text");
  return text.slice(0, offset).split("\n").length;
}

function statementFindings(file: string, grammar: Grammar, statement: Statement): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(statement.tokens.length > 0, "a statement has tokens");
  const findings: Finding[] = [];
  const first = statement.tokens[0] ?? "";
  const allowed = statement.depth === 0 ? grammar.top : grammar.inner;
  const mediaType = file === "etc/httpd.conf" && statement.parent === "types" && /^[a-z]+\/[a-z0-9.+-]+$/u.test(first);
  if (first !== "}" && !mediaType && !allowed.includes(first)) findings.push({ file, line: statement.line, message: `"${first}" is not a keyword here` });
  for (const token of statement.tokens) {
    for (const variable of token.matchAll(/\$[A-Z_]+/gu)) {
      if (!BUILTIN_VARIABLES.has(variable[0])) findings.push({ file, line: statement.line, message: `the variable ${variable[0]} is not defined` });
    }
  }
  return findings;
}

function grammarFindings(file: string, text: string): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(text.length >= 0, "a text has a length");
  const findings: Finding[] = [];
  for (const match of text.matchAll(/@[A-Z_]+@/gu)) {
    findings.push({ file, line: lineOfOffset(text, match.index), message: `the placeholder ${match[0]} is not put in` });
  }
  const read = statements(text, file);
  findings.push(...read.findings);
  const grammar = GRAMMARS[file];
  if (grammar === undefined) return findings;
  for (const statement of read.found) findings.push(...statementFindings(file, grammar, statement));
  return findings;
}

function tableFindings(file: string, text: string): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(text.length >= 0, "a text has a length");
  const defined = new Set<string>();
  for (const match of text.matchAll(/^table\s+<?([A-Za-z0-9_]+)>?/gmu)) defined.add(match[1] ?? "");
  const findings: Finding[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (/^table\s/u.test(line)) continue;
    for (const match of line.matchAll(/<([A-Za-z0-9_]+)>/gu)) {
      if (!defined.has(match[1] ?? "")) findings.push({ file, line: index + 1, message: `the table <${match[1] ?? ""}> is not defined` });
    }
  }
  return findings;
}

function relaydTagFindings(file: string, text: string): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(text.length >= 0, "a text has a length");
  const set = new Set<string>();
  for (const match of text.matchAll(/\btag "([^"]+)"/gu)) set.add(match[1] ?? "");
  const findings: Finding[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    for (const match of line.matchAll(/\btagged "([^"]+)"/gu)) {
      if (!set.has(match[1] ?? "")) findings.push({ file, line: index + 1, message: `the tag "${match[1] ?? ""}" is never set` });
    }
  }
  return findings;
}

interface CronField {
  readonly name: string;
  readonly low: number;
  readonly high: number;
}

const CRON_RANGE: readonly CronField[] = [
  { name: "minute", low: 0, high: 59 },
  { name: "hour", low: 0, high: 23 },
  { name: "day", low: 1, high: 31 },
  { name: "month", low: 1, high: 12 },
  { name: "weekday", low: 0, high: 7 },
];

function cronPartOk(part: string, field: CronField): boolean {
  assert(field.low <= field.high, "a field has a range");
  assert(!part.includes(","), "a part is one item of the list");
  const [range = "", step] = part.split("/");
  if (step !== undefined && !/^\d+$/u.test(step)) return false;
  if (range === "*" || range === "~") return true;
  for (const n of range.split("-")) if (!/^\d+$/u.test(n) || Number(n) < field.low || Number(n) > field.high) return false;
  return true;
}

function cronLineFindings(file: string, raw: string, line: number): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(line >= 1, "lines count from 1");
  const fields = raw.replace(/^-\S+\s+/u, "").split(/\s+/u);
  if (fields.length < 6) return [{ file, line, message: "a job needs 5 time fields and a command" }];
  const findings: Finding[] = [];
  for (const [at, field] of CRON_RANGE.entries()) {
    for (const part of (fields[at] ?? "").split(",")) {
      if (!cronPartOk(part, field)) findings.push({ file, line, message: `bad ${field.name} field "${part}"` });
    }
  }
  return findings;
}

function cronFindings(file: string, text: string): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(CRON_RANGE.length === 5, "cron has 5 time fields");
  const findings: Finding[] = [];
  for (const [index, raw] of text.split("\n").entries()) if (raw.trim() !== "") findings.push(...cronLineFindings(file, raw, index + 1));
  return findings;
}

function daemonCanRead(file: string, raw: string): boolean {
  assert(file !== "", "a finding names a file");
  assert(raw.trim() !== "", "a line has content");
  if (file === "etc/sysctl.conf") return /^[a-z0-9_.]+=\S+$/u.test(raw);
  if (file === "etc/doas.conf") return /^(permit|deny)\s/u.test(raw);
  if (file === "etc/unbound.conf") return /^(server:|remote-control:|\t[a-z-]+: .+)$/u.test(raw);
  return true;
}

function simpleFindings(file: string, text: string): readonly Finding[] {
  assert(file !== "", "a finding names a file");
  assert(text.length >= 0, "a text has a length");
  const findings: Finding[] = [];
  for (const [index, raw] of text.split("\n").entries()) {
    if (raw.trim() !== "" && !daemonCanRead(file, raw)) findings.push({ file, line: index + 1, message: "a line that the daemon cannot read" });
  }
  return findings;
}

function keywordFindings(config: string): readonly Finding[] {
  assert(config.length >= 0, "a config has a length");
  assert(!config.includes("\0"), "a config has no NUL byte");
  const findings: Finding[] = [];
  for (const statement of statements(config, "etc/sshd_config").found) {
    if (statement.tokens.length < 2) findings.push({ file: "etc/sshd_config", line: statement.line, message: "a keyword has no value" });
  }
  return findings;
}

async function sshdFindings(config: string): Promise<readonly Finding[]> {
  assert(config.length >= 0, "a config has a length");
  assert(!config.includes("\0"), "a config has no NUL byte");
  if (Bun.which("sshd") === null || Bun.which("ssh-keygen") === null) return keywordFindings(config);
  const work = mkdtempSync(join(tmpdir(), "sshd-"));
  assert(work !== "", "the work folder was made");
  try {
    await run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", join(work, "host")]);
    const path = join(work, "sshd_config");
    await Bun.write(path, `${config.replace(/^Subsystem .*$/mu, "")}\n`);
    const ran = await run(["sshd", "-t", "-f", path, "-h", join(work, "host")]);
    return ran.code === 0 ? [] : [{ file: "etc/sshd_config", line: 0, message: ran.stderr.trim() }];
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function fileFindings(file: string, text: string): readonly Finding[] {
  assert(file.startsWith("etc/"), "only configs are checked");
  assert(text.length >= 0, "a text has a length");
  const findings = [...grammarFindings(file, text), ...simpleFindings(file, text)];
  if (file === "etc/relayd.conf" || file === "etc/smtpd.conf" || file === "etc/pf.conf") findings.push(...tableFindings(file, text));
  if (file === "etc/relayd.conf") findings.push(...relaydTagFindings(file, text));
  if (file === "etc/crontab") findings.push(...cronFindings(file, text));
  return findings;
}

export async function configSyntax(): Promise<readonly Finding[]> {
  const rendered = await renderConfigs();
  assert(Object.keys(rendered).length > 0, "configs were rendered");
  const findings: Finding[] = [];
  for (const [file, text] of Object.entries(rendered)) findings.push(...fileFindings(file, text));
  findings.push(...(await sshdFindings(rendered["etc/sshd_config"] ?? "")));
  assert(findings.length >= 0, "findings are a list");
  return findings;
}
