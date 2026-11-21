# teoyujie.org server

Configuration for the teoyujie.org server: OpenBSD 8.0. The config needs the base system and one package, `opensmtpd-filter-dkimsign`.

It does four things:

- Serves the website and temporary file links with httpd.
- Forwards mail for teoyujie.org with smtpd, and signs mail that starts on the server or the VPN with DKIM.
- Runs a WireGuard VPN, which is the only way to reach SSH.
- Blocks ads, trackers and malware names for VPN clients with unbound.

This repo is public and holds no secrets. The server generates its own TLS, ACME, SRS, DKIM, SSH and WireGuard keys. The TLS and ACME keys never leave it. A backup of the others goes to your password vault and nowhere else. Your personal settings live in `local.conf`, which git ignores.

## Files

| Path | Runs on | Purpose |
|---|---|---|
| `apply` | Mac or desktop | Sends the source to the server, then checks, installs or tests it. |
| `install.sh` | Server, as root | Renders every managed file, shows how the live server differs, and copies what differs. A fresh OpenBSD install and a running server take the same path. |
| `test.sh` | Server, as root | Tests the running services. With `--outside` it runs on any other machine and tests what the internet and a VPN peer see. |
| `share` | Mac | `./share [--days N] FILE` uploads a file and prints a link that lasts N days (default 30). `--list` shows the live links with an expiry date or `no scheduled expiry`; `--rm LINK` deletes one. |
| `local.conf.example` | | Template for `local.conf`, filled with test values. |
| `etc/` | | Configs for httpd, smtpd, acme-client, pf, sshd, unbound, doas, sysctl, cron and the public network interface. |
| `sbin/` | Server | Scheduled jobs, the Perl helpers they share (`feed-common.pl`) and the forced command of the `deploy` user. |
| `www/` | | Public files: `security.txt`, the GPG key and WKD, the MTA-STS policy. `security.txt` carries your GPG signature: before its `Expires` date, or after any edit, strip the signature, edit and run `gpg --clearsign` again. |
| `reports` | Mac | `python3 -I reports FILE...` prints each failure in the DMARC and TLS reports that other providers send, and each sender that is not this server. Keep the reports out of the repo. |
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
3. To keep the old keys, put the backup on the new server first: `ssh root@NEW_IPV4 'tar -xzpf - -C /' < keys.tgz`. Skip this after a break-in, and follow the last column of [What a rebuild loses](#what-a-rebuild-loses).
4. Run `./apply --bootstrap root@NEW_IPV4`. It asks you to set the admin's doas password, prints the server's WireGuard public key, and turns off root login.
5. Add that key to the WireGuard clients if it is new, turn on the tunnel, and test `ssh ADMIN_USER@10.8.0.1`. If the VPN fails, log in as the admin in the Vultr web console.
6. Create the DNS records below in Gandi LiveDNS.
7. Once `dig +short teoyujie.org` shows the new address, get the real certificate:

   ```sh
   ssh -t ADMIN_USER@10.8.0.1 'doas acme-client -v teoyujie.org && doas rcctl reload httpd && doas rcctl restart smtpd'
   ```

8. Deploy the site by running `scripts/deploy.sh` in the site repo with the VPN on.
9. Run both tests from [Change the live server](#change-the-live-server). Before DNS points at the new server, `sh test.sh --outside NEW_IPV4` tests it by address.

## What a rebuild loses

The repo and `local.conf` rebuild everything except this state. The plan column is a choice, not a fact: change it when the choice changes.

| State | Lives | Plan | After a rebuild without it |
|---|---|---|---|
| `local.conf` | The Mac only | Back up | There is no rebuild. |
| WireGuard key of the server | `/etc/hostname.wg0` | Back up | Put the new public key in each client. Until then, use the console. |
| DKIM key | `/etc/mail/dkim` | Back up | Publish the new record from the DNS table. |
| SRS key | `/etc/mail/srs.conf` | Back up | A bounce of mail forwarded before the rebuild cannot return. |
| SSH host keys | `/etc/ssh` | Back up | Clients warn once: remove the old line from `known_hosts`. |
| TLS key and ACME account | `/etc/ssl/private`, `/etc/acme` | Accept the loss | Publish the new TLSA record from the DNS table at step 6, or DANE senders hold mail. Step 7 gets a new certificate. |
| Public addresses | Vultr | Rebuild | New A, AAAA and reverse DNS records. |
| Saved feed copies and the EDMW counts | `/var/www/feed` | Accept the loss | The jobs fetch again. EDMW needs a day of counts first. |
| Shared files | `/var/www/files/f` | Accept the loss | Their links stop working. |
| DNS allowlist | `/var/unbound/etc/allowlist` | Accept the loss | Add the names again. |
| Mail in the queue, and the logs | `/var/spool/smtpd`, `/var/log` | Accept the loss | |
| The site | The site repo | Rebuild | Step 8. |
| DNS zone, DNSSEC, the domain | Gandi | Outside the server | The table below lists the records. |

To back up the keys, run this with the VPN on. Do it again when you add a WireGuard peer or change the DKIM selector:

```sh
ssh -t ADMIN_USER@10.8.0.1 "doas sh -c 'umask 077; cd / && tar -czf /home/ADMIN_USER/keys.tgz etc/hostname.wg0 etc/mail/dkim etc/mail/srs.conf etc/ssh/ssh_host_* && chown ADMIN_USER /home/ADMIN_USER/keys.tgz'"
ssh ADMIN_USER@10.8.0.1 'cat keys.tgz && rm keys.tgz' > keys.tgz
```

Attach `keys.tgz` and `local.conf` to an entry in your password vault, then delete `keys.tgz` from the Mac. `install.sh` makes a key only when none is there, so a restored key stays.

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
| `_25._tcp` | TLSA | `3 1 1 KEY_HASH` |
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

The TLSA record lets a sending server that checks DANE refuse a forged mail server. `KEY_HASH` is the SHA-256 of the TLS key, which acme-client keeps when it renews. To print it, run this on the server:

```sh
doas openssl pkey -in /etc/ssl/private/teoyujie.org.key -pubout -outform DER | openssl dgst -sha256
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

## Rules

These are the rules the server keeps. The first twelve are rebuilt from #49, which did not keep its own list. Each check is in `test.sh` unless the row names another file. `.github/ci/openbsd-faults` injects each fault in an OpenBSD VM and requires exactly those checks to fail.

| Rule | Check that fails | Fault that makes it fail |
|---|---|---|
| The live server is what `install.sh` renders from this repo. | `live equals rendered` | Any edit to a managed file. |
| A rebuild from the README backup keeps the SSH, WireGuard, DKIM and SRS keys. | `.github/ci/openbsd` compares the key fingerprints | A backup that leaves out a key. |
| SSH is reachable only through the VPN, with a key, and never as root. | `sshd: no root login`, `sshd: keys only`, `admin keys: VPN only`, outside: `port 22 is closed` | `PermitRootLogin yes`, `AuthenticationMethods any`, a key with no `from=`, a pf rule that passes port 22. |
| The internet reaches only TCP ports 25, 80 and 443 and UDP port 51820, and a host that opens connections too fast is blocked for a day (`doas pfctl -t flood -T delete ADDRESS` lets it out). | `pf: the internet reaches only the public services`, `pf: the flood table exists`, outside: the closed ports, `.github/ci/outside`: nmap | The same pf rule, the table deleted. |
| `_feed` reaches only DNS and HTTPS, `_smtpd` only DNS and mail servers, and `www`, `deploy` and `_dkimsign` nothing; none reaches a VPN peer, and pf logs each packet it blocks. | `pf: the feed user …`, `pf: the web server user reaches nothing`, `pf: the mail user …`, `pf: blocked packets are in the log`, `health-check`: blocked packets | pf rules that pass more for `_feed`, `www` and `_smtpd`, or drop one; `log` taken off the block rule. |
| A feed job writes only `/var/www/feed`, gives up running programs before it parses, and process accounting records each kill (`lastcomm perl`: `P` a kill, `U` a refused file). | `feed job: …`, `health-check`: runs that broke their limits | `unveil('/', 'rwcx')` and no `pledge` in `feed-common.pl`, or `accton` off. |
| Each user writes only its own folder. | `feed user: …`, `deploy user: …`, `web server: …` | Mode 777 on the feed folder, `a+w` in `deploy-only`. |
| Mail leaves only over TLS to a checked certificate, and mail that starts on the server or the VPN is signed with DKIM. | `mail: leaves only over checked TLS`, `mail: each listener … signs with DKIM` | `relay srs` without `tls`, `dkimsign` taken off the VPN listener. |
| DNS names this server: A, AAAA from the MAC, MX, NS and the DKIM key. | `health-check`: `A is now`, `AAAA is now`, `MX is now`, `NS is now`, the DKIM record | A guest with other addresses and keys, and no answer from Quad9. |
| A dead server shows from outside within an hour. | `.github/workflows/outside.yml` opens an issue; outside: `health` | `test.sh --outside 192.0.2.1`, an address with no server. |
| No text from a source can break a feed page or run a script there. | `.github/ci/check`: `a hostile source can break a page`, `web: feed pages run no script` | `escaped()` that returns its input, the `$no_script` lines removed. |
| The package and the OpenBSD patches stay current. | `health-check`: `patch not installed` | A fresh guest, which has none of the patches. |
| The `deploy` user can only swap in a new `site` folder. | `sshd: deploy …`, `deploy: …` | No `ForceCommand` or `AllowTcpForwarding`, a `deploy-only` that runs the command or takes any folder. |
| smtpd takes mail only for the listed addresses and relays nothing for others. | `mail: … is accepted`, `mail: … is refused`, `mail: VPN to another domain is refused`, `mail: forwarded to the mailbox` | An alias removed or added, a VPN listener that relays, a guest with no mailbox. |
| Web and mail speak only TLS 1.3, with a certificate that lasts 14 days or more and a TLSA record that matches its key and is signed from the root. | `mail: STARTTLS …`, outside: `TLS: …`, `DNS: the TLSA record …`, `.github/ci/outside`: testssl.sh and delv, `health-check`: the certificate | `protocols "tlsv1.2"` on the mail listener, the guest's one-day certificate. |
| VPN peers are all on wg0, reach each other through the server, and get a resolver that checks DNSSEC and answers "no such name" for the blocklist and `use-application-dns.net`. | `VPN: …`, `DNS: …` | A peer removed, forwarding off, an empty blocklist, the canary zone removed, `insecure_add`. |
| Every page carries HSTS, nosniff, no referrer, no framing, and a CSP that loads only from this site and allows no inline code. | `web: HSTS is on` … `web: no page may run an inline script or style`, `web: a cached feed keeps the security headers` | Each header line removed, `unsafe-inline` added. |
| httpd sends www and HTTP to `https://teoyujie.org`, answers ACME on HTTP, serves the public files, file links and MTA-STS policy, keeps file links out of search engines, lists no folder, and lets feed files be reused for five minutes. | the other `web: …` checks | Each redirect, location, header or file removed; `directory auto index`; mode 700 on the share folder. |
| `health-check` runs each day, reports each problem it names, and publishes the time it ran. | `health-check runs`, `health-check publishes the time it ran`, the `health-check` part of `openbsd-faults` | Mode 644 on the script, an old `health.txt`, and one fault for each report. |
| An SSH login from outside the VPN mails root, and a user name cannot fake one. | `SSH alert …` | `exit 0` in `ssh-alert`, a match on the whole log line. |
| Each job runs from `/etc/crontab`, and root's own crontab is empty. | `root's own crontab holds none of these jobs` | A job in root's crontab. |
| The repo holds no private key. | `.github/ci/check`: `a private key is tracked` | A tracked key. |

## Scheduled jobs

The system crontab comes from `etc/crontab`. It names the user that runs each job.

| When | Job |
|---|---|
| Daily | Update the package, and restart smtpd if it changed. |
| Daily | Install OpenBSD patches, and reboot if any were applied. |
| Daily | `health-check` reports problems with disk, services, the firewall, outbound packets that pf blocked, feed jobs that broke their limits, the VPN, patches, certificates, domain expiry, DNS, the DKIM record, mail stuck in the queue or refused for good, Spamhaus listing, unknown certificates, stale or missing feeds and an OpenBSD release that needs upgrading. |
| Hourly | Renew the TLS certificate if needed. |
| Daily | Delete shared links that have reached their end date. A regular `.keep` file inside a share folder exempts it from expiration. |
| Daily | `blocklist-update` rebuilds the DNS blocklist. |
| Hourly | Let hosts out of the firewall's `flood` table after a day. |
| Hourly | `feed-update` rebuilds `/feed.xml`, `/reading.html`, `/reading.txt`, `/forecasters.html`, `/forecasters.xml` and `/forecasters.txt` from public RSS feeds. It reads `notes/reading.txt` from the deployed site: each line moves one item in the reading feed and gives a sentence to show. An arXiv paper keeps its id and RSS GUID when a new version comes out, and a note saved under an id from an earlier version still applies. `/forecasters.html` keeps only bets: it reads the scored ledger `api/bets.txt` from the deployed site and shows each bet with its market price, source and due date. For a bet whose item is still in its feed it checks that the quote is still in the text. New items by the 40 that look like a forecast go to `/forecasters.txt` for an agent to record. They live outside the site folder, so deploys do not remove them. If a source fails, its last good copy is used. It ends by writing `/feeds-manifest.json`: the time, and the size and SHA-256 of `/reading.txt`, `/forecasters.txt` and `/singapore-policy-actionables.txt`, so an agent can see in one request whether any changed. |
| Hourly | `edmw-update` records reply counts from HardwareZone's EDMW forum. Once a day it writes the busiest threads and most-reacted comments to `/edmw.xml`, which `feed-update` includes. Its first output comes about a day after install. To stop bad words getting through, edit the list at the top of the script. |
| Weekly | `sg-update` fetches Singapore government feeds and the Gazette on Saturday morning, Singapore time. It ranks the documents by the fixed rules at the top of the script and writes `/singapore-policy-actionables.html`, `/singapore-policy-actionables.xml` and `/singapore-policy-actionables.txt`. If a source fails, its last good copy is used. |
| Hourly | `sg-update --render` ranks the saved copies again when a deploy has brought a `notes/policy.txt` newer than the pages. Each line of that file adds or removes points for one document and gives a note to show. On the first run after install it fetches. |

## Watch from outside

A server that is down sends no mail, and neither does one whose mail cannot leave, so `health-check` cannot report either. `sh test.sh --outside` needs only `nc`, `openssl` and `dig`, and exits with a failure when the server does not answer as it should. It also reads `/health.txt`, where `health-check` writes the time it ran and the count of mail that is stuck or was refused. `.github/workflows/outside.yml` runs it each hour on the desktop and opens an issue when it fails; GitHub stops a schedule after 60 days without a commit, and the watch is silent while the desktop is off.

## Upgrade OpenBSD

There is a new release every six months. `health-check` reminds you each Monday once a new release is out, and daily once this one has stopped getting patches.

1. Run `ssh -t ADMIN_USER@10.8.0.1 doas sysupgrade`. It takes about 10 minutes.
2. Follow [Change the live server](#change-the-live-server). This rewrites any configs that sysmerge left alone.
3. Change `8.0` in this file to the new release.
