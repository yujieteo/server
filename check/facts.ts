import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Rendered, renderConfigs } from "./configs.ts";
import { assert, type Finding, REPO_ROOT } from "./lib.ts";

const PRIVATE_NAMES = ["mac.lavish", "desk.lavish", "fh", "fleet"] as const;
const DOMAIN = "teoyujie.org";
const VPN_ADDRESS = "10.8.0.1";
const TUNNEL_PORTS = ["4387", "4388", "8790"] as const;
const PUBLIC_TCP_PORTS = ["ssh", "smtp", "http", "https"] as const;
const WIREGUARD_PORT = 51820;
const APP_PORT_ON_ITS_HOST = { mac: 4387, desk: 4387, fh: 8790 } as const;
const SYSPATCH_TIME_UTC = { minute: "30", hour: "20" } as const;
function fullNames(): readonly string[] {
  assert(PRIVATE_NAMES.length > 0, "there are private names");
  assert(DOMAIN.length > 0, "there is a domain");
  const names: string[] = [];
  for (const name of PRIVATE_NAMES) names.push(`${name}.${DOMAIN}`);
  return names;
}

const FULL_NAMES = fullNames();

type RepoFile = (path: string) => string;
type Holds = (rendered: Rendered, repoFile: RepoFile) => string | null;

interface Fact {
  readonly name: string;
  readonly holds: Holds;
}

function captures(text: string, pattern: Readonly<RegExp>, group = 1): readonly string[] {
  assert(pattern.flags.includes("g"), "a pattern that finds all matches is global");
  assert(group >= 0, "a group number is not negative");
  const found: string[] = [];
  for (const match of text.matchAll(pattern)) found.push(match[group] ?? "");
  return found;
}

function sameSet(label: string, found: readonly string[]): string | null {
  assert(label !== "", "a message names its source");
  assert(FULL_NAMES.length === PRIVATE_NAMES.length, "each private name has a full name");
  const have = [...new Set(found)].toSorted();
  const want = FULL_NAMES.toSorted();
  return have.join(",") === want.join(",") ? null : `${label} has ${have.join(" ")}, expected ${want.join(" ")}`;
}

function namesIn(text: string): readonly string[] {
  assert(text.length >= 0, "a text has a length");
  assert(!text.includes("\0"), "a text has no NUL byte");
  return captures(text, /(?:mac\.lavish|desk\.lavish|fh|fleet)\.teoyujie\.org/gu, 0);
}

function sectionOf(text: string, start: Readonly<RegExp>): string {
  assert(text.length >= 0, "a text has a length");
  assert(!start.flags.includes("g"), "a start pattern finds the first match");
  const found = start.exec(text);
  if (found === null) return "";
  const rest = text.slice(found.index);
  const firstLineEnd = rest.indexOf("\n") + 1;
  const next = rest.slice(firstLineEnd).search(/^\S/mu);
  return next === -1 ? rest : rest.slice(0, firstLineEnd + next);
}

function indexOfLine(lines: readonly string[], pattern: string | Readonly<RegExp>): number {
  assert(lines.length >= 0, "lines are a list");
  assert(typeof pattern === "string" ? pattern !== "" : !pattern.flags.includes("g"), "a pattern is usable");
  for (const [at, line] of lines.entries()) if (typeof pattern === "string" ? line.includes(pattern) : pattern.test(line)) return at;
  return -1;
}

