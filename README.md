# teoyujie.org server

Configuration for the teoyujie.org server: OpenBSD 8.0. The config needs the base system and one package, `opensmtpd-filter-dkimsign`.

It does four things:

- Serves the website and temporary file links with httpd.
- Forwards mail for teoyujie.org with smtpd, and signs mail that starts on the server with DKIM.
- Runs a WireGuard VPN, which is the only way to reach SSH.
- Blocks ads and trackers for VPN clients with unbound.

This repo is public and holds no secrets. The server generates its own TLS, ACME, SRS, DKIM and WireGuard keys, and they never leave it. Your personal settings live in `local.conf`, which git ignores.

## Files

| Path | Runs on | Purpose |
|---|---|---|
| `apply` | Mac or desktop | Sends the config to the server, then previews or installs it. |
| `pack` | Mac or desktop | Builds the bundle that `apply` sends. |
| `install.sh` | Server, as root | Turns a fresh OpenBSD install into this server. Safe to run again. |
| `test.sh` | Server, as root | Tests the running services. |
| `wg-config`, `wg-preflight` | Server | Generate the WireGuard config, and stop an install that would change it. |
| `share` | Mac | `./share [--days N] FILE` uploads a file and prints a link that lasts N days (default 30). `--list` shows the live links and `--rm LINK` deletes one. |
| `mail-alias` | Mac | `./mail-alias add NAME` or `del NAME` edits the mail aliases in `local.conf`. |
| `local.conf.example` | | Template for `local.conf`, filled with test values. |
| `etc/` | | Configs for httpd, smtpd, acme-client, pf, sshd, unbound, doas, sysctl and cron. |
| `sbin/` | Server | Scheduled jobs and the forced command of the `deploy` user. |
| `www/` | | Public files: `security.txt`, the GPG key and WKD, the MTA-STS policy, the error page. |
| `ROLLBACK.md` | | The checkpoint and recovery plan for live installs. |
| `LICENSE` | | The MIT License for this repository. |

## Change the live server

Run these from the Mac or desktop with the VPN on.

Preview the change. This writes nothing to the installed system:

```sh
./apply --check ADMIN_USER@10.8.0.1
```

Read the file diffs and service actions, and keep the output private because it can show mail and key settings.

Then make a full disk checkpoint by following [ROLLBACK.md](ROLLBACK.md), and install with the checkpoint id:

```sh
./apply --install CHECKPOINT_ID ADMIN_USER@10.8.0.1
```

The script records the id but cannot confirm the checkpoint exists.

A live install stops if the WireGuard config would change, `wg0` is down, or a WireGuard change is pending. It reloads the firewall and restarts the core services, so expect a short interruption. It does not fetch certificates or the blocklist, which cron does, and it does not deploy the site.

To test the result, copy the source and `local.conf` to a private folder on the server and run `sh test.sh` there as root. Do not pass it a deploy key on a live server, because that replaces the site with test pages.

## Rebuild from zero

1. At Vultr, deploy OpenBSD 8.0 (plan vc2-1c-1gb, Singapore) with the Mac's SSH key and the hostname `teoyujie.org`. Set reverse DNS for the IPv4 and IPv6 addresses to `teoyujie.org`.
2. Run `cp local.conf.example local.conf` and fill in the real values. Create the Mac and iPhone tunnels in the WireGuard app first, so you can add their public keys to `WG_PEERS`. After the next step, SSH only works through the VPN.
3. Run `./apply --bootstrap root@NEW_IPV4`. It asks you to set the admin's doas password, prints the server's WireGuard public key, and turns off root login.
4. Add that key to the WireGuard clients, turn on the tunnel, and test `ssh ADMIN_USER@10.8.0.1`. If the VPN fails, log in as the admin in the Vultr web console.
5. Create the DNS records below in Gandi LiveDNS.
6. Once `dig +short teoyujie.org` shows the new address, get the real certificate:

   ```sh
   ssh -t ADMIN_USER@10.8.0.1 'doas acme-client -v teoyujie.org && doas rcctl reload httpd && doas rcctl restart smtpd'
   ```

7. Deploy the site by running `scripts/deploy.sh` in the site repo with the VPN on.
8. Run `test.sh` on the server as described above.

## DNS records

| Name | Type | Value |
|---|---|---|
| `@` | A | Server IPv4 |
| `@` | AAAA | Server IPv6 |
| `@` | MX | `10 teoyujie.org.` |
| `@` | TXT | `"v=spf1 mx -all"` |
| `_dmarc` | TXT | `"v=DMARC1; p=reject"` |
| `2026._domainkey` | TXT | `"v=DKIM1; k=rsa; p=PUBLIC_KEY"` |
| `www` | CNAME | `teoyujie.org.` |
| `mta-sts` | CNAME | `teoyujie.org.` |
| `_mta-sts` | TXT | `"v=STSv1; id=20261101"` |
| `_smtp._tls` | TXT | `"v=TLSRPTv1; rua=mailto:contact@teoyujie.org"` |
| `@` | CAA | `0 issue "letsencrypt.org"` |
| `@` | CAA | `0 issuewild ";"` |
| `@` | CAA | `0 iodef "mailto:contact@teoyujie.org"` |

