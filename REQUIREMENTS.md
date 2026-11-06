# Requirements

This file lists what the server must do. Each line has an id and the evals that prove it.
The evals pass on the code of today. A rewrite must keep them passing, with no change to them.

Eval names:

- `replay:PATH` runs `evals/replay.sh`. It renders the config with the real `put()` of `install.sh` and compares it to `evals/golden`, byte for byte, with the file mode.
- `vm:NAME` runs `evals/vm.sh` on an OpenBSD VM after `install.sh` ran twice.
- `test.sh:GROUP` is a group of checks in `test.sh`. It runs on the same VM.
- `conf:NAME`, `secrets:NAME`, `wkd:NAME` and `bench:NAME` are in `evals/conf-keys.sh`, `evals/secrets-detect.sh`, `evals/vm-wkd.sh` and `evals/bench.sh`.
- `manual:WHY` has no eval, and says why.

The golden files and the VM checks leave out what the author chose to remove (section Removed).
`evals/keep.awk` cuts it from the golden files. The VM run is `KEPT_ONLY=1 sh test.sh`: it skips the checks that `evals/removed-checks` lists, and prints `skip` for each.
A rewrite that has none of the removed parts passes the same evals.
`sh evals/trace.sh` checks both ways: each id has evals that exist, and each eval is named by an id.

## WireGuard

- **WG-1** wg0 has 10.8.0.1/24 and port 51820, with one peer for each item of `WG_PEERS`. Evals: `vm:wg-conf` `vm:wg-up` `test.sh:VPN`
- **WG-2** A second install keeps the key of the server. The key is the only secret of wg0. Evals: `vm:wg-key-kept` `vm:second-install-ok` `vm:wg-second-install-quiet`. The last one watches wg0 every 0.1 s during the second install: it never goes away, the peers do not change, and `hostname.wg0` has the same hash.
- **WG-3** `/etc/hostname.wg0` has mode 640. Evals: `vm:wg-conf-mode`
- **WG-4** A change of the peers restarts wg0 last, two seconds after `install.sh` ends, detached. The key stays. Evals: `vm:wg-change-install` `vm:wg-change-detached` `vm:wg-change-untouched-until-exit` `vm:wg-change-peers-until-exit` `vm:wg-change-pending-after-exit` `vm:wg-change-key-kept` `vm:wg-change-applied` `vm:wg-change-mode`. wg0 is watched during the install: it stays, with the old peers, until the install ends. Then `hostname.wg0.new` waits, and eight seconds later the new peer is there.
- **WG-5** The server forwards packets. Evals: `replay:etc/sysctl.conf` `vm:forwarding`

## Firewall

- **PF-1** pf blocks all incoming packets and lets all outgoing packets pass. Evals: `replay:etc/pf.conf` `test.sh:configs`
- **PF-2** The internet reaches only tcp 22, 25, 80 and 443, and udp 51820, on the public address. ICMP is allowed. Evals: `replay:etc/pf.conf` `test.sh:pf`
- **PF-3** All of wg0 is open. Evals: `replay:etc/pf.conf`
- **PF-4** `pf.conf` has mode 600. Evals: `replay:etc/pf.conf` `vm:secret-modes`

## SSH and users

- **SSH-1** No root login, and keys only. Evals: `replay:etc/ssh/sshd_config` `test.sh:sshd`
- **SSH-2** The admin keys work only from the VPN and from 127.0.0.1. The admin is in wheel and uses doas. Evals: `vm:admin-keys` `vm:admin-wheel` `replay:etc/doas.conf` `test.sh:admin keys`
- **SSH-3** The deploy key works only from the VPN. Its one command is `deploy-only`, with no shell. Evals: `vm:deploy-key` `test.sh:deploy`
- **SSH-4** The tunnel user waits and runs no command. It may open only 10.8.0.1:4387 and 10.8.0.1:4388, and it makes no connection from the server. Evals: `replay:etc/ssh/sshd_config` `vm:tunnel-keys` `vm:tunnel-shell` `test.sh:tunnel`
- **SSH-5** A login from an unknown address sends mail to root. A user name cannot fake an alert. Evals: `vm:syslog-alert-once` `test.sh:SSH alert` `test.sh:SSH alert for an unknown address`

## Web

