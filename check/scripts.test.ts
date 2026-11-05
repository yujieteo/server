import { afterEach, beforeEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseLocalConf } from "./conf.ts";
import { REPO_ROOT, run } from "./lib.ts";

const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
const MIB = 1024 * 1024;

setDefaultTimeout(30_000);

let work = "";
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "scripts-"));
  mkdirSync(join(work, "bin"));
});
afterEach(() => {
  rmSync(work, { recursive: true, force: true });
});

function script(name: string, paths: Readonly<Record<string, string>> = {}): string {
  const path = join(work, name);
  if (existsSync(path)) return path;
  let text = readFileSync(join(REPO_ROOT, "bin", name), "utf8").replaceAll("@KNOWN_IPS@", conf.KNOWN_IPS);
  for (const [server, local] of Object.entries(paths)) {
    if (!text.includes(server)) throw new Error(`bin/${name} has no ${server}`);
    text = text.replaceAll(server, local);
  }
  writeFileSync(path, text);
  chmodSync(path, 0o755);
  return path;
}

function fake(name: string, body: string): void {
  const path = join(work, "bin", name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

async function waitFor(done: () => boolean): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timers: { poll?: ReturnType<typeof setInterval>; giveUp?: ReturnType<typeof setTimeout> } = {};
    const stop = (): void => {
      clearInterval(timers.poll);
      clearTimeout(timers.giveUp);
    };
    timers.giveUp = setTimeout(() => {
      stop();
      resolve();
    }, 2000);
    timers.poll = setInterval(() => {
      try {
        if (!done()) return;
        stop();
        resolve();
      } catch (error) {
        stop();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }, 20);
  });
}

function env(extra: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { PATH: `${join(work, "bin")}:${process.env["PATH"] ?? ""}`, ...extra };
}

function suite1(): void {
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
}

function suite2(): void {
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
}

function suite3(): void {
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
      expect(readdirSync(join(work, "web")).toSorted()).toEqual(["apps", "site"]);
    });

    const refused = (label: string, member: string): void => {
      test(`a name with ${label} in the archive writes nothing outside the folder, and a refused archive is not put in place`, async () => {
        const outside = join(work, "outside.txt");
        writeFileSync(outside, "x");
        const archive = await archiveOf({ "index.html": "1" }, [member === "ABSOLUTE" ? outside : member]);
        rmSync(outside);
        const code = await deploy("apps/test", archive);
        expect(existsSync(outside)).toBe(false);
        expect(readdirSync(join(work, "web")).toSorted()).toEqual(["apps"]);
        const placed = code === 0 ? "test" : "test.new";
        expect(readdirSync(join(work, "web", "apps"))).toEqual([placed]);
        expect(readFileSync(join(work, "web", "apps", placed, "index.html"), "utf8")).toBe("1");
      });
    };
    refused("../", "../outside.txt");
    refused("/", "ABSOLUTE");

    test("only site and apps/NAME are allowed", async () => {
      const archive = await archiveOf({ "index.html": "1" });
      const names = ["", "sh", "apps/", "apps/../x", "apps/A", "apps/a/b", "site/x"];
      const jobs: Promise<number>[] = [];
      for (const name of names) jobs.push(deploy(name, archive));
      const codes = await Promise.all(jobs);
      for (const [at, name] of names.entries()) expect(codes[at], name).toBe(1);
      expect(readdirSync(join(work, "web"))).toEqual(["apps"]);
      expect(readdirSync(join(work, "web", "apps"))).toEqual([]);
    });
  });
}

function suite4(): void {
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
      await proc.stdin.write("new");
      await proc.stdin.flush();
      await waitFor(() => readdirSync(fleet()).length >= 2);
      const during = readdirSync(fleet()).filter((name) => name !== "mac.html");
      expect(during).toHaveLength(1);
      expect(during[0]).toMatch(/^\.desk\./);
      expect(existsSync(join(fleet(), "desk.html"))).toBe(false);
      await proc.stdin.end();
      expect(await proc.exited).toBe(0);
      expect(readFileSync(join(fleet(), "desk.html"), "utf8")).toBe("new");
      expect(readdirSync(fleet()).toSorted()).toEqual(["desk.html", "mac.html"]);
    });

    test("only mac and desk are allowed", async () => {
      const names = ["", "index", "../mac", "mac.html"];
      const jobs: Promise<number>[] = [];
      for (const name of names) jobs.push(upload(name, "x"));
      const codes = await Promise.all(jobs);
      for (const [at, name] of names.entries()) expect(codes[at], name).toBe(1);
      expect(readdirSync(fleet())).toEqual(["mac.html"]);
    });
  });
}

function suite5(): void {
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
}

function suite6(): void {
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
      expect(lines.toSorted()).toEqual([...names, "a.example.com"].map((name) => `local-zone: "${name}." always_nxdomain`).toSorted());
      expect(readFileSync(join(work, "unbound.log"), "utf8")).toBe("reload\n");
    });

    test("a short list means a bad download, so the old list stays", async () => {
      expect(await update(names.slice(0, 100).map((name) => `0.0.0.0 ${name}`).join("\n"))).toBe(1);
      expect(readFileSync(join(etc(), "blocklist.conf"), "utf8")).toBe("old\n");
      expect(existsSync(join(work, "unbound.log"))).toBe(false);
    });
  });
}

function suite7(): void {
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
      fake("nohup", `kill -HUP $$; echo "nohup survived HUP" >> ${log()}; exec "$@"`);
      writeFileSync(join(etc(), "netstart"), `echo "netstart $*" >> ${log()}\n`);
    });

    test("a changed wg0 restarts as the last step of install.sh, in a job that ignores HUP and moves the new file in first", async () => {
      fake("ifconfig", `echo "ifconfig $*" >> ${log()}`);
      writeFileSync(join(etc(), "hostname.wg0.new"), "new");
      const ran = await run(["sh", "-c", from("if [ -e /etc/hostname.wg0.new ]; then")], { env: env() });
      expect(ran).toEqual({ code: 0, stdout: "wg0 restarts in 2 seconds. The VPN stops for some seconds.\n", stderr: "" });
      await waitFor(() => calls().some((call) => call.startsWith("netstart")));
      expect(calls()).toEqual([
        "nohup survived HUP",
        "sleep 2",
        `mv -f ${etc()}/hostname.wg0.new ${etc()}/hostname.wg0`,
        "ifconfig wg0 destroy",
        "netstart wg0",
      ]);
      expect(readFileSync(join(etc(), "hostname.wg0"), "utf8")).toBe("new");
    });

  });
}

function suite8(): void {
  describe("install.sh: the wg0 restart when the file is the same or wg0 does not run", () => {
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
      fake("sleep", `echo "sleep $*" >> ${log()}`);
      writeFileSync(join(etc(), "netstart"), `echo "netstart $*" >> ${log()}\n`);
      const mv = Bun.which("mv");
      if (mv === null) throw new Error("mv is not in PATH");
      fake("mv", `echo "mv $*" >> ${log()}; exec ${mv} "$@"`);
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
}

suite1();
suite2();
suite3();
suite4();
suite5();
suite6();
suite7();
suite8();
