import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLocalConf } from "./conf.ts";
import { REPO_ROOT, run } from "./lib.ts";

const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
const MIB = 1024 * 1024;

let work = "";
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "scripts-"));
  mkdirSync(join(work, "bin"));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function script(name: string, paths: Readonly<Record<string, string>> = {}): string {
  let text = readFileSync(join(REPO_ROOT, "bin", name), "utf8").replaceAll("@KNOWN_IPS@", conf.KNOWN_IPS);
  for (const [server, local] of Object.entries(paths)) {
    if (!text.includes(server)) throw new Error(`bin/${name} has no ${server}`);
    text = text.replaceAll(server, local);
  }
  const path = join(work, name);
  writeFileSync(path, text);
  chmodSync(path, 0o755);
  return path;
}

function fake(name: string, body: string): void {
  const path = join(work, "bin", name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

function env(extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { PATH: `${join(work, "bin")}:${process.env["PATH"] ?? ""}`, ...extra };
}

describe("ssh-alert: mail root for each SSH login from an address that is not known", () => {
  const lines = [
    "Nov  4 10:00:00 teoyujie sshd-session[11]: Accepted publickey for admin from 203.0.113.7 port 50000 ssh2",
    "Nov  4 10:00:01 teoyujie sshd-session[12]: Invalid user Accepted publickey for root from 198.51.100.1 from 203.0.113.9 port 2",
    "Nov  4 10:00:02 teoyujie sshd-session[13]: Failed password for invalid user x: Accepted publickey for root from 198.51.100.2 port 1",
    "Nov  4 10:00:03 teoyujie su: Accepted publickey for root from 198.51.100.3 port 1",
    "Nov  4 10:00:04 teoyujie sshd-session[14]: Accepted publickey for admin from 10.8.0.2 port 5 ssh2",
  ];
  test("only a message that starts with \"Accepted \" from sshd gives a mail, because a client can put any text in a user name", async () => {
    const log = join(work, "mail.log");
    fake("mail", `echo "$2" >> ${log}; cat >> ${log}`);
    const ran = await run(["sh", script("ssh-alert")], { env: env(), stdin: `${lines.join("\n")}\n` });
    expect(ran.code).toBe(0);
    expect(readFileSync(log, "utf8")).toBe(`SSH login from 203.0.113.7\n${lines[0] ?? ""}\n`);
  });
});

describe("tunnel-wait: the login shell of the user tunnel runs no command and waits", () => {
  test("it waits until init is the parent, so a client without ssh -N keeps its tunnels", async () => {
    const sleep = Bun.which("sleep");
    if (sleep === null) throw new Error("sleep is not in PATH");
    const parent = join(work, "ppid");
    writeFileSync(parent, "4242\n");
    fake("ps", `cat ${parent}`);
    fake("sleep", `exec ${sleep} 0.05`);
    const proc = Bun.spawn(["sh", script("tunnel-wait")], { env: { ...process.env, ...env() }, stdout: "ignore", stderr: "ignore" });
    await Bun.sleep(400);
    expect(proc.exitCode).toBeNull();
    writeFileSync(parent, "1\n");
    const code = await Promise.race([proc.exited, Bun.sleep(3000).then(() => "still waiting")]);
    proc.kill();
    expect(code).toBe(0);
  });
});

describe("deploy-only: the forced command of the user deploy", () => {
  const deploy = async (name: string, archive: string): Promise<number> =>
    (await run(["sh", "-c", `exec "$0" < "$1"`, script("deploy-only", { "/var/www/web": join(work, "web") }), archive], { env: env({ SSH_ORIGINAL_COMMAND: name }) })).code;
  const archiveOf = async (files: Readonly<Record<string, string>>, extra: readonly string[] = []): Promise<string> => {
    const source = mkdtempSync(join(work, "src-"));
    for (const [file, text] of Object.entries(files)) writeFileSync(join(source, file), text);
    const archive = `${source}.tgz`;
    const ran = await run(["tar", "-czPf", archive, "-C", source, ...Object.keys(files), ...extra]);
    if (ran.code !== 0) throw new Error(ran.stderr);
    return archive;
  };
  beforeEach(() => {
    mkdirSync(join(work, "web", "apps"), { recursive: true });
  });

  test("the archive replaces the folder, so files not in it go away", async () => {
    expect(await deploy("site", await archiveOf({ "index.html": "1", "old.html": "1" }))).toBe(0);
    expect(await deploy("site", await archiveOf({ "index.html": "2" }))).toBe(0);
    expect(readdirSync(join(work, "web", "site"))).toEqual(["index.html"]);
    expect(readFileSync(join(work, "web", "site", "index.html"), "utf8")).toBe("2");
    expect(readdirSync(join(work, "web")).sort()).toEqual(["apps", "site"]);
  });

  for (const [label, member] of [["../", "../outside.txt"], ["/", "ABSOLUTE"]] as const) {
    test(`a name with ${label} in the archive writes nothing outside the folder, and a refused archive is not put in place`, async () => {
      const outside = join(work, "outside.txt");
      writeFileSync(outside, "x");
      const archive = await archiveOf({ "index.html": "1" }, [member === "ABSOLUTE" ? outside : member]);
      rmSync(outside);
      const code = await deploy("apps/test", archive);
      expect(existsSync(outside)).toBe(false);
      expect(readdirSync(join(work, "web")).sort()).toEqual(["apps"]);
      expect(readdirSync(join(work, "web", "apps"))).toEqual([code === 0 ? "test" : "test.new"]);
      expect(readFileSync(join(work, "web", "apps", code === 0 ? "test" : "test.new", "index.html"), "utf8")).toBe("1");
    });
  }

  test("only site and apps/NAME are allowed", async () => {
    const archive = await archiveOf({ "index.html": "1" });
    for (const name of ["", "sh", "apps/", "apps/../x", "apps/A", "apps/a/b", "site/x"]) expect(await deploy(name, archive), name).toBe(1);
    expect(readdirSync(join(work, "web"))).toEqual(["apps"]);
    expect(readdirSync(join(work, "web", "apps"))).toEqual([]);
  });
});

describe("fleet-upload: the forced command of the user fleet", () => {
  const fleet = (): string => join(work, "fleet");
  const upload = async (name: string, page: string): Promise<number> =>
    (await run(["sh", script("fleet-upload", { "/var/www/fleet": fleet() })], { env: env({ SSH_ORIGINAL_COMMAND: name }), stdin: page })).code;
  beforeEach(() => {
    mkdirSync(fleet());
    writeFileSync(join(fleet(), "mac.html"), "old");
  });

  test("a page of 1 MiB goes in with mode 644; ulimit -f 2048 counts blocks of 512 bytes", async () => {
    const page = "a".repeat(MIB);
    expect(await upload("mac", page)).toBe(0);
    expect(readFileSync(join(fleet(), "mac.html"), "utf8")).toBe(page);
    expect((statSync(join(fleet(), "mac.html")).mode & 0o777).toString(8)).toBe("644");
    expect(readdirSync(fleet())).toEqual(["mac.html"]);
  });

  test("a page larger than 1 MiB fails, the old page stays and no temp file stays", async () => {
    expect(await upload("mac", "a".repeat(MIB + 1))).toBe(1);
    expect(readFileSync(join(fleet(), "mac.html"), "utf8")).toBe("old");
    expect(readdirSync(fleet())).toEqual(["mac.html"]);
  });

  test("during the upload, httpd sees the complete old page, and the temp file starts with a dot", async () => {
    const proc = Bun.spawn(["sh", script("fleet-upload", { "/var/www/fleet": fleet() })], {
      env: { ...process.env, ...env({ SSH_ORIGINAL_COMMAND: "desk" }) },
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    });
    proc.stdin.write("new");
    await proc.stdin.flush();
    for (let attempt = 0; attempt < 50 && readdirSync(fleet()).length < 2; attempt += 1) await Bun.sleep(20);
    const during = readdirSync(fleet()).filter((name) => name !== "mac.html");
    expect(during).toHaveLength(1);
    expect(during[0]).toMatch(/^\.desk\./);
    expect(existsSync(join(fleet(), "desk.html"))).toBe(false);
    await proc.stdin.end();
    expect(await proc.exited).toBe(0);
    expect(readFileSync(join(fleet(), "desk.html"), "utf8")).toBe("new");
    expect(readdirSync(fleet()).sort()).toEqual(["desk.html", "mac.html"]);
  });

  test("only mac and desk are allowed", async () => {
    for (const name of ["", "index", "../mac", "mac.html"]) expect(await upload(name, "x"), name).toBe(1);
    expect(readdirSync(fleet())).toEqual(["mac.html"]);
  });
});

describe("site-update: deploy each new commit of main, and check it", () => {
  const site = (): string => join(work, "web", "site");
  const log = (): string => join(work, "ftp.log");
  const commit = async (sha: string, index: string, fixedUrls: string): Promise<Readonly<Record<string, string>>> => {
    const tree = join(work, `tree-${sha}`);
    mkdirSync(join(tree, `site-${sha}`, "public"), { recursive: true });
    writeFileSync(join(tree, `site-${sha}`, "public", "index.html"), index);
    writeFileSync(join(tree, `site-${sha}`, "fixed-urls.txt"), fixedUrls);
    await run(["tar", "-czf", `${tree}.tgz`, "-C", tree, "."]);
    return { FAKE_SHA: sha, FAKE_TGZ: `${tree}.tgz` };
  };
  const update = async (head: Readonly<Record<string, string>>): Promise<{ readonly code: number; readonly stdout: string }> => {
    const deployOnly = script("deploy-only", { "/var/www/web": join(work, "web") });
    const ran = await run(["sh", script("site-update", { "/home/deploy/site-commit": join(work, "last"), "/var/www/web/site": site(), "/usr/local/sbin/deploy-only": deployOnly })], { env: env(head) });
    return { code: ran.code, stdout: ran.stdout };
  };
  beforeEach(() => {
    mkdirSync(site(), { recursive: true });
    writeFileSync(join(site(), "index.html"), "first");
    fake("ftp", `case $3 in *info/refs*) printf '0000%s refs/heads/main\\n' "$FAKE_SHA" ;; *) echo "$3" >> ${log()}; cp "$FAKE_TGZ" "$2" ;; esac`);
    fake("openssl", `read -r _ p _; f=${site()}$p; [ "$p" != / ] || f=${site()}/index.html; if [ -f "$f" ]; then echo "HTTP/1.0 200 OK"; else echo "HTTP/1.0 404 Not Found"; fi`);
  });

  test("each commit is deployed 1 time only", async () => {
    const good = await commit("a".repeat(40), "good", "/index.html\n");
    expect(await update(good)).toEqual({ code: 0, stdout: "" });
    expect(readFileSync(join(site(), "index.html"), "utf8")).toBe("good");
    expect(await update(good)).toEqual({ code: 0, stdout: "" });
    expect(readFileSync(log(), "utf8").trim().split("\n")).toHaveLength(1);
  });

  test("a failed check puts the previous site back, and the failed commit is not deployed again", async () => {
    const bad = await commit("b".repeat(40), "bad", "/missing.html\n");
    const first = await update(bad);
    expect(first.code).toBe(1);
    expect(first.stdout).toContain(`site: ${"b".repeat(40)} gave 404 for /missing.html, so the previous site is back.`);
    expect(readFileSync(join(site(), "index.html"), "utf8")).toBe("first");
    expect(await update(bad)).toEqual({ code: 0, stdout: "" });
    expect(readFileSync(log(), "utf8").trim().split("\n")).toHaveLength(1);
  });
});

describe("blocklist-update: make the unbound blocklist from the hosts list", () => {
  const etc = (): string => join(work, "etc");
  const update = async (hosts: string): Promise<number> => {
    writeFileSync(join(work, "hosts"), hosts);
    fake("ftp", `cp ${join(work, "hosts")} "$2"`);
    fake("unbound-control", `echo reload >> ${join(work, "unbound.log")}`);
    return (await run(["sh", script("blocklist-update", { "/var/unbound/etc": etc() })], { env: env() })).code;
  };
  const names = Array.from({ length: 10001 }, (_, i) => `ad${i}.example.com`);
  beforeEach(() => {
    mkdirSync(etc());
    writeFileSync(join(etc(), "blocklist.conf"), "old\n");
  });

  test("only domain names go in, each as always_nxdomain, so the list never sends a name to another address", async () => {
    const bad = ["0.0.0.0 0.0.0.0", "0.0.0.0 10.0.0.1", "127.0.0.1 local.example.com", "0.0.0.0 Upper.example.com", '0.0.0.0 q".example.com', "# 0.0.0.0 note.example.com", "0.0.0.0 a.example.com redirect"];
    expect(await update([...names.map((name) => `0.0.0.0 ${name}`), ...bad].join("\n"))).toBe(0);
    const lines = readFileSync(join(etc(), "blocklist.conf"), "utf8").trim().split("\n");
    expect(lines.sort()).toEqual([...names, "a.example.com"].map((name) => `local-zone: "${name}." always_nxdomain`).sort());
    expect(readFileSync(join(work, "unbound.log"), "utf8")).toBe("reload\n");
  });

  test("a short list means a bad download, so the old list stays", async () => {
    expect(await update(names.slice(0, 100).map((name) => `0.0.0.0 ${name}`).join("\n"))).toBe(1);
    expect(readFileSync(join(etc(), "blocklist.conf"), "utf8")).toBe("old\n");
    expect(existsSync(join(work, "unbound.log"))).toBe(false);
  });
});

describe("install.sh: the wg0 restart", () => {
  const installScript = readFileSync(join(REPO_ROOT, "install.sh"), "utf8");
  const etc = (): string => join(work, "etc");
  const from = (firstLine: string): string => {
    const at = installScript.indexOf(`\n${firstLine}\n`);
    if (at === -1) throw new Error(`install.sh has no line ${firstLine}`);
    return installScript.slice(at + 1).replaceAll("/etc/", `${etc()}/`);
  };
  const log = (): string => join(work, "calls.log");
  const calls = (): readonly string[] => (existsSync(log()) ? readFileSync(log(), "utf8").trim().split("\n") : []);
  beforeEach(() => {
    mkdirSync(etc());
    const mv = Bun.which("mv");
    if (mv === null) throw new Error("mv is not in PATH");
    fake("sleep", `echo "sleep $*" >> ${log()}`);
    fake("mv", `echo "mv $*" >> ${log()}; exec ${mv} "$@"`);
    fake("nohup", `echo "nohup HUP ignored: $(( 0x$(awk '$1 == "SigIgn:" { print $2 }' /proc/$$/status) & 1 ))" >> ${log()}; exec "$@"`);
    writeFileSync(join(etc(), "netstart"), `echo "netstart $*" >> ${log()}\n`);
  });

  test("a changed wg0 restarts as the last step of install.sh, in a job that ignores HUP and moves the new file in first", async () => {
    fake("ifconfig", `echo "ifconfig $*" >> ${log()}`);
    writeFileSync(join(etc(), "hostname.wg0.new"), "new");
    const ran = await run(["sh", "-c", from("if [ -e /etc/hostname.wg0.new ]; then")], { env: env() });
    expect(ran).toEqual({ code: 0, stdout: "wg0 restarts in 2 seconds. The VPN stops for some seconds.\n", stderr: "" });
    for (let attempt = 0; attempt < 100 && !calls().some((call) => call.startsWith("netstart")); attempt += 1) await Bun.sleep(20);
    expect(calls()).toEqual([
      "nohup HUP ignored: 1",
      "sleep 2",
      `mv -f ${etc()}/hostname.wg0.new ${etc()}/hostname.wg0`,
      "ifconfig wg0 destroy",
      "netstart wg0",
    ]);
    expect(readFileSync(join(etc(), "hostname.wg0"), "utf8")).toBe("new");
  });

  const check = async (running: boolean, old: string): Promise<void> => {
    fake("ifconfig", running ? "exit 0" : "exit 1");
    writeFileSync(join(etc(), "hostname.wg0"), old);
    writeFileSync(join(etc(), "hostname.wg0.new"), "new");
    const block = from("if cmp -s /etc/hostname.wg0.new /etc/hostname.wg0 && ifconfig wg0 >/dev/null 2>&1; then");
    const ran = await run(["sh", "-c", block.slice(0, block.indexOf("\nfi\n") + 4)], { env: env() });
    expect(ran.code).toBe(0);
  };

  test("a running wg0 with the same file: hostname.wg0.new goes away and nothing restarts", async () => {
    await check(true, "new");
    expect(existsSync(join(etc(), "hostname.wg0.new"))).toBe(false);
    expect(calls()).toEqual([]);
  });

  test("a running wg0 with a changed file: hostname.wg0.new stays for the last step, so a failed run restarts on the next run", async () => {
    await check(true, "old");
    expect(readFileSync(join(etc(), "hostname.wg0.new"), "utf8")).toBe("new");
    expect(readFileSync(join(etc(), "hostname.wg0"), "utf8")).toBe("old");
    expect(calls()).toEqual([]);
  });

  test("a wg0 that does not run: the new file goes in place and wg0 starts at once", async () => {
    await check(false, "old");
    expect(existsSync(join(etc(), "hostname.wg0.new"))).toBe(false);
    expect(readFileSync(join(etc(), "hostname.wg0"), "utf8")).toBe("new");
    expect(calls()).toEqual([`mv -f ${etc()}/hostname.wg0.new ${etc()}/hostname.wg0`, "netstart wg0"]);
  });
});
