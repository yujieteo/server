# Agents

This repository is the config of the teoyujie.org server (OpenBSD). Read `VISION.md` and `REQUIREMENTS.md` first. Never run `apply` or touch the live server unless the author asks. Keep the WireGuard config as it is.

1. A config change must keep `evals/golden` equal to `install.sh`. Explain each difference in `REQUIREMENTS.md`.
2. Run `./gate` before you say you are done. Never turn a check off.
3. Less code is better. Delete before you add.
4. No comments. Make the code say it. Allowed: a shebang, a source credit, a build directive.
5. No function values, no callbacks. Max 350 lines a file, 35 lines a function.
6. No native tests. Tests are evals in `evals/`.
7. Hot code goes in `.hot.go`, `.hot.ts` or `.hot.rs`. It must not allocate. Python has no hot files.
8. Prove a change with the `prove-change` skill. Model evals cost money: run them only when the author asks.
9. Markdown must grade under 4.0. Use short words.
10. `EXPIRY` is a date three months out. A late date only warns. Rethink the playbook, or rebuild.
11. Design work uses the `site-design` skill and the Emil Kowalski skills.
