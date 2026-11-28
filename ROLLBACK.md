# Live change and rollback

## Scope

Use a full disk checkpoint, not a copy of the old source tree.
The install can change users, keys, file modes, cron and service flags.
An old install cannot undo all of that.

A checkpoint saves disk state, not live RAM or past links.
A restore boots the server. The VPN will be down while it boots.
It also loses all writes made since the checkpoint, such as new mail and uploads.
It does not undo DNS changes or a TLS cert issued by a third party.
Do not make those changes as part of this run.

## Before a live install

For routine config or script updates, `--check`, `--install`, and `--test` are enough. Take a full offline disk checkpoint before risky changes (OS upgrades, `pf`, WireGuard, `sshd`, or disk/user changes):

1. Open the host's web console and verify local admin and root login. Keep it open — SSH through the VPN is not a recovery path.
2. For a full checkpoint: halt the server from the console with `shutdown -hp now`, take a snapshot of each disk at the host, then start the server again.
3. Run `./apply --check ADMIN_USER@10.8.0.1` from the Mac (where `local.conf` lives) with the VPN on, and read the diff. A failed check means stop.
4. Run `./apply --install ADMIN_USER@10.8.0.1`.
5. Run `./apply --test ADMIN_USER@10.8.0.1`, then `sh test.sh --outside`. Keep any checkpoint until these checks pass.

The check and the install are one script. Both render the managed files into a private stage tree and compare it with the live system.
The check stops there. The install goes on to copy what differs.
The check prints a diff for each public file that differs, and names the mode and owner changes, the files it would remove, and the users, folders and keys it would make.
It never prints the WireGuard config. It tests the staged configs with each service's own checker.
Keep its output private. A check is a plan, not consent to install.
The check still makes a private stage folder and the usual SSH audit logs.

An install over SSH never changes WireGuard: it stops before its first change, with status 3.
It restarts only the services whose files changed, so expect a short interruption of those.
It fetches no TLS cert; cron does that.
Do not call this a zero-impact install.

## If any check fails

1. Stop the run. Do not run the old install as a rollback. Do not keep retrying over SSH.
2. Use the web console to halt or power off the server. Keep all new writes paused.
3. Restore every disk from the same stopped-server checkpoint set. Check each disk id and restore result before you boot. If the host cannot restore one, keep the server off and use its disk recovery path.
4. Boot from that set. Use the console to check local admin and root access. Check the VPN from a client, then the site, mail, cron and service flags. Resume writes only when those checks pass.

   If SSH works but the site or mail does not, run `rcctl check httpd relayd smtpd` on the console. If `/var/log/daemon` or `/var/log/maillog` reports `Can't assign requested address` at boot, check `ifconfig egress` and `ifconfig wg0`. Once the listener addresses are present, use `rcctl start` for each failed daemon. Repeat the service checks and confirm the site response and a fresh VPN SSH login from the client.

A disposable OpenBSD VM can prove the disk restore method.
It cannot prove your host's checkpoint coverage or your console access.
The live run must check both before it changes the server.
