---
name: start
description: Start a new project from this starter. Question the requirements, write VISION.md, pick a language, then run the gate. Use first in every new project.
user-invocable: true
---

# Start a new project

Use this skill when the author points you at this starter to build a new project.
Do the steps in order. Do not skip one.

1. Run the `question-requirements` skill on what the author wants. Show the author what you cut.
2. Run the `vision` skill. It writes VISION.md for the new project.
3. Pick a language. Show these four, in this order, and say which one you suggest and why.
   1. Go
   2. TypeScript
   3. Python
   4. Rust
4. Check the exceptions.
   - Use Nix for pins.
   - Use Swift for iOS and macOS apps.
   - Use Shell for a command line tool, and for any task where shell is the best and fastest tool.
5. Make the project. Run `bin/new TARGET LANG`. It copies the rules, the evals and the skills. It sets the expiry date three months out.
6. In the new project, run `./gate`. Fix what it finds. Do not turn a check off.
7. For a screen or a figure, use the `site-design` skill and the Emil Kowalski skills first.
8. Tell the author how to prove a change: the `prove-change` skill.

Keep the project small. Less code is better.