function privateNames(rendered: Rendered, repoFile: RepoFile): string | null {
  assert(rendered["etc/httpd.conf"] !== undefined, "httpd.conf is rendered");
  assert(rendered["etc/unbound.conf"] !== undefined, "unbound.conf is rendered");
  const unbound = captures(rendered["etc/unbound.conf"] ?? "", /local-zone: "([^"]+)\." static/gu);
  const httpd = namesIn(sectionOf(rendered["etc/httpd.conf"] ?? "", /^server "mac\.lavish\.teoyujie\.org" \{/mu));
  const acme = namesIn(sectionOf(rendered["etc/acme-client.conf"] ?? "", /^domain mac\.lavish\.teoyujie\.org \{/mu));
  const relayd = captures(rendered["etc/relayd.conf"] ?? "", /header "Host" value "([^"]+)"/gu);
  const cert: string[] = [];
  for (const list of captures(repoFile("bin/private-cert"), /for n in ([^;]+);/gu)) for (const n of list.split(" ")) cert.push(`${n}.${DOMAIN}`);
  return sameSet("unbound", unbound) ?? sameSet("httpd", httpd) ?? sameSet("acme-client", acme) ?? sameSet("relayd", relayd) ?? sameSet("private-cert", cert);
}

function unboundRecords(rendered: Rendered): string | null {
  const unbound = rendered["etc/unbound.conf"] ?? "";
  assert(unbound !== "", "unbound.conf is rendered");
  assert(FULL_NAMES.length > 0, "there are private names");
  const records = [...unbound.matchAll(/local-data: "([^ ]+)\. (\S+) (\S+)"/gu)];
  let bad = 0;
  for (const record of records) if (record[2] !== "A" || record[3] !== VPN_ADDRESS) bad += 1;
  return records.length === FULL_NAMES.length && bad === 0 ? null : `local-data is not 1 A record of ${VPN_ADDRESS} for each name`;
}

function tunnelPorts(rendered: Rendered): string | null {
  assert(TUNNEL_PORTS.length === 3, "there are three tunnel ports");
  assert(rendered["etc/sshd_config"] !== undefined, "sshd_config is rendered");
  assert(rendered["etc/relayd.conf"] !== undefined, "relayd.conf is rendered");
  const sshd: string[] = [];
  for (const listen of captures(rendered["etc/sshd_config"] ?? "", /PermitListen (.*)$/gmu)) sshd.push(...listen.split(" "));
  const want: string[] = [];
  for (const port of TUNNEL_PORTS) want.push(`${VPN_ADDRESS}:${port}`);
  if (sshd.toSorted().join(" ") !== want.toSorted().join(" ")) return `PermitListen is ${sshd.join(" ")}`;
  const relayd = rendered["etc/relayd.conf"] ?? "";
  const ports = captures(relayd, /forward to <(?:mac|desk|fh)> port (\d+)/gu);
  const tables = captures(relayd, /^table <(?:mac|desk|fh)> \{ ([^ ]+) \}/gmu);
  if (ports.toSorted().join(",") !== TUNNEL_PORTS.toSorted().join(",")) return "relayd forwards to other ports or addresses";
  for (const address of tables) if (address !== VPN_ADDRESS) return "relayd forwards to other ports or addresses";
  return null;
}

const TUNNEL_LINES = [
  "AllowTcpForwarding remote",
  "AllowStreamLocalForwarding no",
  "GatewayPorts clientspecified",
  "PermitTTY no",
  "AllowAgentForwarding no",
  "X11Forwarding no",
] as const;

function tunnelLogin(rendered: Rendered): string | null {
  assert(DOMAIN.length > 0, "there is a domain");
  assert(rendered["etc/sshd_config"] !== undefined, "sshd_config is rendered");
  assert(TUNNEL_LINES.length > 0, "there are lines to find");
  const block = sectionOf(rendered["etc/sshd_config"] ?? "", /^Match User tunnel/mu);
  const missing: string[] = [];
  for (const line of TUNNEL_LINES) if (!block.includes(line)) missing.push(line);
  return missing.length === 0 ? null : `Match User tunnel lacks: ${missing.join(", ")}`;
}

function sshdKeysOnly(rendered: Rendered): string | null {
  const sshd = rendered["etc/sshd_config"] ?? "";
  assert(sshd !== "", "sshd_config is rendered");
  assert(!sshd.includes("\0"), "a config has no NUL byte");
  return sshd.includes("PermitRootLogin no\n") && sshd.includes("AuthenticationMethods publickey\n") ? null : "root login or a password is possible";
}

