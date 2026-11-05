import { pageBudgets } from "./budget.ts";
import { cAnalyze, cSanitizers, cWarnings } from "./c.ts";
import { noComments } from "./comments.ts";
import { configSyntax } from "./configs.ts";
import { facts } from "./facts.ts";
import { assert, type Finding, type Step } from "./lib.ts";
import { replay } from "./replay.ts";
import { bunTests, deadCode, inlineScripts, lint, power10, shellcheck, typeCheck } from "./tools.ts";

const STEPS: readonly Step[] = [
  { name: "types: tsc strict on check/", run: typeCheck },
  { name: "types: tsc strict on the inline scripts of the pages", run: inlineScripts },
  { name: "dead code: knip", run: deadCode },
  { name: "comments: none outside the excluded files", run: noComments },
  { name: "lint: oxlint, all categories, type-aware", run: lint },
  { name: "Power of 10: power10-check, every rule, no list of exceptions", run: power10 },
  { name: "shell: shellcheck", run: shellcheck },
  { name: "configs: syntax of the OpenBSD configs", run: configSyntax },
  { name: "configs: facts that the configs and scripts must keep", run: facts },
  { name: "web pages: gzip budget", run: pageBudgets },
  { name: "C: strict warnings in the C of this repo", run: cWarnings },
  { name: "C: clang static analysis", run: cAnalyze },
  { name: "C: sanitizer build and smoke run", run: cSanitizers },
  { name: "tests: bun test", run: bunTests },
];

interface Result {
  readonly step: Step;
  readonly findings: readonly Finding[];
}

async function runStep(step: Readonly<Step>): Promise<Result> {
  assert(step.name !== "", "a step has a name");
  assert(STEPS.includes(step), "a step is in the list");
  const findings = await step.run().catch((error: unknown) => {
    assert(error !== undefined, "a failure has a cause");
    assert(step.name !== "", "a step has a name");
    return [{ file: step.name, line: 0, message: error instanceof Error ? error.message : JSON.stringify(error) }];
  });
  return { step, findings };
}

function printResults(results: readonly Result[]): number {
  assert(results.length === STEPS.length, "each step has a result");
  assert(results.length > 0, "there are steps");
  let failed = 0;
  for (const { step, findings } of results) {
    console.log(`${findings.length === 0 ? "ok  " : "FAIL"} ${step.name}`);
    for (const finding of findings) console.log(`       ${finding.file}:${finding.line}: ${finding.message}`);
    if (findings.length > 0) failed += 1;
  }
  console.log(failed === 0 ? "all checks passed" : `${failed} checks failed`);
  return failed === 0 ? 0 : 1;
}

async function main(argv: readonly string[]): Promise<number> {
  assert(argv.length >= 0, "arguments are a list");
  assert(STEPS.length > 0, "there are steps");
  assert(process.exitCode === undefined, "no exit code is set yet");
  const [command, ...rest] = argv;
  if (command === "replay") {
    const baseAt = rest.indexOf("--base");
    return replay({ base: baseAt === -1 ? null : (rest[baseAt + 1] ?? null), accept: rest.includes("--accept") });
  }
  if (command !== undefined) {
    console.log("usage: bun check/main.ts [replay [--base REV] [--accept]]");
    return 2;
  }
  const running: Promise<Result>[] = [];
  for (const step of STEPS) running.push(runStep(step));
  return printResults(await Promise.all(running));
}

process.exitCode = await main(process.argv.slice(2));
