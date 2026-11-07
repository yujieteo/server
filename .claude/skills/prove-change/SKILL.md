---
name: prove-change
description: Prove or disprove a server change with the gate, config replay, the local benchmark and the OpenBSD VM checks. Use after any change, and before you say a change is better.
user-invocable: true
---

# Prove a change

A claim that a change is better needs a number. Get the number first.

Run these, cheapest first. All of them cost nothing but time.

1. `./gate` runs the rules, the markdown grade, shellcheck, the evals and the context size check.
2. `sh evals/replay.sh` runs the configs of `install.sh` and compares them with `evals/golden`. It fails if an output changes. If the change is on purpose, read the diff, change the golden file, and give the reason in `REQUIREMENTS.md`.
3. `sh evals/bench.sh local` measures the deploy bytes against the limits in `evals/baseline.tsv`.
4. The CI `rebuild` job runs the full OpenBSD VM set on a fresh OpenBSD 8.0 VM. It covers install, old services, live WireGuard safety, file previews and OpenPGP lookup. Read that job for the full list.

Never run a paid model eval unless the author asks.
Say only what the output proves.
Tests are evals. Do not add native test files.
