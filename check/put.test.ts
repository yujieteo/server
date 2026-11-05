import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLocalConf } from "./conf.ts";
import { REPO_ROOT, trackedFiles } from "./lib.ts";
import { type PutInput, type PutOutput, captureInput, putCallsOf, runPut } from "./put.ts";

const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
const installScript = readFileSync(join(REPO_ROOT, "install.sh"), "utf8");

async function installedTemplates(): Promise<readonly PutInput[]> {
  const named: { readonly name: string; readonly mode: string | null }[] = [];
  for (const call of putCallsOf(installScript)) named.push({ name: call.source, mode: call.mode });
  for (const path of await trackedFiles()) if (path.startsWith("bin/")) named.push({ name: path, mode: "755" });
  const inputs: PutInput[] = [];
  for (const { name, mode } of named) {
    inputs.push({ name, template: readFileSync(join(REPO_ROOT, name), "utf8"), mode, knownIps: conf.KNOWN_IPS, fhToken: conf.FH_TOKEN });
  }
  return inputs;
}

function putRoundTrip(): void {
  describe("put: install.sh puts the private values in a repo file", () => {
    test("each installed file has no placeholder left, and the values are in", async () => {
      const inputs = await installedTemplates();
      for (const input of inputs) captureInput(input);
      const jobs: Promise<PutOutput>[] = [];
      for (const input of inputs) jobs.push(runPut(REPO_ROOT, input));
      const outputs = await Promise.all(jobs);
      for (const [at, input] of inputs.entries()) {
        const output = outputs[at];
        if (output === undefined) throw new Error("an input has an output");
        expect(output.exit).toBe(0);
        expect(output.content, input.name).not.toMatch(/@(KNOWN_IPS|FH_TOKEN)@/);
        expect(output.mode, input.name).toBe(input.mode ?? "644");
        expect(output.content).toBe(
          input.template.replaceAll("@KNOWN_IPS@", conf.KNOWN_IPS).replaceAll("@FH_TOKEN@", conf.FH_TOKEN),
        );
      }
    });

    test("each installed file that holds the token of femahoy has mode 600, and relayd.conf sends it", async () => {
      const token = "abc_DEF-123";
      const holders = new Map<string, string>();
      const inputs = await installedTemplates();
      const jobs: Promise<PutOutput>[] = [];
      for (const input of inputs) jobs.push(runPut(REPO_ROOT, { ...input, fhToken: token }));
      const outputs = await Promise.all(jobs);
      for (const [at, input] of inputs.entries()) {
        const output = outputs[at];
        if (output === undefined) throw new Error("an input has an output");
        if (!output.content.includes(token)) continue;
        holders.set(input.name, output.content);
        expect(output.mode, input.name).toBe("600");
      }
      expect([...holders.keys()]).toEqual(["etc/relayd.conf"]);
      expect(holders.get("etc/relayd.conf")).toContain(`value "Bearer ${token}"`);
    });
  });
}

function putRefusals(): void {
  describe("put: values that sed would read as syntax", () => {
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
      const bads = ["a#b", "a&b", "a\\b"];
      const first: Promise<PutOutput>[] = [];
      const second: Promise<PutOutput>[] = [];
      for (const bad of bads) {
        first.push(runPut(REPO_ROOT, { name: "t", template: "@KNOWN_IPS@\n", mode: null, knownIps: bad, fhToken: "x" }));
        second.push(runPut(REPO_ROOT, { name: "t", template: "@FH_TOKEN@\n", mode: null, knownIps: "x", fhToken: bad }));
      }
      const outputs = await Promise.all(first);
      const others = await Promise.all(second);
      for (const [at, bad] of bads.entries()) {
        expect(outputs[at]?.exit, bad).not.toBe(0);
        expect(others[at]?.exit, bad).not.toBe(0);
      }
    });
  });
}

putRoundTrip();
putRefusals();
