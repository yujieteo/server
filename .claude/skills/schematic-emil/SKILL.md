---
name: schematic-emil
description: Draw a scientific schematic figure or a patent drawing sheet in the look of Emil Kowalski (emilkowal.ski) for a blog post, a paper, a slide or a patent. It runs the upstream schematic-figure or patent-drawing skill with this style. Use when the user asks for schematic-emil by name.
---

# Schematic figure in the Emil Kowalski style

This skill is a style for two upstream skills. It does not copy or change them.

- Upstream: [lgwrightlab/schematic-figure](https://github.com/lgwrightlab/schematic-figure) by Jinchen Zhao and Logan Wright (LGW Lab, Yale University), MIT licence. Blog post: [Schematic figure](https://lgwrightlab.github.io/schematic-figure/).
- Pinned commit: `09d8b6e98d04b91de6e8b6632b3356b9fc237417` (2026-10-14). Install its `schematic-figure` and `patent-drawing` skills unchanged.
- Style values: copied from the CSS that [emilkowal.ski](https://emilkowal.ski) serves, and from Radix Colors 3.0.0 (the family of the site gray).
- Font: Inter 4.1 (`fonts/InterVariable.woff2`), SIL Open Font License 1.1 (`fonts/LICENSE.txt`).

## Invoke

```text
/schematic-emil <request> [venue: web | journal | slide | poster | patent] [animate]
```

If the request names no venue, infer it: a blog post is `web`, a paper is `journal`, a talk is `slide`, a patent is `patent`.

## Process

1. Run the upstream `schematic-figure` skill with `style=schematic-emil`. For a patent sheet, run the upstream `patent-drawing` skill. Keep all upstream steps, options and defaults (also depth `full`).
2. Copy `style.ts` to `figure/emil.ts` and `tokens.ts` to `figure/tokens.ts`; the render step bundles them. Copy `fonts/` to `figure/fonts/`. Run the upstream tools with `--root <project>`.
3. In `figure/figure.js`, call `E.useEmil(F, L, venue)` first in `draw()`. It sets the font, the gray and colour tokens, the text sizes and the line weights for the venue. It returns `{s, r, line, text}`: the scale, the corner radii in pt, and the sizes.
4. Draw with the tokens in `tokens.ts` (`style.ts` exports them). Do not write a hex value that is not a token.
5. Run the upstream gate, `bun tools/check.ts --root <project> --fig figure/figure.js`. A FAIL stops delivery.

## Style rules

- Font: Inter for all text. `useEmil` loads it and sets the site font features `"cv01", "ss03"`. Use weight 500 (`E.weight.name`) for the name of a part, 400 for other text, and 600 for a title.
- Gray first: draw most marks in the 12-step gray (`E.gray[100]` to `E.gray[1200]`). Background 100, text 1200, secondary text 1100, lines and outlines 700 to 900.
- Colour: add a colour only where a part must look different from the other parts. Use as many hues as the figure needs, from `E.hue` (blue, sky, grass, amber, orange, tomato, violet). Step 3 is an area tint, step 7 an outline, step 9 a solid mark, step 11 a line or a label. Text on a step 9 solid mark uses `E.onSolid[hue]` (white on blue, grass, orange, tomato and violet, gray 1200 light on sky and amber). It has the same value in light and dark mode, as step 9 does.
- Cards: a box is a card: fill gray 100, a 1 px ring in gray 400, and 12 px corners (`E.card(r.card)`). A small tag has 6 px corners (`r.chip`). Fill a card with a step 3 tint and outline it with step 7 only when it must stand out.
- Lines: borders are 1 px (`line.thin`). A main stroke is 2 px (`line.bold`). Use no shadows, gradients or glows. An upstream part that has a gradient (for example `L.laser` or `L.camera`) does not have the site look: draw a card in its place.
- Text: labels are 14 px and secondary text is 12 px. The site makes a heading with weight, not with size. Do not make a label larger to show that it is important.
- Space: keep the site's open layout: 16 px padding in a card and 24 px between groups.
- Venue rules win: the size, minimum text size, line weight and resolution come from the upstream format table (`reference/style.md`). `useEmil` scales the site px to each venue. The 14 px label becomes 7 pt in a journal, 18 pt on a slide and 28 pt on a poster. A web figure uses the journal scale: draw it 120 mm wide and show it at 100% of a 640-700 px column.

## Web output

- Call `E.emilTheme(F)` last in `draw()`. Each colour becomes `var(--color-<token>, <light value>)`. The gray names are the names that the site uses (`--color-gray-1200`).
- Dark mode: put the SVG inline in the page. It then takes the colour tokens of the page, and it switches under a `.dark` class. A standalone SVG switches with `prefers-color-scheme`. A standalone SVG in an `<img>` cannot load Inter, so it shows the system font.
- Static by default: the option `animate` calls `E.emilTheme(F, { animate: true })`. The panels then come in one after the other. Each panel moves 4 px and fades in, in 300 ms, with a 60 ms stagger and the ease-out curve of `emil-design-eng`. Read the installed `emil-design-eng` skill before you add or change a motion. No motion occurs under `prefers-reduced-motion: reduce`. The PNG and the PDF show the end state.
- Papers, slides and patents stay light.

## Patent sheets

Make two versions of each sheet from one figure file. Use a query on the figure path to select the version:

```js
import * as E from './emil.ts';
const COLOUR = /[?&]v=colour/.test(import.meta.url);
export const figure = E.patentFigure({ sheet: 'letter', sheetId: '1/1', name: 'fig1' }, COLOUR);
export default function draw(F, L) {
  E.useEmil(F, L, COLOUR ? 'patent-colour' : 'patent');
}
```

Draw into `F.drawing` after `useEmil`, as patent-drawing step 4 says.

- Version 1, colour (`--fig "figure/figure.js?v=colour"`): this style at the patent sizes, for the user's own use. Give each part a step 3 fill. The gate checks it with the slide rules (text 14 pt or more).
- Version 2, filing (`--fig figure/figure.js`): black and white with no gray fill, under 37 CFR 1.84. The upstream patent profile and the patent gate apply. Only the font changes to Inter.
- Reason: 37 CFR 1.84 accepts colour only after a petition, and the EPO and the PCT do not accept colour.

## Generated images

All vector marks and labels stay in code. If a figure needs a raster image, such as a texture, ask Codex to make it:

```sh
codex exec "<prompt>"
```

Put the style rules in the prompt: the gray background, the hues from `E.hue`, flat shapes with no shadow. Place the image with `L.image` and label it in vector.
