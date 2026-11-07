# teoyujie.org server

The config of the teoyujie.org server. It is an OpenBSD 8.0 base system with no packages.

It serves the site and the app pages, forwards mail, and is a VPN with an ad blocker.

This repo is public and has no secret. The server makes its own secrets. They are the TLS key, the ACME account key, the SRS key and the WireGuard key. They never leave it. `local.conf` has the private values. Git ignores it. No value in it gives access to the server.

`VISION.md` says what this project is for. `REQUIREMENTS.md` lists what the server must do. Each line has an id and the evals that prove it.

## Files

| File | Use |
|---|---|
| `install.sh` | Runs on the server as root. Makes a fresh OpenBSD 8.0 server into teoyujie.org. Safe to run again. |
| `test.sh` | Runs on the server as root after `install.sh`. Tests the services. |
| `apply` | Runs on the Mac. Copies this repo and `local.conf` to the server, then runs `install.sh`. |
| `private-setup` | Runs on the Mac. Sets up the tunnel keys of the private names (below). |
| `mail-alias` | Runs on the Mac. `./mail-alias add NAME` or `./mail-alias del NAME`. |
| `share` | Runs on the Mac. `./share FILE` prints a link to FILE that works for 30 days. |
| `local.conf.example` | The private values, with test values. CI uses it. |
| `etc/` | The configs: httpd, relayd, acme-client, smtpd, pf, sshd, unbound, doas, sysctl and crontab. |
| `sbin/` | The jobs: health-check, ssh-alert, blocklist-update and private-cert. deploy-only is the forced command of the deploy user. tunnel-wait is the login shell of the tunnel user. |
| `www/` | Files on the web: security.txt, the GPG key with WKD, the MTA-STS policy, and the error page. |
| `gate`, `rules.conf`, `bin/` | The local check. Run `nix develop`, then `./gate`. |
| `EXPIRY` | The date this project ends unless you renew it. |
| `evals/` | The evals of `REQUIREMENTS.md`: the config replay against `evals/golden`, the checks of the OpenBSD VM, and the benchmark baselines. `sh evals/trace.sh` checks that each id has an eval. |
| `.githooks/pre-commit`, `.gitleaks.toml` | gitleaks stops a commit that has a secret in it. Turn on the hook once in each clone: `git config core.hooksPath .githooks`. |
| `.github/workflows/ci.yml` | gitleaks and the gate on the desktop runner. `install.sh` twice, then `test.sh` and `evals/vm.sh`, on a fresh OpenBSD 8.0 VM. |

## Check a change

1. Run `nix develop`.
2. Run `./gate`.

The gate runs the rules, the markdown grade, shellcheck, the evals and the benchmark check. The configs of `install.sh` must equal `evals/golden` byte for byte. A change to a config needs a change to its golden file, and the reason in `REQUIREMENTS.md`.

The VM evals need OpenBSD. CI runs them on a fresh OpenBSD 8.0 VM. The desktop runner cannot start that VM, so this job runs on a GitHub runner.

## Rebuild from zero

1. At Vultr, deploy "OpenBSD 8.0" (plan vc2-1c-1gb, Singapore) with the SSH key of the Mac and the hostname `teoyujie.org`. Set the reverse DNS of the IPv4 and the IPv6 address to `teoyujie.org`.
2. On the Mac, run `cp local.conf.example local.conf`, then put in the real values. Before the first apply, make the tunnels of the Mac and the iPhone in the WireGuard app (below). Put their public keys in `WG_PEERS`. After the first apply, SSH works only through the VPN.
3. Run `./apply root@NEW_IPV4`. It asks for the doas password of the admin and prints the WireGuard public key of the server. After this run, root cannot log in with SSH.
4. Put that key in the WireGuard configs of the Mac and the iPhone (below). Turn on the tunnel, then test: `ssh ADMIN_USER@10.8.0.1`. If the VPN breaks, log in as ADMIN_USER with the doas password in the Vultr web console.
5. In Gandi LiveDNS, set the records of the next section.
6. When `dig +short teoyujie.org` shows the new address, run `ssh -t ADMIN_USER@10.8.0.1 'doas acme-client -v teoyujie.org && doas rcctl reload httpd && doas rcctl restart smtpd'`.
7. Deploy the site from the Mac with `scripts/deploy.sh` of the site repo. The server does not fetch the site by itself.
8. Test on the server: `ssh -t ADMIN_USER@10.8.0.1 doas sh server/test.sh`.

After a change to this repo, run `./apply ADMIN_USER@10.8.0.1`.

## DNS records

