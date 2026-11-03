import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONF_KEYS, CONF_KEY_NAMES, type LocalConf, parseLocalConf } from "./conf.ts";
import { REPO_ROOT } from "./lib.ts";

function textOf(conf: LocalConf): string {
  return CONF_KEY_NAMES.map((key) => `${key}='${conf[key]}'`).join("\n\n");
}

describe("local.conf.example parses into the typed LocalConf", () => {
  const conf = parseLocalConf(readFileSync(join(REPO_ROOT, "local.conf.example"), "utf8"));
  test("each key has a value in the format of the table", () => {
    for (const key of CONF_KEY_NAMES) expect(conf[key], `${key}: ${CONF_KEYS[key].format}`).toMatch(CONF_KEYS[key].valid);
  });
  test("a quoted value can hold more than one line", () => {
    expect(conf.ADMIN_KEY.split("\n")).toHaveLength(2);
    expect(conf.TUNNEL_KEY.split("\n")).toHaveLength(2);
  });
  test("each key of the table goes through the parser unchanged", () => {
    expect(parseLocalConf(textOf(conf))).toEqual(conf);
  });
  test("a value that is not in the format of its key is an error", () => {
    for (const key of CONF_KEY_NAMES) {
      expect(() => parseLocalConf(textOf({ ...conf, [key]: "x y;z" })), key).toThrow(`${key} is not ${CONF_KEYS[key].format}`);
    }
  });
  test("a second line in DEPLOY_KEY is an error, because install.sh writes 1 authorized_keys line for it", () => {
    expect(() => parseLocalConf(textOf({ ...conf, DEPLOY_KEY: `${conf.DEPLOY_KEY}\n${conf.DEPLOY_KEY}` }))).toThrow("DEPLOY_KEY");
  });
  test("a missing key is an error", () => {
    expect(() => parseLocalConf("ADMIN_USER=a\n")).toThrow("missing");
  });
  test("an unknown key is an error", () => {
    expect(() => parseLocalConf("NOPE=a\n")).toThrow("unknown key");
  });
});