function httpdNoVpnListener(rendered: Rendered): string | null {
  const httpd = rendered["etc/httpd.conf"] ?? "";
  assert(httpd !== "", "httpd.conf is rendered");
  assert(VPN_ADDRESS.includes("."), "the VPN address is dotted");
  return new RegExp(`listen on ${VPN_ADDRESS.replaceAll(".", "\\.")} (tls )?port 443`, "u").test(httpd) ? "httpd listens on the VPN address port 443" : null;
}

function pondReadOrder(rendered: Rendered): string | null {
  const httpd = rendered["etc/httpd.conf"] ?? "";
  assert(httpd !== "", "httpd.conf is rendered");
  const catchAll = httpd.indexOf('location "/pond/*"');
  assert(catchAll >= -1, "an index is -1 or more");
  if (catchAll <= 0) return "a read location is missing or after /pond/*";
  for (const location of ['location "/pond/entries.json"', 'location "/log/"', 'location "/log/feed.xml"']) {
    const at = httpd.indexOf(location);
    if (at <= 0 || at >= catchAll) return "a read location is missing or after /pond/*";
  }
  return null;
}

function acmeChallenge(rendered: Rendered): string | null {
  const httpd = rendered["etc/httpd.conf"] ?? "";
  assert(httpd !== "", "httpd.conf is rendered");
  assert(!httpd.includes("\0"), "a config has no NUL byte");
  const servers: string[] = [];
  for (const server of httpd.split(/^server /mu).slice(1)) if (server.includes("listen on egress port 80")) servers.push(server);
  for (const server of servers) if (!server.includes('location "/.well-known/acme-challenge/*" {\n\t\troot "/acme"\n\t\trequest strip 2')) return "a port 80 server has no challenge location";
  return servers.length >= 2 ? null : "a port 80 server has no challenge location";
}

function pfPassIn(rendered: Rendered): string | null {
  assert(WIREGUARD_PORT > 0, "WireGuard has a port");
  const pf = rendered["etc/pf.conf"] ?? "";
  assert(pf !== "", "pf.conf is rendered");
  assert(PUBLIC_TCP_PORTS.length > 0, "there are public ports");
  const passIn: string[] = [];
  for (const line of pf.split("\n")) if (line.startsWith("pass in")) passIn.push(line);
  const allowed = [
    `pass in on egress proto tcp to (egress) port { ${PUBLIC_TCP_PORTS.join(" ")} }`,
    `pass in on egress proto udp to (egress) port ${WIREGUARD_PORT}`,
    "pass in on egress inet proto icmp icmp-type unreach",
    "pass in on egress inet6 proto icmp6",
  ];
  return passIn.join("\n") === allowed.join("\n") ? null : `pass in rules are:\n${passIn.join("\n")}`;
}

function pfBaseRules(rendered: Rendered): string | null {
  const pf = rendered["etc/pf.conf"] ?? "";
  assert(pf !== "", "pf.conf is rendered");
  assert(!pf.includes("\0"), "a config has no NUL byte");
  for (const line of ["block return\n", "pass out\n", "pass on wg0\n", "set skip on lo\n"]) if (!pf.includes(line)) return "a base rule of pf is missing";
  return null;
}

function lastRuleLine(lines: readonly string[]): number {
  assert(lines.length >= 0, "lines are a list");
  assert(lines.length < 10 ** 6, "lines are bounded");
  let last = -1;
  for (const [at, line] of lines.entries()) if (/^\s*(pass|block) request/u.test(line)) last = Math.max(last, at);
  return last;
}

