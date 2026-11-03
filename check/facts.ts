import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Rendered, renderConfigs } from "./configs.ts";
import { type Finding, REPO_ROOT } from "./lib.ts";

const PRIVATE_NAMES = ["mac.lavish", "desk.lavish", "fh", "fleet"] as const;
const DOMAIN = "teoyujie.org";
const VPN_ADDRESS = "10.8.0.1";
const TUNNEL_PORTS = [4387, 4388, 8790] as const;
const PUBLIC_TCP_PORTS = ["ssh", "smtp", "http", "https"] as const;
const WIREGUARD_PORT = 51820;
const APP_PORT_ON_ITS_HOST = { mac: 4387, desk: 4387, fh: 8790 } as const;
const SYSPATCH_TIME_UTC = { minute: "30", hour: "20" } as const;

interface Fact {
  readonly name: string;
  readonly holds: (rendered: Rendered, repoFile: (path: string) => string) => string | null;
}

const fullNames = PRIVATE_NAMES.map((name) => `${name}.${DOMAIN}`);

function sameSet(label: string, found: readonly string[]): string | null {
  const have = [...new Set(found)].sort();
  const want = [...fullNames].sort();
  return have.join(",") === want.join(",") ? null : `${label} has ${have.join(" ")}, expected ${want.join(" ")}`;
}

function namesIn(text: string): string[] {
  return [...text.matchAll(/(?:mac\.lavish|desk\.lavish|fh|fleet)\.teoyujie\.org/g)].map((match) => match[0]);
}

function sectionOf(text: string, start: RegExp): string {
  const found = start.exec(text);
  if (found === null) return "";
  const rest = text.slice(found.index);
  const firstLineEnd = rest.indexOf("\n") + 1;
  const next = rest.slice(firstLineEnd).search(/^\S/m);
  return next === -1 ? rest : rest.slice(0, firstLineEnd + next);
}