Do not add a wildcard record, because it breaks GnuPG key lookup through WKD. If you change `www/.well-known/mta-sts.txt`, also change the `id` in `_mta-sts`.

A new server makes a new DKIM key. To print `PUBLIC_KEY`, run this on the server:

```sh
doas openssl pkey -in /etc/mail/dkim/teoyujie.org.2026.rsa.key -pubout -outform DER | openssl base64 -A
```

smtpd refuses connections from hosts with no reverse DNS, so less spam gets forwarded from this server's address.

## WireGuard clients

In the WireGuard app, add an empty tunnel. The app generates the private key and shows the public key, which goes in `WG_PEERS` in `local.conf`.

```text
[Interface]
PrivateKey = (generated by the app)
Address = 10.8.0.2/32
DNS = 10.8.0.1

[Peer]
PublicKey = (printed by install.sh)
Endpoint = teoyujie.org:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

The iPhone uses `Address = 10.8.0.3/32`. Only traffic to 10.8.0.0/24 goes through the VPN, but all DNS goes to the server. Turn on "On Demand" on both devices.

`apply` never changes WireGuard peers on a live server. To add one, open the Vultr web console, copy the source to the server, add the key to its `local.conf`, and run `sh install.sh` as root.

## Site deploys

The website comes from the [site repo](https://github.com/yujieteo/site). Its `scripts/deploy.sh` builds the site and sends a tarball over SSH to the `deploy` user, so a commit there changes nothing until you run that script. The `deploy` user can only run `sbin/deploy-only`, which accepts only `site` and swaps in the new folder by renaming it.

`deploy-only` also writes a `.gz` copy of each text file over 1 KB. httpd sends that copy to browsers that accept gzip. `feed-update` does the same for `/feed.xml`, `/reading.html`, `/forecasters.html` and `/forecasters.xml`.

After the swap, `deploy-only` runs `sbin/link-check`, which prints any link between the site's own pages that leads to no file. It only reports, so the deploy still goes ahead. If you add a `location` to `httpd.conf` that serves a file from outside the site folder, add its path to the list at the top of that script.

## Limits on visitors

- httpd tells browsers to load scripts, styles, fonts and images only from this site. `/reading.html` and `/forecasters.html` show text from other sites, so they may run no script at all. If a page needs another host, add it to the `Content-Security-Policy` line in `etc/httpd.conf`.
- pf puts a host in the `flood` table when it opens more than 100 web connections in 10 seconds or 30 mail connections in a minute, and blocks its TCP for a day. To let one out now, run `doas pfctl -t flood -T delete ADDRESS`.
- sshd gives the `deploy` user only `deploy-only`, whatever its key file says.

## Scheduled jobs

Root's crontab comes from `etc/crontab`:

| When | Job |
|---|---|
| Daily | Install OpenBSD patches, and reboot if any were applied. |
| Daily | `health-check` reports problems with disk, services, the firewall, the VPN, patches, certificates, domain expiry, DNS, the DKIM record, mail stuck in the queue, Spamhaus listing, unknown certificates, stale or missing feeds and an OpenBSD release that needs upgrading. |
| Hourly | Renew the TLS certificate if needed. |
| Daily | Delete shared links that have reached their end date. |
| Weekly | Refresh the DNS blocklist. |
| Hourly | Let hosts out of the firewall's `flood` table after a day. |
| Hourly | `feed-update` rebuilds `/feed.xml`, `/reading.html`, `/forecasters.html` and `/forecasters.xml` from public RSS feeds. They live outside the site folder, so deploys do not remove them. If a source fails, its last good copy is used. |
| Hourly | `edmw-update` records reply counts from HardwareZone's EDMW forum. Once a day it writes the busiest threads and most-reacted comments to `/edmw.xml`, which `feed-update` includes. Its first output comes about a day after install. To stop bad words getting through, edit the list at the top of the script. |

Separately, `sbin/ssh-alert` mails root about any SSH login from an address outside `KNOWN_IPS`.

## Versions

Tags named `vYYYY.MM.DD` mark the state of `main` on that date. They do not show the live version. Each tag applies to the OpenBSD release named at the top of this file at that tag.

## Upgrade OpenBSD

There is a new release every six months. `health-check` reminds you each Monday once a new release is out, and daily once this one has stopped getting patches.

1. Run `ssh -t ADMIN_USER@10.8.0.1 doas sysupgrade`. It takes about 10 minutes.
2. Follow [Change the live server](#change-the-live-server). This rewrites any configs that sysmerge left alone.
3. Change `8.0` in this file to the new release.