function relaydOrder(rendered: Rendered): string | null {
  const relayd = rendered["etc/relayd.conf"] ?? "";
  assert(relayd !== "", "relayd.conf is rendered");
  const lines = relayd.split("\n");
  const firstSet = indexOfLine(lines, /header set/u);
  if (firstSet < lastRuleLine(lines)) return "a set rule comes before a pass or block rule";
  for (const tag of ["mac", "desk", "fh", "fleet"]) {
    const block = indexOfLine(lines, `block request tagged "${tag}" header "Origin" value "*"`);
    const pass = indexOfLine(lines, `pass request tagged "${tag}" header "Origin" value "https://`);
    const plain = indexOfLine(lines, `pass request tagged "${tag}" forward to`);
    if (!(plain >= 0 && plain < block && block < pass)) return `the rules of ${tag} are not in the order pass, block, pass with own Origin`;
  }
  return relayd.includes('block request quick header "Sec-Fetch-Site" value "cross-site"') ? null : "cross-site requests are not blocked";
}

function relaydSets(rendered: Rendered): string | null {
  assert(Object.keys(rendered).length > 0, "configs were rendered");
  const relayd = rendered["etc/relayd.conf"] ?? "";
  assert(relayd !== "", "relayd.conf is rendered");
  assert(Object.keys(APP_PORT_ON_ITS_HOST).length === 3, "three apps have a port");
  const have: string[] = [];
  for (const m of relayd.matchAll(/match request tagged "(\w+)" header set "(Host|Origin)" value "([^"]+)"/gu)) have.push(`${m[1] ?? ""} ${m[2] ?? ""} ${m[3] ?? ""}`);
  const want: string[] = [];
  for (const [tag, port] of Object.entries(APP_PORT_ON_ITS_HOST)) want.push(`${tag} Host 127.0.0.1:${port}`, `${tag} Origin http://127.0.0.1:${port}`);
  return have.toSorted().join("\n") === want.toSorted().join("\n") ? null : `the set rules are:\n${have.join("\n")}`;
}

function relaydToken(rendered: Rendered): string | null {
  const relayd = rendered["etc/relayd.conf"] ?? "";
  assert(relayd !== "", "relayd.conf is rendered");
  assert(!relayd.includes("\0"), "a config has no NUL byte");
  const lines: string[] = [];
  for (const line of relayd.split("\n")) if (line.includes("Authorization")) lines.push(line);
  const ok = lines.length === 1 && /^\tmatch request tagged "fh" header set "Authorization" value "Bearer [^"\s]+"$/u.test(lines[0] ?? "");
  return ok ? null : `the Authorization rules are:\n${lines.join("\n")}`;
}

function syspatchTime(rendered: Rendered): string | null {
  const crontab = rendered["etc/crontab"] ?? "";
  assert(crontab !== "", "crontab is rendered");
  assert(SYSPATCH_TIME_UTC.hour === "20", "syspatch runs at hour 20");
  let line = "";
  for (const text of crontab.split("\n")) if (line === "" && text.includes("syspatch")) line = text;
  const [minute, hour] = line.split("\t");
  return minute === SYSPATCH_TIME_UTC.minute && hour === SYSPATCH_TIME_UTC.hour ? null : `syspatch runs at ${hour ?? "?"}:${minute ?? "?"}`;
}

function siteUpdateSingle(rendered: Rendered): string | null {
  const crontab = rendered["etc/crontab"] ?? "";
  assert(crontab !== "", "crontab is rendered");
  assert(!crontab.includes("\0"), "a config has no NUL byte");
  return /\t-s su deploy -c \/usr\/local\/sbin\/site-update$/mu.test(crontab) ? null : "site-update has no -s";
}

const SMTPD_RULES = [
  'match from any tag internet for domain "teoyujie.org" rcpt-to <virtuals> action "forward"',
  'match from any tag internet for domain "teoyujie.org" reject',
  'match from src 10.8.0.0/24 tag vpn for local action "local"',
  'match from src 10.8.0.0/24 tag vpn for any reject',
] as const;

function smtpdRules(rendered: Rendered): string | null {
  assert(VPN_ADDRESS.length > 0, "there is a VPN address");
  const smtpd = rendered["etc/smtpd.conf"] ?? "";
  assert(smtpd !== "", "smtpd.conf is rendered");
  assert(SMTPD_RULES.length === 4, "four match rules are needed");
  for (const line of SMTPD_RULES) if (!smtpd.includes(line)) return "a match rule of smtpd is missing";
  return null;
}

