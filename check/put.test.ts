import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLocalConf } from "./conf.ts";
import { REPO_ROOT, trackedFiles } from "./lib.ts";
import { type PutInput, captureInput, putCallsOf, runPut } from "./put.ts";

const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
const installScript = readFileSync(join(REPO_ROOT, "install.sh"), "utf8");

async function installedTemplates(): Promise<readonly PutInput[]> {
  const sources = putCallsOf(installScript).map((call) => ({ name: call.source, mode: call.mode }));
  const bins = (await trackedFiles()).filter((path) => path.startsWith("bin/")).map((name) => ({ name, mode: "755" }));
  return [...sources, ...bins].map(({ name, mode }) => ({
    name,
    template: readFileSync(join(REPO_ROOT, name), "utf8"),
    mode,
    knownIps: conf.KNOWN_IPS,
    fhToken: conf.FH_TOKEN,
  }));
}

describe("put: install.sh puts the private values in a repo file", () => {
  test("each installed file has no placeholder left, and the values are in", async () => {
    const inputs = await installedTemplates();
    for (const input of inputs) captureInput(input);
    for (const input of inputs) {
      const output = await runPut(REPO_ROOT, input);
      expect(output.exit).toBe(0);
      expect(output.content, input.name).not.toMatch(/@(KNOWN_IPS|FH_TOKEN)@/);
      expect(output.mode, input.name).toBe(input.mode ?? "644");
      expect(output.content).toBe(
        input.template.replaceAll("@KNOWN_IPS@", conf.KNOWN_IPS).replaceAll("@FH_TOKEN@", conf.FH_TOKEN),
      );
    }
  });

  test("relayd.conf has the token and mode 600, because the token is a secret", async () => {
    const relayd = (await installedTemplates()).find((input) => input.name === "etc/relayd.conf");
    if (relayd === undefined) throw new Error("install.sh does not put etc/relayd.conf");
    expect(relayd.mode).toBe("600");
    const output = await runPut(REPO_ROOT, { ...relayd, fhToken: "abc_DEF-123" });
    expect(output.content).toContain('value "Bearer abc_DEF-123"');
  });

  const safe = fc.stringMatching(/^[A-Za-z0-9_.|*-]{0,24}$/);
  test("a value without #, & and \\ goes in as it is (property)", async () => {
    await fc.assert(
      fc.asyncProperty(safe, safe, async (knownIps, fhToken) => {
        const template = "a @KNOWN_IPS@ b\n@FH_TOKEN@ @FH_TOKEN@\n";
        const output = await runPut(REPO_ROOT, { name: "t", template, mode: null, knownIps, fhToken });
        return output.exit === 0 && output.content === `a ${knownIps} b\n${fhToken} ${fhToken}\n`;
      }),
      { numRuns: 40 },
    );
  });

  test("put-sed-delimiter: a value with #, & or \\ is refused, because sed would write other text", async () => {
    for (const bad of ["a#b", "a&b", "a\\b"]) {
      const output = await runPut(REPO_ROOT, { name: "t", template: "@KNOWN_IPS@\n", mode: null, knownIps: bad, fhToken: "x" });
      expect(output.exit, bad).not.toBe(0);
      const other = await runPut(REPO_ROOT, { name: "t", template: "@FH_TOKEN@\n", mode: null, knownIps: "x", fhToken: bad });
      expect(other.exit, bad).not.toBe(0);
    }
  });
});