| Name | Type | Value |
|---|---|---|
| `@` | A | the IPv4 address of the server |
| `@` | AAAA | the IPv6 address of the server |
| `@` | MX | `10 teoyujie.org.` |
| `@` | TXT | `"v=spf1 mx -all"` |
| `_dmarc` | TXT | `"v=DMARC1; p=reject"` |
| `www` | CNAME | `teoyujie.org.` |
| `mta-sts` | CNAME | `teoyujie.org.` |
| `_mta-sts` | TXT | `"v=STSv1; id=20261101"` |
| `_smtp._tls` | TXT | `"v=TLSRPTv1; rua=mailto:contact@teoyujie.org"` |
| `@` | CAA | `0 issue "letsencrypt.org"` |
| `@` | CAA | `0 issuewild ";"` |
| `@` | CAA | `0 iodef "mailto:contact@teoyujie.org"` |
| `mac.lavish` | A | the IPv4 address of the server |
| `desk.lavish` | A | the IPv4 address of the server |

Make no other record. A wildcard record blocks GnuPG key lookup with WKD. If you change `www/.well-known/mta-sts.txt`, also change the `id` of `_mta-sts`. The records `fh` and `fleet` are no longer used. Delete them in Gandi.

## WireGuard clients

In the WireGuard app, add an empty tunnel. The app makes the private key and shows the public key. Put the public key in `WG_PEERS` in `local.conf`. For the first apply, that is all. To add a device later, run `./apply ADMIN_USER@10.8.0.1` from a device that is on the VPN. If no device is on the VPN, log in to the Vultr web console. Add the key to `local.conf` in the `server` folder of the last apply, then run its `install.sh` as root.

```text
[Interface]
PrivateKey = (the app makes it)
Address = 10.8.0.2/32
DNS = 10.8.0.1

[Peer]
PublicKey = (the server key that install.sh prints)
Endpoint = teoyujie.org:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

The iPhone uses `Address = 10.8.0.3/32`. Only traffic to 10.8.0.0/24 goes through the VPN. All DNS goes to the server, which blocks ads and trackers. Turn on "On Demand" on both devices.

## Site deploys

The Mac deploys the site with `scripts/deploy.sh` of the [site repo](https://github.com/yujieteo/site). It sends a tarball over SSH to the deploy user. The only command of that user is `sbin/deploy-only`. It takes `site` or `apps/NAME`, writes the files to a new folder, then renames it. Thus httpd always serves a complete site. The server does not fetch the site by itself.

## Private names of Lavish

On a device on the VPN, these names open the apps. No token is necessary.

| Name | App | Tunnel port on 10.8.0.1 |
|---|---|---|
| `https://mac.lavish.teoyujie.org` | Lavish on the Mac | 4387 |
| `https://desk.lavish.teoyujie.org` | Lavish on the desktop | 4388 |

Lavish uses paths from the root of the site, so each Lavish has its own name. Nobody without a WireGuard key gets to them.

- The Mac and the desktop open a reverse SSH tunnel to the server, as the user `tunnel`. The tunnel ports listen only on 10.8.0.1.
- The user `tunnel` can only open these 2 tunnels. It cannot run a command, get a terminal, or connect from the server to another address. It logs in with a key only, and only through the VPN.
- unbound gives the names to the VPN devices as 10.8.0.1. relayd on 10.8.0.1 port 443 sends each name to its tunnel. relayd gives 403 to a request with another `Origin`, or with `Sec-Fetch-Site: cross-site`. httpd on 10.8.0.1 port 80 sends the names to HTTPS.
- On the public addresses, httpd answers only the Let's Encrypt challenge for the names. `sbin/private-cert` gets their certificate.

To set it up:

1. In Gandi LiveDNS, add the records `mac.lavish` and `desk.lavish`. Let's Encrypt needs them to check the names.
2. On the Mac, with the VPN on, run `./private-setup ADMIN_USER@10.8.0.1`. It makes the tunnel keys and puts the public keys in `local.conf`. Then it runs `apply`.

## Upgrade to the next OpenBSD release (each 6 months)

1. Run `ssh -t ADMIN_USER@10.8.0.1 doas sysupgrade`. It takes about 10 minutes.
2. Run `./apply ADMIN_USER@10.8.0.1`. It writes the configs of this repo again.
3. Run `ssh -t ADMIN_USER@10.8.0.1 doas sh server/test.sh`.

After the upgrade, sysmerge mails root a list of the configs that it did not change. `apply` writes the repo version of each of them.

Change `8.0` in this file and in `.github/workflows/ci.yml` to the new release.
