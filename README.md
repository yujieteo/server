# teoyujie.org server

Configuration for the teoyujie.org server: OpenBSD 8.0. The config needs the base system and one package, `opensmtpd-filter-dkimsign`.

It does four things:

- Serves the website and temporary file links with httpd.
- Forwards mail for teoyujie.org with smtpd, and signs mail that starts on the server or the VPN with DKIM.
- Runs a WireGuard VPN, which is the only way to reach SSH.
- Blocks ads, trackers and malware names for VPN clients with unbound.

This repo is public and holds no secrets. The server generates its own TLS, ACME, SRS, DKIM and WireGuard keys, and they never leave it. Your personal settings live in `local.conf`, which git ignores.

## Files

| Path | Runs on | Purpose |
|---|---|---|
| `apply` | Mac or desktop | Sends the source to the server, then checks, installs or tests it. |
| `install.sh` | Server, as root | Renders every managed file, shows how the live server differs, and copies what differs. A fresh OpenBSD install and a running server take the same path. |
| `test.sh` | Server, as root | Tests the running services. With `--outside` it runs on any other machine and tests what the internet and a VPN peer see. |
| `share` | Mac | `./share [--days N] FILE` uploads a file and prints a link that lasts N days (default 30). `--list` shows the live links and `--rm LINK` deletes one. |
| `local.conf.example` | | Template for `local.conf`, filled with test values. |
| `etc/` | | Configs for httpd, smtpd, acme-client, pf, sshd, unbound, doas, sysctl, cron and the public network interface. |
| `sbin/` | Server | Scheduled jobs, the Perl helpers they share (`feed-common.pl`) and the forced command of the `deploy` user. |
| `www/` | | Public files: `security.txt`, the GPG key and WKD, the MTA-STS policy. |
| `ROLLBACK.md` | | The checkpoint and recovery plan for live installs. |
| `LICENSE` | | The MIT License for this repository. |

## Change the live server

Run these from the Mac or desktop with the VPN on.

See what an install would change. This writes nothing to the installed system:

```sh
./apply --check ADMIN_USER@10.8.0.1
```

It prints a diff for each file that differs, `remove:` for a file the repo no longer has, `make:` for a user, folder or key that is missing, and `No drift.` when the server matches the repo. Keep the output private, because it can show mail and key settings.

Then make a full disk checkpoint by following [ROLLBACK.md](ROLLBACK.md), and install with the checkpoint id:

```sh
./apply --install CHECKPOINT_ID ADMIN_USER@10.8.0.1
```

The script records the id but cannot confirm the checkpoint exists. An install restarts only the services whose files changed. It stops before any change if the WireGuard peers would change, because that would cut its own session.

Test the result on the server, and from outside it:

```sh
./apply --test ADMIN_USER@10.8.0.1
sh test.sh --outside
```