- **WEB-1** httpd serves the site from `/web/site` over TLS. Evals: `replay:etc/httpd.conf` `test.sh:web`
- **WEB-2** HTTP goes to HTTPS, and www goes to the bare name. Evals: `test.sh:web`
- **WEB-3** The ACME challenge is answered on port 80. Evals: `replay:etc/httpd.conf` `test.sh:web`
- **WEB-4** A file link has 128 random bits and shows no list. Links older than 30 days go away. Evals: `test.sh:web` `vm:crontab`
- **WEB-5** The server sends `security.txt`, `contact.gpg`, the WKD key of the direct method, and the MTA-STS policy. Evals: `test.sh:web`
- **WEB-6** The error pages have the look of the site. Evals: `test.sh:web`
- **WEB-7** httpd sends `.wasm` as `application/wasm`. Evals: `replay:etc/httpd.conf`
- **WEB-8** The server sends both WKD methods. Direct: https://teoyujie.org/.well-known/openpgpkey/hu/HASH and /policy. Advanced: https://openpgpkey.teoyujie.org/.well-known/openpgpkey/teoyujie.org/hu/HASH and /teoyujie.org/policy. The key and the policy bytes equal the files in `www/`. The advanced method also needs the DNS record and the TLS certificate of `openpgpkey.teoyujie.org`. Evals: `wkd:direct-hu` `wkd:direct-policy` `wkd:advanced-hu` `wkd:advanced-policy`. The advanced evals fail on today's code. See the end of this file.

## Private names

- **PRIV-1** `mac.lavish` and `desk.lavish` resolve to 10.8.0.1 for the VPN, with no AAAA. Evals: `replay:var/unbound/etc/unbound.conf` `test.sh:private names`
- **PRIV-2** The public address gives nothing for these names. Port 80 answers only the ACME challenge. Evals: `replay:etc/httpd.conf` `replay:etc/acme-client.conf` `vm:private-acme` `test.sh:private names`
- **PRIV-3** relayd listens on 10.8.0.1:443 and sends `mac` to port 4387 and `desk` to port 4388. Evals: `replay:etc/relayd.conf` `test.sh:relayd`
- **PRIV-4** Another Origin and a cross-site request get 403 in the look of the site. Evals: `replay:etc/relayd.conf` `vm:private-origin-403` `vm:private-cross-site-403` `vm:private-403-page` `test.sh:relayd`
- **PRIV-5** relayd sets Host and Origin to the address the app expects. A request with no Origin passes. Evals: `replay:etc/relayd.conf` `test.sh:relayd`
- **PRIV-6** The private certificate is made with ACME only when DNS shows the public address, and relayd restarts after it. Evals: `test.sh:private names` `manual:the real ACME call needs the real DNS and Let's Encrypt`
- **PRIV-7** unbound answers only the VPN and 127.0.0.1, checks DNSSEC, and loads a blocklist of ads. Evals: `replay:var/unbound/etc/unbound.conf` `test.sh:DNS`
- **PRIV-8** The tunnel ports listen only on 10.8.0.1. Evals: `test.sh:tunnel`

## Mail

- **MAIL-1** `contact@`, `postmaster@` and each name in `ALIASES` go to `FORWARD_TO`. Evals: `vm:mail-virtual` `test.sh:mail`
- **MAIL-2** Any other address of the domain gets 550. The server is not an open relay. Evals: `replay:etc/mail/smtpd.conf` `test.sh:mail`
- **MAIL-3** The VPN can send to local users and nowhere else. Evals: `replay:etc/mail/smtpd.conf` `vm:mail-aliases` `test.sh:mail`
- **MAIL-4** Mail the server sends out uses SRS, with a key the server made. Evals: `replay:etc/mail/smtpd.conf` `vm:srs-key-kept`
- **MAIL-5** The MTA-STS policy is served, and TLS-RPT and the DNS records are in the README. Evals: `test.sh:web` `manual:the DNS records are at Gandi, outside this repo`

## Jobs

- **JOB-1** acme-client renews the certificate of the site each day and reloads httpd and smtpd. Evals: `vm:crontab`
- **JOB-2** syspatch runs each day and the server restarts after a patch. Evals: `vm:crontab`
- **JOB-3** health-check runs each day and mails what it finds. Evals: `vm:crontab` `test.sh:health-check runs` `test.sh:jobs in crontab`
- **JOB-4** The blocklist updates each week. Evals: `vm:crontab` `test.sh:DNS`
- **JOB-5** The private certificate job runs each hour. Evals: `vm:crontab`
- **JOB-6** A service that is down is found by `rcctl`. Evals: `vm:services-run` `test.sh:configs`

