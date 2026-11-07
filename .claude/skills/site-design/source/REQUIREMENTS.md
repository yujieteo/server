# Site requirements

Agreed with the owner on 2026-10-18.
When the site and this file disagree, change the site.
The beam tool's own requirements are in `beamdiag/REQUIREMENTS.md`.

## Purpose

1. The site does five jobs only:
   - show the identity of Yu Jie Teo through a small, hand-picked collection of explorations
   - host the privacy and support pages of Lullapixie and Marklove
   - host the beam diagram tool
   - publish the OpenPGP public key of <contact@teoyujie.org> at `/contact.asc`
   - publish it for WKD at `/.well-known/openpgpkey/` (direct method) and `/.well-known/openpgpkey/teoyujie.org/`
     (advanced method, served at openpgpkey.teoyujie.org)
   - publish the log at `/log`: the media entries from the pond app, newest first, with RSS at
     `/log/feed.xml`. The server makes both at request time from its entry store and
     `public/log/template.html`. The entries go in place of `<!-- pond:entries -->`.
     `media-plan.md` is the master copy of the media plan, and the app edits it.
   Reason: the captain approved the pond design on 2026-10-28.
2. An exploration is an experiment or an essay on this site, or a project in its own repository.
   A project is a link to its repository and one line of text: the site copies nothing from it.
   The exceptions are the experiment pages `/play/goosestrike/`, `/play/theorem-explorer/`,
   `/play/theorem-learner/`, `/play/neurons/` and `/play/marklove/`, each copied from its repository.
   `/play/neurons/` gets the model weights from huggingface.co when the visitor loads them.
   The server never hosts the weights.
   Reason: the captain asked for the neuron explorer under Play on 2026-10-28.
   Reason for `/play/marklove/`: the captain asked for the Marklove web build under Play on 2026-10-29.
   Essays are optional. There is no CMS, database, GitHub API feed, automatic ranking, scheduled
   sync or publishing schedule. The one exception is the store of signed log entries on the server.
   The server repository owns the room relay of `/play/neurons/`.
   The site stays complete with no new content.
   Reason: the captain approved the pond design on 2026-10-28.

## URLs

1. The URLs in `fixed-urls.txt` always work and never change. `scripts/check.sh` and
   `scripts/deploy.sh` read the file.
2. The home page `/` has the layout of the emilkowal.ski home page. The header has the name
   "Yu Jie Teo" and the tagline "Mechanical Engineer" under it, with no nav. Then come the sections
   "Today" (one short paragraph), "Explorations" and "Log" (one link to `/log`).
   Each exploration is one `<li>` in `public/index.html`: to add or remove one, change
   only that entry. The footer links the policy and support pages. It has one line with
   <contact@teoyujie.org>, a link to its key and the key fingerprint. It also has one line with GitHub.
   Reason: on 2026-10-29 the captain asked for the owner name and a tagline that says who the owner is.
   The captain also asked for a Today section, and for Explorations, Log and GitHub out of the header.
   Reason for "Log": the captain approved the pond design on 2026-10-28.
3. Every other old URL returns 404.

## Look

