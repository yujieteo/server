export const CONF_KEYS = [
  "ADMIN_USER",
  "ADMIN_KEY",
  "DEPLOY_KEY",
  "FORWARD_TO",
  "ALIASES",
  "WG_PEERS",
  "KNOWN_IPS",
  "TUNNEL_KEY",
  "FH_TOKEN",
] as const;

type ConfKey = (typeof CONF_KEYS)[number];
export type LocalConf = Readonly<Record<ConfKey, string>>;

function isConfKey(name: string): name is ConfKey {
  return (CONF_KEYS as readonly string[]).includes(name);
}

export function parseLocalConf(text: string): LocalConf {
  const found = new Map<ConfKey, string>();
  const lines = text.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    index += 1;
    if (line.trim() === "" || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    const name = line.slice(0, equals);
    if (equals < 1 || !isConfKey(name)) throw new Error(`local.conf line ${index}: unknown key in "${line}"`);
    let rest = line.slice(equals + 1);
    if (rest.startsWith("'")) {
      let value = rest.slice(1);
      while (!value.endsWith("'")) {
        const next = lines[index];
        if (next === undefined) throw new Error(`local.conf: the quote of ${name} is not closed`);
        index += 1;
        value += `\n${next}`;
      }
      rest = value.slice(0, -1);
    }
    found.set(name, rest);
  }
  const missing = CONF_KEYS.filter((key) => !found.has(key));
  if (missing.length > 0) throw new Error(`local.conf: missing ${missing.join(", ")}`);
  const get = (key: ConfKey): string => found.get(key) ?? "";
  return {
    ADMIN_USER: get("ADMIN_USER"),
    ADMIN_KEY: get("ADMIN_KEY"),
    DEPLOY_KEY: get("DEPLOY_KEY"),
    FORWARD_TO: get("FORWARD_TO"),
    ALIASES: get("ALIASES"),
    WG_PEERS: get("WG_PEERS"),
    KNOWN_IPS: get("KNOWN_IPS"),
    TUNNEL_KEY: get("TUNNEL_KEY"),
    FH_TOKEN: get("FH_TOKEN"),
  };
}
