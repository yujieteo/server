interface ConfKeySpec {
  readonly meaning: string;
  readonly format: string;
  readonly valid: RegExp;
}

const SSH_KEY = String.raw`(?:ssh-ed25519|sk-ssh-ed25519@openssh\.com|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/]+={0,2}(?: [^\n]*)?`;
const SSH_KEYS = new RegExp(String.raw`^${SSH_KEY}(?:\n${SSH_KEY})*$`);
const WG_PEER = String.raw`[a-z0-9-]+:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:[A-Za-z0-9+/]{43}=`;
const KNOWN_IP_PATTERN = String.raw`[0-9a-fA-F.:*?[\]!-]+`;

export const CONF_KEYS = {
  ADMIN_USER: {
    meaning: "the login of the admin; it logs in with a key, only through the VPN, and uses doas with a password",
    format: "an OpenBSD user name",
    valid: /^[a-z_][a-z0-9_-]{0,30}$/,
  },
  ADMIN_KEY: {
    meaning: "the SSH public keys of the admin devices",
    format: "SSH public keys, 1 key on each line",
    valid: SSH_KEYS,
  },
  DEPLOY_KEY: {
    meaning: "the deploy login of the site and app repos; it can only replace a web folder with a tar archive",
    format: "1 SSH public key",
    valid: new RegExp(`^${SSH_KEY}$`),
  },
  FORWARD_TO: {
    meaning: "the mailbox of contact@teoyujie.org and of every alias",
    format: "an email address",
    valid: /^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/,
  },
  ALIASES: {
    meaning: "1 mail alias for each website; each one is NAME@teoyujie.org",
    format: "names, separated by spaces",
    valid: /^[a-z0-9-]+(?: [a-z0-9-]+)*$/,
  },
  WG_PEERS: {
    meaning: "the WireGuard devices",
    format: "name:address:public key, separated by spaces",
    valid: new RegExp(String.raw`^${WG_PEER}(?: ${WG_PEER})*$`),
  },
  KNOWN_IPS: {
    meaning: "the addresses whose SSH logins send no alert",
    format: "shell patterns, with | between them, and no #, & or backslash (put() refuses them)",
    valid: new RegExp(String.raw`^${KNOWN_IP_PATTERN}(?:\|${KNOWN_IP_PATTERN})*$`),
  },
  TUNNEL_KEY: {
    meaning: "the tunnel login of the Mac and the desktop; it can only open the tunnels on 10.8.0.1 port 4387, 4388 and 8790, and the same keys upload the pages of the fleet view as the user fleet",
    format: "SSH public keys, 1 key on each line",
    valid: SSH_KEYS,
  },
  FH_TOKEN: {
    meaning: "the token of fh serve on the desktop; relayd sends it to femahoy, so fh.teoyujie.org works with no token in the address",
    format: "a token of letters, digits, _, . and -",
    valid: /^[A-Za-z0-9_.-]+$/,
  },
} as const satisfies Readonly<Record<string, ConfKeySpec>>;

export type ConfKey = keyof typeof CONF_KEYS;
export type LocalConf = Readonly<Record<ConfKey, string>>;

export const CONF_KEY_NAMES = Object.keys(CONF_KEYS) as readonly ConfKey[];

function isConfKey(name: string): name is ConfKey {
  return Object.hasOwn(CONF_KEYS, name);
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
    if (!CONF_KEYS[name].valid.test(rest)) throw new Error(`local.conf: ${name} is not ${CONF_KEYS[name].format}`);
    found.set(name, rest);
  }
  const missing = CONF_KEY_NAMES.filter((key) => !found.has(key));
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