1. The site has the look of emilkowal.ski, light only. The tokens, column width, fonts and interaction rules are in
   `/shared/kowalski.css`. This URL does not change: the tools link it when they move to the look.
   All pages use the stylesheet `public/style.css`, which imports it, and have the header and footer
   of the home page. Hover styles apply only under `(hover: hover) and (pointer: fine)`.
   Reason: the captain chose mockup A of the design board and asked for his interaction rules in one
   shared stylesheet on 2026-10-29.
   The exceptions are the tools under `/play/`. `/play/marklove/` is a full-screen editor without the
   site header and footer.
   Reason: the site header and footer take the space of the editor.
   It links `/shared/kowalski.css` and uses his interaction rules. It keeps its document themes, dark
   themes included: the rule below of no themes and no dark mode is not for its documents.
   Reason: the captain asked for his interaction rules on all pages, Marklove included, on 2026-10-29
   (marklove-web PR <https://github.com/yujieteo/marklove-web/pull/3>).
   There are no themes and no dark mode. There is no art or animation on the home page.
   Reason: the captain asked to remove the animation from the home page on 2026-10-29.
2. Each policy and support page is plain HTML of 6000 bytes or fewer. `scripts/check.sh` measures it.
   Reason: a page that is too big is a wrong-result fault the check can find. The largest page is 5551 bytes.

## Build and deploy

1. Only the beam page and the wallpaper module have a build. There is no CI.
   Reason: the owner declined CI.
   Reason for the wallpaper build: on 2026-11-02 the captain asked for a wallpaper maker with "code to be in Goose -> C -> wasm".
2. The beam page is the build of `beamdiag/` into `public/play/beamdiag/`, and an agent commits it.
   `scripts/build-wallpaper.sh` builds `wallpaper/` into `public/play/wallpaper/wallpaper.wasm.gz`, and an agent commits the module with `wallpaper/wasm.sha256`. `scripts/check.sh` fails when the hash differs from the sources.
   Reason: a module older than its sources deploys wrong wallpapers, and the check costs one hash.
3. To deploy, an agent commits to `main`, turns on the VPN and runs `scripts/deploy.sh`. It runs
    `scripts/check.sh`, replaces the site on the server with `public/` and tests the URLs. The deploy
    stops if the check fails.

## Guardrails

1. `scripts/check.sh` fails on these:
   - a comment in `scripts/*.sh`, `wallpaper/` and the sources of `beamdiag/`
   - a TypeScript comment with no `https://` source
   - `any`, a non-null assertion, a cast or a type argument on a DOM query in the TypeScript
   - a type error (`tsc --noEmit`, strict, `noUncheckedIndexedAccess`)
   - an unreferenced TypeScript file, export or dependency (`knip`)
   - a home page first load over 100 KB gzipped (102400 bytes, and 93332 on 2026-11-03)
   - a beam page first load over 590 KB gzipped (604160 bytes, and 603514 on 2026-11-03)
   - `bun test` or `beamdiag/test.goose` fails

   The home budget is the first load rounded up to the next 10 KB, until the owner sets one. The beam budget uses the same rule.
   The beam first load is the gzipped page, its stylesheets and fonts, KaTeX with all its font files (the most a browser
   downloads) and `beamdiag.wasm.gz`. The report fonts load on a save, and the budget does not count them.
   Source credits stay as comments: Sonner, Roark and Dekker in `beamdiag/`, Oklab and splitmix64 in `wallpaper/`. They are attribution notices for copied formulas and constants, like licence headers, and the exception list is in `scripts/check.sh`. The pages copied from other
   repositories, `beamdiag/c/` (made by Goose) and the KaTeX files are not in the comment rule.
   Reason: the captain asked for the guardrails pass on 2026-11-03, and for a separate beam page limit and fewer beam comments the same day.
   Reason for TypeScript, Bun and the replay: on 2026-11-03 the captain asked that everyone uses Bun.
   The captain also asked that everything that can be type checked is type checked, with process replay.
   `scripts/check.sh --replay` replays the inputs of `bun test` on `main` and on `HEAD` and fails on a difference unless you give `--accept`. It is a local command and not in CI.
   Reason for the sanitizers: `beamdiag/c/test.c` runs under ASan and UBSan. The alignment check is off, because Goose makes 73-byte packed nodes with 8-byte stores, until someone fixes Goose.
   Reason for the test: it holds the wallpaper pixels for one seed, so a rename or a rebuild cannot change them.
   Reason for the beam test: on 2026-11-03 the captain ruled that the facts of the removed beam comments go into code that runs.
   They do not go into a README. The test also holds the solver to the frozen exact answers in `reference.json` and `random.json`.
