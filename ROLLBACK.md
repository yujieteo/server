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

1. Get consent for the checks, the stop and start, the checkpoint, and the install.
2. Open the host's web console. Test a local admin login and root access there. Keep it open. SSH through the VPN is not a recovery path.
3. List all disks and mounts in the console with `sysctl hw.disknames`, `mount` and `cat /etc/fstab`. Note each disk, its mount, and what holds mail, site data and home dirs. Include each one in the checkpoint. If any disk has no full restore path, stop.
4. Pause all writers and jobs. Halt the server from the console with `shutdown -hp now`. Wait for it to stop. Make a full checkpoint of each disk at the host. Wait for each one to finish. Note the disk ids, checkpoint ids and restore steps. A live file copy or a source archive is not enough.
5. Start the server. Check the console, VPN, mail and site. Do not resume other writes or jobs yet. Run `./apply --check ADMIN_USER@10.8.0.1` on the desktop. A failed check means stop.
6. Read the diff from the check before you approve the install. With the same source and settings, run `./apply --install CHECKPOINT_ID ADMIN_USER@10.8.0.1`. This id is your receipt, not a host API check. The script cannot prove that a checkpoint exists or covers all disks.
7. Run `./apply --test ADMIN_USER@10.8.0.1`, then `sh test.sh --outside`. Check the console, VPN, site and mail. Keep the checkpoint until these checks pass. Then resume jobs and writes.

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

A disposable OpenBSD VM can prove the disk restore method.
It cannot prove your host's checkpoint coverage or your console access.
The live run must check both before it changes the server.
