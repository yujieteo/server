# Vision

## What this is

The config of the teoyujie.org server, kept as code. One run of `install.sh` turns a fresh OpenBSD 8.0 server into teoyujie.org. A second run changes nothing it should not change.

## Who it is for

One person, the author. The server serves the site and a few app pages, saves and reads the pond, relays the neuron rooms, forwards mail, and is a VPN with an ad blocker.

## What matters most

1. The VPN must never drop. WireGuard keeps its key and its peers through every install.
2. The OpenBSD config stays as the author wrote it. A rewrite must produce the same files, byte for byte.
3. The repo has no secret. The server makes its own keys, and they never leave it.
4. Less code is better. Plain shell, the base system only, no packages.

## What it does not do

- It does not run the fleet view. It is removed.
- It does not run femahoy. Its name and token are removed.
- It does not manage a second server.

## How we know it works

The evals in `evals/` prove each line of `REQUIREMENTS.md`. The config replay compares each config to `evals/golden`. A fresh OpenBSD 8.0 VM runs `install.sh` twice, then the checks of `test.sh`. The gate runs the rest.

## When it ends

`EXPIRY` holds the date. When it nears, check the OpenBSD release and the pinned tools, then move the date.
