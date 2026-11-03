import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Finding, REPO_ROOT, trackedFiles } from "./lib.ts";

const KILOBYTE = 1024;
const DEFAULT_BUDGET_BYTES = 10 * KILOBYTE;

const ROUTE_BUDGET_BYTES: Readonly<Record<string, number>> = {
  "fleet/index.html": 10 * KILOBYTE,
  "www/errdocs/err.html": 10 * KILOBYTE,
};

function gzipSize(bytes: Uint8Array): number {
  return Bun.gzipSync(new Uint8Array(bytes)).length;
}

function budgetOf(page: string): number {
  return ROUTE_BUDGET_BYTES[page] ?? DEFAULT_BUDGET_BYTES;
}

export async function pageBudgets(): Promise<readonly Finding[]> {
  const findings: Finding[] = [];
  for (const page of (await trackedFiles()).filter((path) => path.endsWith(".html"))) {
    const total = gzipSize(readFileSync(join(REPO_ROOT, page)));
    const budget = budgetOf(page);
    console.log(`  budget ${page}: ${total} of ${budget} bytes gzipped`);
    if (total > budget) findings.push({ file: page, line: 0, message: `${total} bytes gzipped, the budget is ${budget}` });
  }
  return findings;
}
