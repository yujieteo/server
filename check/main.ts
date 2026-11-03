import { pageBudgets } from "./budget.ts";
import { cAnalyze, cSanitizers, cWarnings } from "./c.ts";
import { noComments } from "./comments.ts";
import { configSyntax } from "./configs.ts";
import { facts } from "./facts.ts";
import { type Step } from "./lib.ts";
import { replay } from "./replay.ts";
import { bunTests, deadCode, inlineScripts, shellcheck, typeCheck } from "./tools.ts";

const STEPS: readonly Step[] = [
  { name: "types: tsc strict on check/", run: typeCheck },
  { name: "types: tsc strict on the inline scripts of the pages", run: inlineScripts },
  { name: "dead code: knip", run: deadCode },
  { name: "comments: none outside the excluded files", run: noComments },
  { name: "shell: shellcheck", run: shellcheck },
  { name: "configs: syntax of the OpenBSD configs", run: configSyntax },
  { name: "configs: facts that the configs and scripts must keep", run: facts },
  { name: "web pages: gzip budget", run: pageBudgets },
  { name: "C: strict warnings in the C of this repo", run: cWarnings },
  { name: "C: clang static analysis", run: cAnalyze },
  { name: "C: sanitizer build and smoke run", run: cSanitizers },
  { name: "tests: bun test", run: bunTests },
];

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (command === "replay") {
    const baseAt = rest.indexOf("--base");
    return replay({ base: baseAt === -1 ? null : (rest[baseAt + 1] ?? null), accept: rest.includes("--accept") });
  }
  if (command !== undefined) {
    console.log("usage: bun check/main.ts [replay [--base REV] [--accept]]");
    return 2;
  }
  const results = await Promise.all(
    STEPS.map(async (step) => {
      const findings = await step.run().catch((error: unknown) => [{ file: step.name, line: 0, message: String(error) }]);
      return { step, findings };
    }),
  );
  let failed = 0;
  for (const { step, findings } of results) {
    console.log(`${findings.length === 0 ? "ok  " : "FAIL"} ${step.name}`);
    for (const finding of findings) console.log(`       ${finding.file}:${finding.line}: ${finding.message}`);
    if (findings.length > 0) failed += 1;
  }
  console.log(failed === 0 ? "all checks passed" : `${failed} checks failed`);
  return failed === 0 ? 0 : 1;
}

process.exit(await main(process.argv.slice(2)));
