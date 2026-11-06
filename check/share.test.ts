import { expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT, run } from "./lib.ts";

test("share keeps newlines and shell metacharacters out of the remote command", async () => {
  const work = mkdtempSync(join(tmpdir(), "share-"));
  try {
    const bin = join(work, "bin");
    const log = join(work, "ssh-args");
    mkdirSync(bin);
    copyFileSync(join(REPO_ROOT, "share"), join(work, "share"));
    writeFileSync(join(work, "local.conf"), "ADMIN_USER=admin\n");
    writeFileSync(join(bin, "ssh"), '#!/bin/sh\nprintf "%s" "$2" > "$SSH_LOG"\ncat >/dev/null\n');
    chmodSync(join(bin, "ssh"), 0o755);
    const file = join(work, "file\nid\n\$(evil).txt");
    writeFileSync(file, "test");
    const ran = await run(["sh", join(work, "share"), file], {
      env: { PATH: `${bin}:${process.env["PATH"] ?? ""}`, SSH_LOG: log },
    });
    expect(ran.code).toBe(0);
    const command = readFileSync(log, "utf8");
    expect(command).not.toContain("\n");
    expect(command).toMatch(/\/file_id___evil_.txt$/);
    expect(ran.stdout).toMatch(/\/file_id___evil_.txt\n$/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