Do not pass `test.sh` a deploy key on a live server, because that replaces the site with test pages.

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
8. Run both tests from [Change the live server](#change-the-live-server).

## What a rebuild loses

The repo and `local.conf` rebuild everything except this state. The plan column is a choice, not a fact: change it when the choice changes.

| State | Lives | Plan | After a rebuild |
|---|---|---|---|
| `local.conf` | The Mac only | Back up | Without it there is no rebuild. |
| WireGuard key of the server | `/etc/hostname.wg0` | Accept the loss | Put the new public key in each client. |
| DKIM key | `/etc/mail/dkim` | Accept the loss | Publish the new record from the DNS table. |
| TLS key and ACME account | `/etc/ssl/private`, `/etc/acme` | Accept the loss | Step 6 gets a new certificate. |
| SRS key | `/etc/mail/srs.conf` | Accept the loss | A bounce of mail forwarded before the rebuild cannot return. |
| SSH host keys | `/etc/ssh` | Accept the loss | Clients warn once: remove the old line from `known_hosts`. |
| Public addresses | Vultr | Rebuild | New A, AAAA and reverse DNS records. |
| Saved feed copies and the EDMW counts | `/var/www/feed` | Accept the loss | The jobs fetch again. EDMW needs a day of counts first. |
| Shared files | `/var/www/files/f` | Accept the loss | Their links stop working. |
| DNS allowlist | `/var/unbound/etc/allowlist` | Accept the loss | Add the names again. |
| Mail in the queue, and the logs | `/var/spool/smtpd`, `/var/log` | Accept the loss | |
| The site | The site repo | Rebuild | Step 7. |
| DNS zone, DNSSEC, the domain | Gandi | Outside the server | The table below lists the records. |

## DNS records

| Name | Type | Value |
|---|---|---|
| `@` | A | Server IPv4 |
| `@` | AAAA | Server IPv6 |
| `@` | MX | `10 teoyujie.org.` |
| `@` | TXT | `"v=spf1 mx -all"` |
| `_dmarc` | TXT | `"v=DMARC1; p=reject; rua=mailto:contact@teoyujie.org"` |
| `2026._domainkey` | TXT | `"v=DKIM1; k=rsa; p=PUBLIC_KEY"` |
| `www` | CNAME | `teoyujie.org.` |
| `mta-sts` | CNAME | `teoyujie.org.` |
| `_mta-sts` | TXT | `"v=STSv1; id=20261101"` |
| `_smtp._tls` | TXT | `"v=TLSRPTv1; rua=mailto:contact@teoyujie.org"` |
| `@` | CAA | `0 issue "letsencrypt.org"` |
| `@` | CAA | `0 issuewild ";"` |
| `@` | CAA | `0 iodef "mailto:contact@teoyujie.org"` |

Do not add a wildcard record, because it breaks GnuPG key lookup through WKD. If you change `www/.well-known/mta-sts.txt`, also change the `id` in `_mta-sts`.

The IPv6 address is the one the Vultr panel shows, made from the network card's MAC. `etc/hostname.vio0` makes OpenBSD use that address and no other.

The `2026` in the record name is the DKIM selector. It is set in `etc/smtpd.conf`. To rotate the key, change it there and here, install, and add the new record.

A new server makes a new DKIM key. To print `PUBLIC_KEY`, run this on the server:

```sh
doas openssl pkey -in /etc/mail/dkim/teoyujie.org.2026.rsa.key -pubout -outform DER | openssl base64 -A
```

smtpd refuses connections from hosts with no reverse DNS, so less spam gets forwarded from this server's address. It sends mail on only over TLS, to a host whose certificate checks out.

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

The iPhone uses `Address = 10.8.0.3/32`. Only traffic to 10.8.0.0/24 goes through the VPN, but all DNS goes to the server. The server forwards between clients, so one device can reach another, for example SSH from the phone to the Mac. Turn on "On Demand" on both devices.

To add a peer, add its key to `WG_PEERS` and run `./apply --check`. It stops, keeps its stage folder on the server, and prints the command to run in the Vultr web console. Only the console may change WireGuard.

## DNS for VPN clients

unbound resolves names itself, so no outside resolver sees the queries. It sends each name server only the part of the name that server needs, checks DNSSEC, and keeps no query log.

It answers "no such name" for about 240,000 ad, tracker and malware names, and for their subdomains. `blocklist-update` builds the list each day from two sources:

- [StevenBlack hosts](https://github.com/StevenBlack/hosts), kept by Steven Black.
- [HaGeZi Multi Pro](https://github.com/hagezi/dns-blocklists), kept by HaGeZi.

If a source fails or is too short, or unbound rejects the new list, the old list stays and cron mails the error.

To unblock a name, add it to `/var/unbound/etc/allowlist` on the server, one name on each line, then run `doas /usr/local/sbin/blocklist-update`. The name and its subdomains resolve again.

The list works for apps that use the system DNS. An app that carries its own encrypted DNS goes around it. Firefox can turn this on by itself, so unbound also answers "no such name" for `use-application-dns.net`, which tells Firefox to use the system DNS.

## Site deploys

The website comes from the [site repo](https://github.com/yujieteo/site). Its `scripts/deploy.sh` builds the site and sends a tarball over SSH to the `deploy` user, so a commit there changes nothing until you run that script. The `deploy` user can only run `sbin/deploy-only`, which accepts only `site` and swaps in the new folder by renaming it.

## Limits

- httpd tells browsers to load scripts, styles, fonts and images only from this site. `/reading.html`, `/forecasters.html` and `/singapore-policy-actionables.html` show text from other sites, so they may run no script at all. If a page needs another host, add it to the `Content-Security-Policy` line in `etc/httpd.conf`.
- pf puts a host in the `flood` table when it opens more than 100 web connections in 10 seconds or 30 mail connections in a minute, or holds more than 100 web or 20 mail connections open at once, and blocks its TCP for a day. To let one out now, run `doas pfctl -t flood -T delete ADDRESS`.
- pf logs every packet it blocks. To read the log, run `doas tcpdump -ner /var/log/pflog`.
- The users that handle text from outside open only what their job needs: `_feed` reaches HTTPS, `_smtpd` reaches mail servers, and `www`, `deploy` and `_dkimsign` reach nothing. None of them reaches a VPN peer.
- The feed jobs run as `_feed`, which can write only `/var/www/feed`. Each job fetches first. Then it gives up running programs, and only then reads what it fetched. The kernel kills a job that breaks this (`pledge` and `unveil` in `sbin/feed-common.pl`).
- sshd gives the `deploy` user only `deploy-only`, whatever its key file says.

## Scheduled jobs

The system crontab comes from `etc/crontab`. It names the user that runs each job.

| When | Job |
|---|---|
| Daily | Update the package, and restart smtpd if it changed. |
| Daily | Install OpenBSD patches, and reboot if any were applied. |
| Daily | `health-check` reports problems with disk, services, the firewall, outbound packets that pf blocked, the VPN, patches, certificates, domain expiry, DNS, the DKIM record, mail stuck in the queue, Spamhaus listing, unknown certificates, stale or missing feeds and an OpenBSD release that needs upgrading. |
| Hourly | Renew the TLS certificate if needed. |
| Daily | Delete shared links that have reached their end date. |
| Daily | `blocklist-update` rebuilds the DNS blocklist. |
| Hourly | Let hosts out of the firewall's `flood` table after a day. |
| Hourly | `feed-update` rebuilds `/feed.xml`, `/reading.html`, `/reading.txt`, `/forecasters.html`, `/forecasters.xml` and `/forecasters.txt` from public RSS feeds. It reads `notes/reading.txt` from the deployed site: each line moves one item in the reading feed and gives a sentence to show. They live outside the site folder, so deploys do not remove them. If a source fails, its last good copy is used. |
| Hourly | `edmw-update` records reply counts from HardwareZone's EDMW forum. Once a day it writes the busiest threads and most-reacted comments to `/edmw.xml`, which `feed-update` includes. Its first output comes about a day after install. To stop bad words getting through, edit the list at the top of the script. |
| Weekly | `sg-update` fetches Singapore government feeds and the Gazette on Saturday morning, Singapore time. It ranks the documents by the fixed rules at the top of the script and writes `/singapore-policy-actionables.html`, `/singapore-policy-actionables.xml` and `/singapore-policy-actionables.txt`. If a source fails, its last good copy is used. |
| Hourly | `sg-update --render` ranks the saved copies again when a deploy has brought a `notes/policy.txt` newer than the pages. Each line of that file adds or removes points for one document and gives a note to show. On the first run after install it fetches. |

Separately, `sbin/ssh-alert` mails root about any SSH login from an address outside the VPN.

## Watch from outside

A server that is down sends no mail, so `health-check` cannot report it. `sh test.sh --outside` needs only `nc`, `openssl` and `dig`, and exits with a failure when the server does not answer as it should. Run it on a timer on a machine at home and alert on a failure.

## Upgrade OpenBSD

There is a new release every six months. `health-check` reminds you each Monday once a new release is out, and daily once this one has stopped getting patches.

1. Run `ssh -t ADMIN_USER@10.8.0.1 doas sysupgrade`. It takes about 10 minutes.
2. Follow [Change the live server](#change-the-live-server). This rewrites any configs that sysmerge left alone.
3. Change `8.0` in this file to the new release.