const FACTS: readonly Fact[] = [
  {
    name: "the 4 private names are the same in unbound, httpd, acme-client, relayd and private-cert",
    holds: (rendered, repoFile) => {
      const unbound = [...(rendered.get("etc/unbound.conf") ?? "").matchAll(/local-zone: "([^"]+)\." static/g)].map((m) => m[1] ?? "");
      const httpd = namesIn(sectionOf(rendered.get("etc/httpd.conf") ?? "", /^server "mac\.lavish\.teoyujie\.org" \{/m));
      const acme = namesIn(sectionOf(rendered.get("etc/acme-client.conf") ?? "", /^domain mac\.lavish\.teoyujie\.org \{/m));
      const relayd = [...(rendered.get("etc/relayd.conf") ?? "").matchAll(/header "Host" value "([^"]+)"/g)].map((m) => m[1] ?? "");
      const cert = [...repoFile("bin/private-cert").matchAll(/for n in ([^;]+);/g)].flatMap((m) => (m[1] ?? "").split(" ").map((n) => `${n}.${DOMAIN}`));
      return sameSet("unbound", unbound) ?? sameSet("httpd", httpd) ?? sameSet("acme-client", acme) ?? sameSet("relayd", relayd) ?? sameSet("private-cert", cert);
    },
  },
  {
    name: "unbound gives each private name only an A record with the VPN address, so a device uses no public AAAA record",
    holds: (rendered) => {
      const unbound = rendered.get("etc/unbound.conf") ?? "";
      const records = [...unbound.matchAll(/local-data: "([^ ]+)\. (\S+) (\S+)"/g)];
      const bad = records.filter((m) => m[2] !== "A" || m[3] !== VPN_ADDRESS);
      return records.length === fullNames.length && bad.length === 0 ? null : `local-data is not 1 A record of ${VPN_ADDRESS} for each name`;
    },
  },
  {
    name: "the tunnel ports are the same in sshd_config, and relayd forwards to them on the VPN address only",
    holds: (rendered) => {
      const sshd = [...(rendered.get("etc/sshd_config") ?? "").matchAll(/PermitListen (.*)$/gm)].flatMap((m) => (m[1] ?? "").split(" "));
      const want = TUNNEL_PORTS.map((port) => `${VPN_ADDRESS}:${port}`);
      if (sshd.sort().join(" ") !== [...want].sort().join(" ")) return `PermitListen is ${sshd.join(" ")}`;
      const relayd = rendered.get("etc/relayd.conf") ?? "";
      const ports = [...relayd.matchAll(/forward to <(?:mac|desk|fh)> port (\d+)/g)].map((m) => Number(m[1]));
      const tables = [...relayd.matchAll(/^table <(?:mac|desk|fh)> \{ ([^ ]+) \}/gm)].map((m) => m[1]);
      return ports.sort().join() === [...TUNNEL_PORTS].sort().join() && tables.every((a) => a === VPN_ADDRESS) ? null : "relayd forwards to other ports or addresses";
    },
  },
  {
    name: "the tunnel login has no shell command, no TTY, no agent and no X11, and listens on a client address only as set",
    holds: (rendered) => {
      const block = sectionOf(rendered.get("etc/sshd_config") ?? "", /^Match User tunnel/m);
      const need = ["AllowTcpForwarding remote", "AllowStreamLocalForwarding no", "GatewayPorts clientspecified", "PermitTTY no", "AllowAgentForwarding no", "X11Forwarding no"];
      const missing = need.filter((line) => !block.includes(line));
      return missing.length === 0 ? null : `Match User tunnel lacks: ${missing.join(", ")}`;
    },
  },
  {
    name: "sshd: no root login, and keys only",
    holds: (rendered) => {
      const sshd = rendered.get("etc/sshd_config") ?? "";
      return sshd.includes("PermitRootLogin no\n") && sshd.includes("AuthenticationMethods publickey\n") ? null : "root login or a password is possible";
    },
  },
  {
    name: "httpd has no listener on the VPN address port 443, because relayd has it",
    holds: (rendered) => {
      const httpd = rendered.get("etc/httpd.conf") ?? "";
      return new RegExp(`listen on ${VPN_ADDRESS.replaceAll(".", "\\.")} (tls )?port 443`).test(httpd) ? "httpd listens on the VPN address port 443" : null;
    },
  },
  {
    name: "httpd: the read locations of the pond come before /pond/*, because httpd uses the first location that matches",
    holds: (rendered) => {
      const httpd = rendered.get("etc/httpd.conf") ?? "";
      const catchAll = httpd.indexOf('location "/pond/*"');
      const reads = ['location "/pond/entries.json"', 'location "/log/"', 'location "/log/feed.xml"'].map((location) => httpd.indexOf(location));
      return catchAll > 0 && reads.every((at) => at > 0 && at < catchAll) ? null : "a read location is missing or after /pond/*";
    },
  },
  {
    name: "httpd: the Let's Encrypt challenge is served from /acme with the first 2 path parts stripped, on each port 80 server",
    holds: (rendered) => {
      const httpd = rendered.get("etc/httpd.conf") ?? "";
      const servers = httpd.split(/^server /m).slice(1).filter((server) => /listen on egress port 80/.test(server));
      return servers.length >= 2 && servers.every((s) => s.includes('location "/.well-known/acme-challenge/*" {\n\t\troot "/acme"\n\t\trequest strip 2')) ? null : "a port 80 server has no challenge location";
    },
  },
  {
    name: "pf: from the internet, only SSH, mail, web, WireGuard and ICMP are open, only on the public addresses",
    holds: (rendered) => {
      const passIn = (rendered.get("etc/pf.conf") ?? "").split("\n").filter((line) => line.startsWith("pass in"));
      const allowed = [
        `pass in on egress proto tcp to (egress) port { ${PUBLIC_TCP_PORTS.join(" ")} }`,
        `pass in on egress proto udp to (egress) port ${WIREGUARD_PORT}`,
        "pass in on egress inet proto icmp icmp-type unreach",
        "pass in on egress inet6 proto icmp6",
      ];
      return passIn.join("\n") === allowed.join("\n") ? null : `pass in rules are:\n${passIn.join("\n")}`;
    },
  },
  {
    name: "pf: all other traffic is blocked, and everything on wg0 is open",
    holds: (rendered) => {
      const pf = rendered.get("etc/pf.conf") ?? "";
      return ["block return\n", "pass out\n", "pass on wg0\n", "set skip on lo\n"].every((line) => pf.includes(line)) ? null : "a base rule of pf is missing";
    },
  },
  {
    name: "relayd: for each name, a request with an Origin is blocked before the pass of its own https Origin, and the Host and Origin are set last",
    holds: (rendered) => {
      const relayd = rendered.get("etc/relayd.conf") ?? "";
      const lines = relayd.split("\n");
      const firstSet = lines.findIndex((line) => /header set/.test(line));
      const lastTest = lines.map((line, at) => (/^\s*(pass|block) request/.test(line) ? at : -1)).reduce((a, b) => Math.max(a, b), -1);
      if (firstSet < lastTest) return "a set rule comes before a pass or block rule";
      for (const tag of ["mac", "desk", "fh", "fleet"]) {
        const block = lines.findIndex((line) => line.includes(`block request tagged "${tag}" header "Origin" value "*"`));
        const pass = lines.findIndex((line) => line.includes(`pass request tagged "${tag}" header "Origin" value "https://`));
        const plain = lines.findIndex((line) => line.includes(`pass request tagged "${tag}" forward to`));
        if (!(plain >= 0 && plain < block && block < pass)) return `the rules of ${tag} are not in the order pass, block, pass with own Origin`;
      }
      return relayd.includes('block request quick header "Sec-Fetch-Site" value "cross-site"') ? null : "cross-site requests are not blocked";
    },
  },
  {
    name: "relayd: after the tests, it sets Host and Origin to the local address of each app, because each app accepts only that address",
    holds: (rendered) => {
      const sets = [...(rendered.get("etc/relayd.conf") ?? "").matchAll(/match request tagged "(\w+)" header set "(Host|Origin)" value "([^"]+)"/g)];
      const want = Object.entries(APP_PORT_ON_ITS_HOST).flatMap(([tag, port]) => [`${tag} Host 127.0.0.1:${port}`, `${tag} Origin http://127.0.0.1:${port}`]);
      const have = sets.map((m) => `${m[1] ?? ""} ${m[2] ?? ""} ${m[3] ?? ""}`);
      return have.sort().join("\n") === want.sort().join("\n") ? null : `the set rules are:\n${have.join("\n")}`;
    },
  },
  {
    name: "relayd: only the requests of fh get the token of femahoy",
    holds: (rendered) => {
      const lines = (rendered.get("etc/relayd.conf") ?? "").split("\n").filter((line) => line.includes("Authorization"));
      return lines.length === 1 && /^\tmatch request tagged "fh" header set "Authorization" value "Bearer [^"\s]+"$/.test(lines[0] ?? "") ? null : `the Authorization rules are:\n${lines.join("\n")}`;
    },
  },
  {
    name: "crontab: syspatch runs at 20:30 UTC, which is 04:30 in Singapore",
    holds: (rendered) => {
      const line = (rendered.get("etc/crontab") ?? "").split("\n").find((text) => text.includes("syspatch")) ?? "";
      const [minute, hour] = line.split("\t");
      return minute === SYSPATCH_TIME_UTC.minute && hour === SYSPATCH_TIME_UTC.hour ? null : `syspatch runs at ${hour ?? "?"}:${minute ?? "?"}`;
    },
  },
  {
    name: "crontab: site-update runs with -s, so only 1 runs at a time",
    holds: (rendered) => (/\t-s su deploy -c \/usr\/local\/sbin\/site-update$/m.test(rendered.get("etc/crontab") ?? "") ? null : "site-update has no -s"),
  },
  {
    name: "smtpd: from the internet, only the virtual addresses get mail; from the VPN, only local users; others are rejected",
    holds: (rendered) => {
      const smtpd = rendered.get("etc/smtpd.conf") ?? "";
      const need = [
        'match from any tag internet for domain "teoyujie.org" rcpt-to <virtuals> action "forward"',
        'match from any tag internet for domain "teoyujie.org" reject',
        'match from src 10.8.0.0/24 tag vpn for local action "local"',
        'match from src 10.8.0.0/24 tag vpn for any reject',
      ];
      return need.every((line) => smtpd.includes(line)) ? null : "a match rule of smtpd is missing";
    },
  },
  {
    name: "doas: the members of wheel get root with their password, for 5 minutes",
    holds: (rendered) => (rendered.get("etc/doas.conf")?.trim() === "permit persist :wheel" ? null : "doas.conf is not permit persist :wheel"),
  },
  {
    name: "rc.d: the room relay listens on the port that httpd sends the room requests to",
    holds: (_rendered, repoFile) => {
      const rc = /daemon_flags="--port (\d+)"/.exec(repoFile("etc/rc.d/neurons_room"))?.[1];
      const httpd = /fastcgi socket tcp 127\.0\.0\.1 (\d+)/.exec(repoFile("etc/httpd.conf"))?.[1];
      return rc !== undefined && rc === httpd ? null : `rc.d port ${rc ?? "?"}, httpd port ${httpd ?? "?"}`;
    },
  },
];

export async function facts(): Promise<readonly Finding[]> {
  const rendered = await renderConfigs();
  const repoFile = (path: string): string => readFileSync(join(REPO_ROOT, path), "utf8");
  return FACTS.flatMap((fact) => {
    const broken = fact.holds(rendered, repoFile);
    return broken === null ? [] : [{ file: "check/facts.ts", line: 0, message: `${fact.name}: ${broken}` }];
  });
}
