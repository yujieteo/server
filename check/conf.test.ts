import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONF_KEYS, parseLocalConf } from "./conf.ts";
import { REPO_ROOT } from "./lib.ts";

describe("local.conf.example parses into the typed LocalConf", () => {
  const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
  test("each key has a value", () => {
    for (const key of CONF_KEYS) expect(conf[key], key).not.toBe("");
  });
  test("a quoted value can hold more than one line", () => {
    expect(conf.ADMIN_KEY.split("\n")).toHaveLength(2);
    expect(conf.TUNNEL_KEY.split("\n")).toHaveLength(2);
  });
  test("a missing key is an error", () => {
    expect(() => parseLocalConf("ADMIN_USER=a\n")).toThrow("missing");
  });
  test("an unknown key is an error", () => {
    expect(() => parseLocalConf("NOPE=a\n")).toThrow("unknown key");
  });
});
