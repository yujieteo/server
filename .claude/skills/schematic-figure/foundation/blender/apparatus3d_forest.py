# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_forest.py
import math
from dataclasses import dataclass, field
from typing import TypedDict, Unpack

from apparatus3d_core import Anchors, Built, Obj, Rng, Vec3
from apparatus3d_height import ground_z, river_y
from apparatus3d_tree import tree

Spot = tuple[float, float]
DEFAULT_CROWNS = ("#4f8a3c", "#3f7a45", "#5d9444", "#2f6b4a")


@dataclass(frozen=True)
class Avoid:
    terrain: Anchors | None = None
    river_half: float = 0.0
    boxes: tuple[tuple[float, float, float, float], ...] = field(default_factory=tuple)


class ForestOpts(TypedDict, total=False):
    kinds: tuple[str, ...]
    weights: tuple[float, ...] | None
    height: tuple[float, float]
    crown: tuple[str, ...]
    trunk: str
    min_dist: float | None
    avoid: Avoid | None


def blocked(avoid: Avoid | None, x: float, y: float) -> bool:
    if avoid is None:
        return False
    if avoid.terrain is not None and abs(y - river_y(avoid.terrain, x)) < avoid.river_half:
        return True
    return any(abs(x - cx) < hx and abs(y - cy) < hy for cx, cy, hx, hy in avoid.boxes)


def scatter(rr: Rng, region: tuple[float, float, float, float], n: int, kw: ForestOpts) -> list[Spot]:
    x0, x1, y0, y1 = region
    md = kw.get("min_dist") or 0.9 * math.sqrt((x1 - x0) * (y1 - y0) / max(n, 1))
    pts: list[Spot] = []
    tries = 0
    while len(pts) < n and tries < n * 200:
        tries += 1
        x, y = rr.uniform(x0, x1), rr.uniform(y0, y1)
        if blocked(kw.get("avoid"), x, y):
            continue
        if all((x - a) ** 2 + (y - b) ** 2 > md * md for a, b in pts):
            pts.append((x, y))
    return pts


def sort_back_to_front(pts: list[Spot]) -> list[Spot]:
    out: list[Spot] = []
    for p in pts:
        k = len(out)
        while k > 0 and out[k - 1][1] < p[1]:
            k -= 1
        out.insert(k, p)
    return out


def forest(
    region: tuple[float, float, float, float] = (-2, 2, -1, 1),
    n: int = 20,
    seed: int = 0,
    ground: Anchors | None = None,
    **kw: Unpack[ForestOpts],
) -> Built:
    rr = Rng(seed)
    pts = sort_back_to_front(scatter(rr, region, n, kw))
    objs: list[Obj] = []
    anchors = Anchors()
    kinds, weights, crowns = (
        kw.get("kinds", ("broadleaf", "conifer")),
        kw.get("weights"),
        kw.get("crown", DEFAULT_CROWNS),
    )
    cx = cy = cz = 0.0
    for i, (x, y) in enumerate(pts):
        z = ground_z(ground, x, y) if ground else 0.0
        kind = rr.choices(kinds, weights=weights)[0] if weights else rr.choice(kinds)
        height = rr.uniform(*kw.get("height", (0.45, 0.75)))
        tree_loc: Vec3 = (x, y, z - 0.01)
        o, a = tree(
            tree_loc,
            seed * 1000 + i,
            kind=kind,
            height=height,
            crown=rr.choice(crowns),
            trunk=kw.get("trunk", "#6b4f3a"),
        )
        objs += o
        anchors[f"tree{i}"] = a["top"]
        cx, cy, cz = cx + x, cy + y, cz + a["top"][2]
    if pts:
        anchors["forest"] = (cx / len(pts), cy / len(pts), cz / len(pts))
    return objs, anchors
