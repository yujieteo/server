# teoyujie.org server

The config of the teoyujie.org server: OpenBSD 8.0 base system only, no packages.
It serves the site and the app pages, runs the pond save and read services and the room relay of the
neuron explorer, forwards mail, and is a VPN with an ad blocker.

This repo is public and has no secret. The server makes its own secrets (TLS key, ACME account
key, SRS key, WireGuard key), and they never leave it. `local.conf` (Git ignores it) has the
private values. No value in it gives access to the server.

## Files

| File | Use |
|---|---|
| `install.sh` | Runs on the server as root. Makes a fresh OpenBSD 8.0 server into teoyujie.org. Safe to run again. |
| `test.sh` | Runs on the server as root after `install.sh`. Tests all services. |
| `apply` | Runs on the Mac. Copies this repo and `local.conf` to the server, then runs `install.sh`. |
| `private-setup` | Runs on the Mac. The one-time setup of the private names of Lavish, femahoy and the fleet view (below). |
| `mail-alias` | Runs on the Mac. `./mail-alias add NAME` or `./mail-alias del NAME`. |
| `share` | Runs on the Mac. `./share FILE` prints a link to FILE that works for 30 days. |
| `local.conf.example` | The private values, with test values. CI uses it. |
| `etc/` | The configs: httpd, relayd, acme-client, smtpd, pf, sshd, unbound, doas, sysctl, crontab, and `rc.d/neurons_room`. |
| `bin/` | The jobs: health-check, ssh-alert, blocklist-update, site-update (below), private-cert (below), deploy-only (the forced command of the deploy user), tunnel-wait (the login shell of the tunnel user), and fleet-upload (the forced command of the fleet user, below). |
| `fleet/index.html` | The page of the fleet view (below). It shows the pages of the Mac and the desktop. |
| `www/` | Files on the web: security.txt, the GPG key with WKD, the MTA-STS policy, and `errdocs/err.html`, the error page (403, 404 and the others) in the look of the site. |
| `pond/` | The pond save and read services (below). `pond_save.c`, `pond_verify.h`, `pond_lock.h`, `pond_read.c` and `pond_read.h` are copies of `server/` in the [pond repo](https://github.com/yujieteo/pond) at commit `cb6bbac6ffcb050347d1fab6852e4302184d1362`. Do not change them here. `main.c` adds pledge and unveil to `pond_save`. `pond_read` does its own unveil (read only) and pledge (`stdio rpath`). |
| `room/` | The room relay of the neuron explorer (below). `room.c` is the C that Goose makes from `room.goose`. |
| `.githooks/pre-commit`, `.gitleaks.toml` | gitleaks stops a commit that has a secret in it. Turn on the hook once in each clone: `git config core.hooksPath .githooks`. |
| `.github/workflows/ci.yml` | gitleaks, and `install.sh` plus `test.sh` on a fresh OpenBSD 8.0 VM. |

## Rebuild from zero

1. At Vultr, deploy "OpenBSD 8.0" (plan vc2-1c-1gb, Singapore) with the SSH key of the Mac and the
   hostname `teoyujie.org`. Set the reverse DNS of the IPv4 and the IPv6 address to `teoyujie.org`.
2. On the Mac: `cp local.conf.example local.conf`, then put in the real values. Before the first
   apply, make the tunnels of the Mac and the iPhone in the WireGuard app (below) and put their
   public keys in `WG_PEERS`. After the first apply, SSH works only through the VPN.
3. `./apply root@NEW_IPV4`. It asks for the doas password of the admin and prints the WireGuard
   public key of the server. After this run, root cannot log in with SSH.
4. Put that key in the WireGuard configs of the Mac and the iPhone (below). Turn on the tunnel,
   then test: `ssh ADMIN_USER@10.8.0.1`. ADMIN_USER is the value in `local.conf`. The admin keys and
   the deploy key work only through the VPN. If the VPN breaks, log in as ADMIN_USER with the
   doas password in the Vultr web console.
5. In Gandi LiveDNS, set the records of the next section.
6. When `dig +short teoyujie.org` shows the new address:
   `ssh -t ADMIN_USER@10.8.0.1 'doas acme-client -v teoyujie.org && doas rcctl reload httpd && doas rcctl restart smtpd'`
7. `install.sh` deploys the site from the main branch of its repo (below). The site repo also has the app pages.
8. Test on the server: `ssh -t ADMIN_USER@10.8.0.1 doas sh server/test.sh`.
   Test from outside that the server is not an open relay. Expect 550:
   `python3 -c 'import smtplib; s=smtplib.SMTP("teoyujie.org"); s.ehlo(); s.mail("a@example.org"); print(s.rcpt("a@example.net"))'`

After a change to this repo: `./apply ADMIN_USER@10.8.0.1`.

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
| `fh` | A | the IPv4 address of the server |
| `fleet` | A | the IPv4 address of the server |

Make no other record. A wildcard record stops GnuPG from finding the key with WKD.
If you change `www/.well-known/mta-sts.txt`, also change the `id` of `_mta-sts`.

## WireGuard clients

In the WireGuard app, add an empty tunnel. The app makes the private key and shows the public
key. Put the public key in `WG_PEERS` in `local.conf`. For the first apply, that is all (step 2
above). To add a new device later, run `./apply ADMIN_USER@10.8.0.1` from a device that is already
on the VPN. If no device is on the VPN, log in to the Vultr web console.
Add the key to `local.conf` in the `server` folder of the last apply, then run its `install.sh` as root.

```
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

The iPhone uses `Address = 10.8.0.3/32`. Only traffic to 10.8.0.0/24 goes through the VPN. All DNS
goes to the server, which blocks ads and trackers. Turn on "On Demand" on both devices.
The iPhone reaches the Mac at 10.8.0.2 (Remote Login or Screen Sharing in macOS Settings).

## Site deploys

Each minute, the cron job `bin/site-update` (as the user deploy) reads the commit of the main branch of
[yujieteo/site](https://github.com/yujieteo/site). When it changes, the job gets the tarball of that commit
from GitHub and gives its `public/` to deploy-only. Then it gets `/` and each URL in `fixed-urls.txt` of that
commit from httpd. If one does not give 200, it puts the previous site back and mails root. Thus a push to
main deploys the site, with no key and no Mac. `/home/deploy/site-commit` holds the last commit, so a failed
commit is not deployed again. The next commit on main deploys again. If GitHub does not answer, the job
tries again the next minute and mails nothing.

`scripts/deploy.sh` of the site repo also deploys from the Mac. The next change on main replaces that deploy.

## Pond save and read services

`POST https://teoyujie.org/pond/entry` takes 1 signed change to 1 pond entry. The pond repo has the
protocol in `docs/protocol.md`. httpd sends `/pond/*` (but not `/pond/entries.json`) to `/var/www/cgi-bin/pond_save` through slowcgi.
The data is in `/var/www/pond`: `keys/` has the public keys of the devices, and `entries/` has the
entries. A deploy and `install.sh` do not change them. The server has no private key.

To enrol a device, put the base64 of its public key (SubjectPublicKeyInfo DER) in `keys/NAME.pub`.
NAME is the `key` of its requests. From the Mac:

```
scp NAME.pub ADMIN_USER@10.8.0.1:
ssh -t ADMIN_USER@10.8.0.1 doas install -m 644 NAME.pub /var/www/pond/keys/
```

To revoke the device, delete its file.

`GET /pond/entries.json`, `/log/` and `/log/feed.xml` show the entries, newest first. httpd sends
them to `/var/www/cgi-bin/pond_read` through slowcgi. `/log/` is the site file `log/template.html`
with the entries in place of its line `<!-- pond:entries -->`. Without that file, `/log/` is a plain
page. pond_read can only read the entries and the template.

To use a new pond version, copy the 5 files from `server/` of the pond repo to `pond/`, change the
commit in the table above, then apply.

## Room relay of the neuron explorer

`POST https://teoyujie.org/play/neurons/room` is the relay of the rooms of the
[neuron explorer](https://github.com/yujieteo/neurons). A share link opens a room, and 2 to 5 people see the same
view and the same notes. The README of the neurons repo has the protocol (Rooms).
httpd sends the requests to `neurons_room`, a Goose daemon on 127.0.0.1 port 8790, with FastCGI.
`etc/rc.d/neurons_room` starts it as the user `_neuronsroom`. It pledges `stdio inet`, so it cannot open a file.

- The page polls the relay once each second. httpd in the base system cannot pass a WebSocket to a daemon, and a
  server-sent event stream or a long poll keeps one connection open for each member. A poll is a short request, so
  the daemon serves one request at a time, with no thread and no lock.
- The daemon keeps the rooms in memory only. It writes no file and logs no room and no address. A room ends 3 days
  after it was made, and a restart of the daemon ends all rooms.
- The limits: 100 rooms, 5 members and 64 notes in a room, 8,192 bytes in a request, 2 s to send a request. In
  each minute, 600 requests from 1 address, and 600 requests or 120 views and notes in 1 room. In each hour, 6 new
  rooms from 1 address. For these limits, all of an IPv6 /64 is 1 address.
- Known limit: a room stays for 3 days, also with no members. Thus about 17 addresses can make all 100 rooms in
  1 hour, and then nobody can make a room for up to 3 days.
- The daemon refuses a request that holds an OpenRouter key (`sk-or-v1-` and 64 hex digits) in a string of its
  JSON, so a key cannot go into a room.

To change the relay, change `room.goose`, then make `room.c` again with Goose at commit
`a108677d300cb0e8bbb842c35a353abe67a20c6c` (its build is in the README of the neurons repo):

```
cd room && GOOSE_STDLIB=../../goose/stdlib ../../goose/build/goose --standalone --include room_net.h -o room.c room.goose
```

`install.sh` builds the daemon from `room.c`. `test.sh` tests it through httpd, and the limits on 2 more daemons.

## Private names of Lavish and femahoy

On a device on the VPN (Mac, iPhone, desktop), these names open the apps. No token is necessary.

| Name | App | Tunnel port on 10.8.0.1 |
|---|---|---|
| `https://mac.lavish.teoyujie.org` | Lavish on the Mac (127.0.0.1:4387) | 4387 |
| `https://desk.lavish.teoyujie.org` | Lavish on the desktop (127.0.0.1:4387) | 4388 |
| `https://fh.teoyujie.org` | femahoy `fh serve` on the desktop (127.0.0.1:8790) | 8790 |

Lavish uses paths from the root of the site (`/api/...`, `/events/...`), so each Lavish has its own name,
not a path such as `/mac`. Nobody without a WireGuard key gets to them.

<img src="docs/figures/private-names.svg" width="360" alt="The path of a request to a private name. A VPN device asks unbound, which gives the name as 10.8.0.1. The device sends HTTPS to relayd on 10.8.0.1 port 443, which gives 403 to a cross-site Origin. relayd sends mac.lavish to port 4387, desk.lavish to port 4388, fh to port 8790 and fleet to httpd port 8092. Reverse SSH tunnels take ports 4387, 4388 and 8790 to Lavish on the Mac, Lavish on the desktop and femahoy on the desktop. From the internet, the public httpd answers only the Let's Encrypt check for these names.">

*Only a VPN device reaches relayd. relayd sends each name to its tunnel port or to the fleet view.*

- The Mac and the desktop open a reverse SSH tunnel to the server, as the user `tunnel`. The tunnel ports
  listen only on 10.8.0.1, the VPN address of the server. The room relay also uses port 8790, but on
  127.0.0.1, so the two do not collide.
- The user `tunnel` can only open these 3 tunnels (`Match User tunnel` in `etc/sshd_config`). It cannot
  run a command, get a terminal, or connect from the server to another address. It logs in with a key
  only, and only through the VPN.
- unbound gives the 3 names to the VPN devices as 10.8.0.1. relayd on 10.8.0.1 port 443 (`etc/relayd.conf`)
  sends each name to its tunnel. relayd gives 403 to a request with an `Origin` other than its own
  name, or with `Sec-Fetch-Site: cross-site`, so a web page cannot use the apps. The 403 page has the look of the site error page. Then relayd sets `Host`
  and `Origin` to the local address of the app. For femahoy, relayd also sends the token of `fh serve` (`FH_TOKEN` in `local.conf`).
  httpd on 10.8.0.1 port 80 sends the names to HTTPS.
- pf lets the internet in only to the public addresses. On the public addresses, httpd answers only
  the Let's Encrypt challenge for the 3 names. `bin/private-cert` gets their certificate.

To set it up:

1. In Gandi LiveDNS, add the records `mac.lavish`, `desk.lavish` and `fh` of the table in [DNS records](#dns-records). This
   is the only step by hand. Let's Encrypt needs them to check the names. The records give the public
   address, which answers only the check.
2. On the Mac (also from Termius over SSH), with the VPN on: `./private-setup ADMIN_USER@10.8.0.1`.
   It makes the key `~/.ssh/tunnel_ed25519` on the Mac and on the desktop (the private keys stay there).
   It puts the public keys (`TUNNEL_KEY`) and the femahoy token (`FH_TOKEN`) in `local.conf`, runs `apply`
   (it asks for the doas password), and runs `rebuild` on the Mac and on the desktop. The dotfiles make
   the tunnel services. If a step fails, the command says which step and how to try again.
   It is safe to run again, for example after a new femahoy token.

`test.sh` tests the tunnel user, the listen addresses, the pf rules, the headers that relayd sends to
each app, and that the public addresses do not answer for the 3 names.

## Fleet view

`https://fleet.teoyujie.org` shows the workers on the Mac and on the desktop: each worker, its task, its
last event, and each PR that waits for a word from the captain. It is read only, and only for the VPN devices.
The Mac and the desktop make their pages (the dotfiles do that, not this repo) and upload them:

```
ssh -i ~/.ssh/tunnel_ed25519 fleet@10.8.0.1 mac < mac.html        # on the Mac
ssh -i ~/.ssh/tunnel_ed25519 fleet@10.8.0.1 desk < desk.html      # on the desktop
```

- The user `fleet` logs in with the tunnel keys (`TUNNEL_KEY` in `local.conf`), only through the VPN.
  It can only run `bin/fleet-upload`: no shell, no terminal, no forwarding. Root owns its home.
- `fleet-upload` accepts only the name `mac` or `desk`, and a page of 1 MiB or less. It writes the page to a
  temp file in `/var/www/fleet`, then renames it to `mac.html` or `desk.html`. Thus httpd always serves a
  complete page, and a failed upload keeps the old page.
- `fleet/index.html` shows the 2 pages and the time of each upload (the `Last-Modified` of the page). It
  says OLD when an upload is more than 10 minutes ago. It loads the pages again each 30 seconds.
  The pages show in a sandbox, so they cannot run a script. Use HTML and CSS only.
- unbound gives `fleet.teoyujie.org` to the VPN devices as 10.8.0.1. relayd on 10.8.0.1 port 443 sends it to
  httpd on 127.0.0.1 port 8092, with the same `Origin` and `Sec-Fetch-Site` rule as the other private names.
  The public addresses answer only the Let's Encrypt challenge for it, as for the other private names.
  To set it up, add the DNS record `fleet` (in [DNS records](#dns-records)), then `./apply ADMIN_USER@10.8.0.1`.
  Until the public DNS has that record, `bin/private-cert` renews no private name. If the tunnel keys are
  not set up yet, run `./private-setup` (below) in place of `./apply`.

`test.sh` tests the names, the size limit, the replace in 1 step, and that the public addresses do not answer.

## Upgrade to the next OpenBSD release (each 6 months)

```
ssh -t ADMIN_USER@10.8.0.1 doas sysupgrade      # downloads, reboots, upgrades: about 10 minutes
./apply ADMIN_USER@10.8.0.1                     # writes the configs of this repo again
ssh -t ADMIN_USER@10.8.0.1 doas sh server/test.sh
```

After the upgrade, sysmerge mails root a list of the configs that it did not change. `apply`
writes the repo version of each of them, so you do not need to merge them by hand.

Change `8.0` in this file and in `.github/workflows/ci.yml` to the new release.
