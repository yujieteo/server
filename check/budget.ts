import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Finding, REPO_ROOT, trackedFiles } from "./lib.ts";

const KILOBYTE = 1024;
const DEFAULT_BUDGET_BYTES = 10 * KILOBYTE;

function gzipSize(bytes: Uint8Array): number {
  return Bun.gzipSync(new Uint8Array(bytes)).length;
}

export async function pageBudgets(): Promise<readonly Finding[]> {
  const findings: Finding[] = [];
  for (const page of (await trackedFiles()).filter((path) => path.endsWith(".html"))) {
    const total = gzipSize(readFileSync(join(REPO_ROOT, page)));
    console.log(`  budget ${page}: ${total} of ${DEFAULT_BUDGET_BYTES} bytes gzipped`);
    if (total > DEFAULT_BUDGET_BYTES) findings.push({ file: page, line: 0, message: `${total} bytes gzipped, the budget is ${DEFAULT_BUDGET_BYTES}` });
  }
  return findings;
}
