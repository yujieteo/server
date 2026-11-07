# Requirements

This file lists what the server must do. Each line has an id and the evals that prove it.
The evals pass on the code of today. A rewrite must keep them passing, with no change to them.

Eval names:

- `replay:PATH` runs `evals/replay.sh`. It renders the config with the real `put()` of `install.sh` and compares it to `evals/golden`, byte for byte, with the file mode.
- `vm:NAME` runs `evals/vm.sh` on an OpenBSD VM after `install.sh` ran twice.
- `test.sh:GROUP` is a group of checks in `test.sh`. It runs on the same VM.
- `conf:NAME`, `secrets:NAME`, `wkd:NAME` and `bench:NAME` are in `evals/conf-keys.sh`, `evals/secrets-detect.sh`, `evals/vm-wkd.sh` and `evals/bench.sh`.
- `manual:WHY` has no eval, and says why.

The golden files and the VM checks leave out what the author chose to remove (section Removed): the fleet view and femahoy.
`evals/keep.awk` cuts only those from the golden files. The pond, the room relay and the site update stay in the golden files. The VM run is `sh test.sh`.
`sh evals/trace.sh` checks both ways: each id has evals that exist, and each eval is named by an id.

## WireGuard

- **WG-1** wg0 has 10.8.0.1/24 and port 51820, with one peer for each item of `WG_PEERS`. Evals: `vm:wg-conf` `vm:wg-up` `test.sh:VPN`
- **WG-2** A second install keeps the key of the server. The key is the only secret of wg0. Evals: `vm:wg-key-kept` `vm:second-install-ok` `vm:wg-second-install-quiet`. The last one watches wg0 every 0.1 s during the second install: it never goes away, the peers do not change, and `hostname.wg0` has the same hash.
- **WG-3** `/etc/hostname.wg0` has mode 640. Evals: `vm:wg-conf-mode`
- **WG-4** A change of the peers in a direct, plain install restarts wg0 last, two seconds after `install.sh` ends, detached. The key stays. Evals: `vm:wg-change-install` `vm:wg-change-detached` `vm:wg-change-untouched-until-exit` `vm:wg-change-peers-until-exit` `vm:wg-change-pending-after-exit` `vm:wg-change-waits-after-exit` `vm:wg-change-key-kept` `vm:wg-change-applied` `vm:wg-change-mode`. wg0 is watched during the install: it stays, with the old peers, until the install ends. Then `hostname.wg0.new` waits, wg0 keeps the old peers for at least 15 more samples (about 1.5 s of the 2 s delay), and eight seconds after the exit the new peer is there.
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
- **JOB-6** A service that is down is found by `rcctl`. This includes `slowcgi` and `neurons_room`. Evals: `vm:services-run` `test.sh:configs`
- **JOB-7** Each minute, one `site-update` run fetches the site, puts it in place and records its commit, and puts the old site back when a page fails. With no network it does nothing and exits 0. Evals: `vm:crontab` `vm:kept-site-update-restores` `vm:kept-site-update-deploys` `vm:kept-site-update-offline`

## Deploy

- **DEP-1** `install.sh` is safe to run twice. A second run changes no key and no file. Evals: `vm:installed` `vm:second-install-ok` `vm:wg-second-install-quiet` `bench:second_install_seconds`
- **DEP-2** `deploy-only` puts `site` or `apps/NAME` in place as one step, removes old files, and refuses all else. It checks the name as the live script does. Evals: `test.sh:deploy` `deploy:only-accepts-site-and-apps` `deploy:only-refuses-all-else`
- **DEP-3** `install.sh` has `mv -f` everywhere, so no question stops the run. Evals: `test.sh:install.sh`
- **DEP-4** `apply` runs on the desktop and the Mac. Its tar pack uses no Mac-only flag. Its stage keeps public file modes but locks the stage and local.conf. The other tools run on the Mac. Evals: `deploy:default-check` `deploy:stage-modes` `manual:the other tools need the Mac and live access`
- **DEP-5** The apply sends as few bytes as it did. `bench:apply_bytes` packs a clean copy of the repo with `pack`, as `apply` does, and counts the bytes. Evals: `bench:apply_bytes`
- **DEP-6** The checks fail with an error rate of 0. Evals: `bench:error_rate`
- **DEP-7** A fresh OpenBSD 8.0 builds from `local.conf.example` with `install.sh`, and `test.sh` passes. Evals: `vm:installed` `test.sh:configs`

- **DEP-8** Apply packs the full archive before SSH. It unpacks to a new, private stage. A bad pack or transfer never deletes the old server tree or runs the install. Evals: `deploy:pack-failure` `deploy:transfer-failure` `deploy:install-failure` `deploy:stage-validation`
- **DEP-9** Apply checks by default. A live install needs an explicit mode and a full disk checkpoint id. The id is a receipt, not proof of a host backup. Evals: `deploy:default-check` `deploy:explicit-install` `deploy:checkpoint-required`
- **DEP-10** Live mode checks wg0 before any file or service change. It needs the same config bytes, a running wg0, and no pending change. It never writes or restarts wg0. Evals: `vm:live-match` `vm:live-mismatch` `vm:live-pending` `vm:live-down` `vm:live-stopped` `vm:live-install-quiet`
- **DEP-11** Rollback uses a full disk checkpoint, as set out in `ROLLBACK.md`. It restores the whole disk, not just old source. The live run must first check all disks and console access. A restore loses later writes and boots the server. Evals: `manual:the host checkpoint and console need consent and live access`

