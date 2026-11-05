import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assert, type Finding, REPO_ROOT, trackedFiles } from "./lib.ts";

const KILOBYTE = 1024;
const DEFAULT_BUDGET_BYTES = 10 * KILOBYTE;

function gzipSize(page: string): number {
  const bytes = readFileSync(join(REPO_ROOT, page));
  assert(bytes.length > 0, "a page has content");
  const size = Bun.gzipSync(new Uint8Array(bytes)).length;
  assert(size > 0, "gzip of a page is not empty");
  return size;
}

function budgetFinding(page: string, total: number): readonly Finding[] {
  assert(page.endsWith(".html"), "only pages have a budget");
  assert(total >= 0, "a size is not negative");
  if (total <= DEFAULT_BUDGET_BYTES) return [];
  return [{ file: page, line: 0, message: `${total} bytes gzipped, the budget is ${DEFAULT_BUDGET_BYTES}` }];
}

export async function pageBudgets(): Promise<readonly Finding[]> {
  const findings: Finding[] = [];
  const tracked = await trackedFiles();
  assert(tracked.length > 0, "the repo tracks files");
  assert(REPO_ROOT !== "", "the repo root is known");
  assert(findings.length === 0, "no finding before the first page");
  for (const page of tracked) {
    if (!page.endsWith(".html")) continue;
    const total = gzipSize(page);
    console.log(`  budget ${page}: ${total} of ${DEFAULT_BUDGET_BYTES} bytes gzipped`);
    findings.push(...budgetFinding(page, total));
  }
  assert(findings.length <= tracked.length, "at most one finding for each page");
  return findings;
}
