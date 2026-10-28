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
| `mail-alias` | Runs on the Mac. `./mail-alias add NAME` or `./mail-alias del NAME`. |
| `share` | Runs on the Mac. `./share FILE` prints a link to FILE that works for 30 days. |
| `local.conf.example` | The private values, with test values. CI uses it. |
| `etc/` | The configs: httpd, acme-client, smtpd, pf, sshd, unbound, doas, sysctl, crontab, and `rc.d/neurons_room`. |
| `bin/` | The jobs: health-check, ssh-alert, blocklist-update, and deploy-only (the forced command of the deploy user). |
| `www/` | Files on the web: security.txt, the GPG key with WKD, the MTA-STS policy. |
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
7. Deploy the site from its repo. The site repo also has the app pages.
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
- The limits: 100 rooms, 5 members and 64 notes in a room, 8,192 bytes in a request. In each minute, 600 requests
  from 1 address, and 600 requests or 120 views and notes in 1 room. In each hour, 6 new rooms from 1 address.
- The daemon refuses a request that holds `sk-or-`, so an OpenRouter key cannot go into a room.

To change the relay, change `room.goose`, then make `room.c` again with Goose at commit
`a108677d300cb0e8bbb842c35a353abe67a20c6c` (its build is in the README of the neurons repo):

```
cd room && GOOSE_STDLIB=../../goose/stdlib ../../goose/build/goose --standalone --include room_net.h -o room.c room.goose
```

`install.sh` builds the daemon from `room.c`. `test.sh` tests it through httpd, and the limits on 2 more daemons.

## Upgrade to the next OpenBSD release (each 6 months)

```
ssh -t ADMIN_USER@10.8.0.1 doas sysupgrade      # downloads, reboots, upgrades: about 10 minutes
./apply ADMIN_USER@10.8.0.1                     # writes the configs of this repo again
ssh -t ADMIN_USER@10.8.0.1 doas sh server/test.sh
```

After the upgrade, sysmerge mails root a list of the configs that it did not change. `apply`
writes the repo version of each of them, so you do not need to merge them by hand.

Change `8.0` in this file and in `.github/workflows/ci.yml` to the new release.