- **DEP-12** Check mode prints real diffs of all rendered files and the web tree, plus mode, owner and service actions. It names private and generated file updates, with no secret dump or guess at new bytes. It changes no installed file or service. The same render calls feed the install. Each file diff prints once. Evals: `vm:preview-read-only` `vm:preview-files` `vm:preview-services` `vm:preview-private` `vm:preview-generated` `vm:preview-render-failure` `vm:preview-installed`

## Secrets

- **SEC-1** The server makes its own TLS keys, ACME key, SRS key and WireGuard key. They never leave it and a second install keeps them. Evals: `vm:wg-key-kept` `vm:srs-key-kept` `vm:tls-key-kept` `vm:apps-key-kept`
- **SEC-2** Key files have mode 600. Evals: `vm:secret-modes`
- **SEC-3** Git ignores `local.conf`. Evals: `conf:ignored`
- **SEC-4** `local.conf` has 8 keys with fixed names and formats: `ADMIN_USER`, `ADMIN_KEY`, `DEPLOY_KEY`, `FORWARD_TO`, `ALIASES`, `WG_PEERS`, `KNOWN_IPS` and `TUNNEL_KEY`. Evals: `conf:keys-admin-user` `conf:keys-admin-key` `conf:keys-deploy-key` `conf:keys-tunnel-key` `conf:keys-forward-to` `conf:keys-aliases` `conf:keys-wg-peers` `conf:keys-known-ips`
- **SEC-5** `put` refuses a value that sed would change. Evals: `replay:put-refuses-sed-characters` `replay:file-list`
- **SEC-6** gitleaks finds a WireGuard key and an SRS key, in the hook and in CI. Evals: `secrets:wireguard` `secrets:srs` `secrets:clean`

## Old services on an existing host

- **OLD-1** An install over a host that still has the fleet account locks it and moves its authorized keys to `authorized_keys.disabled`. It sets the mode of `fleet-upload` to 000. It deletes no file or stored data, and leaves WireGuard and every other service alone. A second install changes nothing more. Evals: `vm:retire-planted` `vm:retire-install-ok` `vm:retire-install-again-ok` `vm:retire-fleet-locked-first` `vm:retire-fleet-locked-again` `vm:retire-fleet-keys-off-first` `vm:retire-fleet-keys-off-again` `vm:retire-fleet-upload-off-first` `vm:retire-fleet-upload-off-again` `vm:retire-files-remain-first` `vm:retire-files-remain-again` `vm:retire-wireguard-untouched-first` `vm:retire-wireguard-untouched-again` `vm:retire-others-run-first` `vm:retire-others-run-again`

## Kept on an existing host

The first rewrite dropped these. The live preview showed it, and the author wants them kept.

- **KEEP-1** The pond services stay. `pond_save` and `pond_read` are built from `pond/`, and httpd serves `/pond/entries.json`, `/log/`, `/log/feed.xml` and `/pond/*` through slowcgi. An install keeps the stored entries. Evals: `replay:etc/httpd.conf` `vm:kept-binaries` `vm:kept-pond-save` `vm:kept-pond-refusals` `vm:kept-pond-reads` `vm:retire-files-remain-first` `vm:retire-files-remain-again`
- **KEEP-2** The room relay stays. `neurons_room` is built from `room/`, runs as `_neuronsroom` on 127.0.0.1:8790, and httpd sends `/play/neurons/room` to it. An install keeps both services on and running. Evals: `replay:etc/httpd.conf` `replay:etc/rc.d/neurons_room` `vm:kept-services-run` `vm:kept-room` `vm:retire-room-kept-first` `vm:retire-room-kept-again` `vm:retire-slowcgi-kept-first` `vm:retire-slowcgi-kept-again`
- **KEEP-3** The preview names the build and restart of these services, and never a disable or a stop of them. Evals: `vm:preview-services`
- **KEEP-4** The health check and the SSH alert act as the live scripts do. The live preview showed only comment and name changes in them, so they differ from the live bytes in comments only. Evals: `vm:syslog-alert-once` `test.sh:SSH alert` `test.sh:SSH alert for an unknown address` `test.sh:health-check runs`
- **KEEP-5** The VM journey runs with outbound IPv4 and IPv6 networking blocked and with cron isolated, so no eval reaches the internet or runs a job by itself. The check that other names resolve is skipped then. Evals: `vm:kept-outbound-blocked` `vm:kept-cron-isolated`

## Removed

The author chose to remove these. They have no eval, and `evals/keep.awk` cuts them from the golden files.

- **GONE-3** The fleet view: the `fleet` user, `fleet-upload`, the page, and `fleet.teoyujie.org`. Was: `test.sh:fleet`
- **GONE-4** femahoy: `fh.teoyujie.org`, `FH_TOKEN` and the token in `relayd.conf`. The rewrite has no fh check in `test.sh`. The unused token in the server `local.conf` stays as it is.

## Known failing on today's code

WEB-8 fails today for the advanced method. The direct method works.

- `etc/httpd.conf` has no server and `etc/acme-client.conf` has no certificate for `openpgpkey.teoyujie.org`, the host that the advanced method asks.
- The README says to make no other DNS record, so that host has no DNS name. Gandi is outside this repo and no one changed it.
- The `/.well-known/*` location of the main site takes the root `/htdocs/server`, which is `www/`. `www/` has only the direct files. The site sends the advanced files to `/web/site/.well-known/openpgpkey/teoyujie.org/`, and that location hides them.

The CI step for `wkd:` allows failure until the rewrite fixes it. No live server and no DNS record was touched to find this.
