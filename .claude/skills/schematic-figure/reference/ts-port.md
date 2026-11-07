# TypeScript port: what changed in the API

The engine, the demos and the tools are strict TypeScript. Bun bundles the engine and your figure at render time. Run tools with `bun tools/<name>.ts`. A figure is a `.ts` file with `export const figure` and `export default function draw(F: Figure): void`. Import the library with `import * as L from '../engine/lib.ts'`. The `L` argument is gone.

The repo bans function values. An option that took a function now takes data, and a returned closure is now data plus a named function.

| Old | New |
| --- | --- |
| plot series `fn` | `curve`: `expDecay`, `line` or `gauss` spec, or points from `linspace` |
| `X(v)`, `Y(v)` from `plot` | `scaleAt(X, v)` |
| `proj(x, y, z)` | `isoPt(proj, x, y, z)`, `projPt(P, x, y, z)` |
| `chip.U(u, v)` | `chipPoint(chip, u, v)` |
| `matrix` fn(i, j) | `values: number[][]` |
| `cacheGrid` cell callback | `cells` grid, `cacheCell(G, r, c)` |
| `tannerLattice` node and edge callbacks | `nodes`, `hEdges`, `vEdges` grids |
| `molecule().A(i)` | `molPoint(m, i)` |
| `curveArrow` `B(t)` | `bezierAt(ctrl, t)` |
| `box.corner(...)` | `boxCorner(box, fx, fy, fz)` |
| `fitArt` callback | `fitProbe`, then `fitPlace` |
| `tilePlate3` tile callback | `manual: true`, then `tilePlateDraw` |
| `beamPath().at(f)` | `beamPathAt(bp, f)` |
| `rng(seed)()` | `nextRand(rng(seed))` |

Other changes:
- `F.panel` takes `labelPrefix` and `labelSuffix`, not `labelFormat`.
- `--fig "demo/patent.ts?sheet=2"` is not supported by the bundler yet.
- The `figure3d` demo needs the Blender art `demo/art/chip.png`, which the repo does not ship.