function doasWheel(rendered: Rendered): string | null {
  const doas = rendered["etc/doas.conf"];
  assert(doas !== undefined, "doas.conf is rendered");
  assert(!doas.includes("\0"), "a config has no NUL byte");
  return doas.trim() === "permit persist :wheel" ? null : "doas.conf is not permit persist :wheel";
}

function roomPort(_rendered: Rendered, repoFile: RepoFile): string | null {
  const rcText = repoFile("etc/rc.d/neurons_room");
  const httpdText = repoFile("etc/httpd.conf");
  assert(rcText !== "", "the rc.d script has content");
  assert(httpdText !== "", "httpd.conf has content");
  const rc = /daemon_flags="--port (\d+)"/u.exec(rcText)?.[1];
  const httpd = /fastcgi socket tcp 127\.0\.0\.1 (\d+)/u.exec(httpdText)?.[1];
  return rc !== undefined && rc === httpd ? null : `rc.d port ${rc ?? "?"}, httpd port ${httpd ?? "?"}`;
}

function factList(): readonly Fact[] {
  assert(SMTPD_RULES.length > 0, "there are smtpd rules");
  assert(TUNNEL_LINES.length > 0, "there are tunnel lines");
  return [
    { name: "the 4 private names are the same in unbound, httpd, acme-client, relayd and private-cert", holds: privateNames },
    { name: "unbound gives each private name only an A record with the VPN address, so a device uses no public AAAA record", holds: unboundRecords },
    { name: "the tunnel ports are the same in sshd_config, and relayd forwards to them on the VPN address only", holds: tunnelPorts },
    { name: "the tunnel login has no shell command, no TTY, no agent and no X11, and listens on a client address only as set", holds: tunnelLogin },
    { name: "sshd: no root login, and keys only", holds: sshdKeysOnly },
    { name: "httpd has no listener on the VPN address port 443, because relayd has it", holds: httpdNoVpnListener },
    { name: "httpd: the read locations of the pond come before /pond/*, because httpd uses the first location that matches", holds: pondReadOrder },
    { name: "httpd: the Let's Encrypt challenge is served from /acme with the first 2 path parts stripped, on each port 80 server", holds: acmeChallenge },
    { name: "pf: from the internet, only SSH, mail, web, WireGuard and ICMP are open, only on the public addresses", holds: pfPassIn },
    { name: "pf: all other traffic is blocked, and everything on wg0 is open", holds: pfBaseRules },
    { name: "relayd: for each name, a request with an Origin is blocked before the pass of its own https Origin, and the Host and Origin are set last", holds: relaydOrder },
    { name: "relayd: after the tests, it sets Host and Origin to the local address of each app, because each app accepts only that address", holds: relaydSets },
    { name: "relayd: only the requests of fh get the token of femahoy", holds: relaydToken },
    { name: "crontab: syspatch runs at 20:30 UTC, which is 04:30 in Singapore", holds: syspatchTime },
    { name: "crontab: site-update runs with -s, so only 1 runs at a time", holds: siteUpdateSingle },
    { name: "smtpd: from the internet, only the virtual addresses get mail; from the VPN, only local users; others are rejected", holds: smtpdRules },
    { name: "doas: the members of wheel get root with their password, for 5 minutes", holds: doasWheel },
    { name: "rc.d: the room relay listens on the port that httpd sends the room requests to", holds: roomPort },
  ];
}

export async function facts(): Promise<readonly Finding[]> {
  const rendered = await renderConfigs();
  assert(Object.keys(rendered).length > 0, "configs were rendered");
  const repoFile: RepoFile = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
  const findings: Finding[] = [];
  for (const fact of factList()) {
    const broken = fact.holds(rendered, repoFile);
    if (broken !== null) findings.push({ file: "check/facts.ts", line: 0, message: `${fact.name}: ${broken}` });
  }
  assert(findings.length <= factList().length, "at most one finding for each fact");
  return findings;
}