## Deploy

- **DEP-1** `install.sh` is safe to run twice. A second run changes no key and no file. Evals: `vm:installed` `vm:second-install-ok` `vm:wg-second-install-quiet` `bench:second_install_seconds`
- **DEP-2** `deploy-only` puts `site` or `apps/NAME` in place as one step, removes old files, and refuses all else. Evals: `test.sh:deploy`
- **DEP-3** `install.sh` has `mv -f` everywhere, so no question stops the run. Evals: `test.sh:install.sh`
- **DEP-4** `apply`, `private-setup`, `mail-alias` and `share` run on the Mac. Evals: `manual:they need the Mac, the live server and a password`
- **DEP-5** The apply sends as few bytes as it did. `bench:apply_bytes` packs a clean copy of the repo with the `tar` line of `apply` and counts the bytes. Evals: `bench:apply_bytes`
- **DEP-6** The checks fail with an error rate of 0. Evals: `bench:error_rate`
- **DEP-7** A fresh OpenBSD 8.0 builds from `local.conf.example` with `install.sh`, and `test.sh` passes. Evals: `vm:installed` `test.sh:configs`

## Secrets

- **SEC-1** The server makes its own TLS keys, ACME key, SRS key and WireGuard key. They never leave it and a second install keeps them. Evals: `vm:wg-key-kept` `vm:srs-key-kept` `vm:tls-key-kept` `vm:apps-key-kept`
- **SEC-2** Key files have mode 600. Evals: `vm:secret-modes`
- **SEC-3** Git ignores `local.conf`. Evals: `conf:ignored`
- **SEC-4** `local.conf` has 8 keys with fixed names and formats: `ADMIN_USER`, `ADMIN_KEY`, `DEPLOY_KEY`, `FORWARD_TO`, `ALIASES`, `WG_PEERS`, `KNOWN_IPS` and `TUNNEL_KEY`. Evals: `conf:keys-admin-user` `conf:keys-admin-key` `conf:keys-deploy-key` `conf:keys-tunnel-key` `conf:keys-forward-to` `conf:keys-aliases` `conf:keys-wg-peers` `conf:keys-known-ips`
- **SEC-5** `put` refuses a value that sed would change. Evals: `replay:put-refuses-sed-characters` `replay:file-list`
- **SEC-6** gitleaks finds a WireGuard key and an SRS key, in the hook and in CI. Evals: `secrets:wireguard` `secrets:srs` `secrets:clean`

## Removed

The author chose to remove these. They have no eval, and `evals/keep.awk` cuts them from the golden files.

- **GONE-1** The pond save and read services and the `/log/` page. Was: `test.sh:pond`
- **GONE-2** The room relay of the neuron explorer, `neurons_room` and its user. Was: `test.sh:rooms`
- **GONE-3** The fleet view: the `fleet` user, `fleet-upload`, the page, and `fleet.teoyujie.org`. Was: `test.sh:fleet`
- **GONE-4** femahoy: `fh.teoyujie.org`, `FH_TOKEN` and the token in `relayd.conf`. The fh checks of `relayd` and `private names` in `test.sh` are skipped in the kept path (`evals/removed-checks`).
- **GONE-5** The job that runs `site-update` each minute. The site deploys from the Mac with `deploy-only`. Was: `test.sh:site-update`
- **GONE-6** The `services run` check of `test.sh` also asks for `slowcgi` and `neurons_room`, which go with the pond and the room. The kept path uses `vm:services-run`. Was: `test.sh:services run`

## Known failing on today's code

WEB-8 fails today for the advanced method. The direct method works.

- `etc/httpd.conf` has no server and `etc/acme-client.conf` has no certificate for `openpgpkey.teoyujie.org`, the host that the advanced method asks.
- The README says to make no other DNS record, so that host has no DNS name. Gandi is outside this repo and no one changed it.
- The `/.well-known/*` location of the main site takes the root `/htdocs/server`, which is `www/`. `www/` has only the direct files. The site sends the advanced files to `/web/site/.well-known/openpgpkey/teoyujie.org/`, and that location hides them.

The CI step for `wkd:` allows failure until the rewrite fixes it. No live server and no DNS record was touched to find this.
