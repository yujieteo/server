# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_bed.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
import numpy as np
from device3d_field import Ball, Surface, make_blob, surface_z
from device3d_mat import material, shade
from device3d_mesh import Buf, buf_add, buf_obj, buf_solid, ico_tpl, with_prefix
from device3d_prim import slab, tube
from device3d_types import Anchors, PtLike, Spec, Vec2, Vec3

BATCHES = 12
CLUSTERS = 3
SHADES = 5
BINDER_NEAR = 1.35
MIN_ELEVATION = 1e-3


class BedOpts(TypedDict, total=False):
    size: Vec3
    n: int
    radius: Vec2
    seed: int
    color: str
    kind: str
    noise: float
    color_jitter: float
    shell: Spec | None
    carbon: Spec | None
    binder: Spec | None
    foil: Spec | None
    loc: Vec3
    prefix: str


@dataclass(frozen=True)
class Drop:
    w: float
    d: float
    floor: float | Surface
    height: float | None = None
    near: Vec2 | None = None
    spread: float = 0.0
    tries: int = 40
    pick: int = 1


@dataclass(frozen=True)
class Bed:
    w: float
    d: float
    h: float
    loc: Vec3
    ox: np.ndarray
    z0: float


def landing(cfg: Drop, rng: np.random.Generator, r: float) -> Vec2 | None:
    if cfg.near is not None:
        x = cfg.near[0] + rng.normal() * cfg.spread
        y = cfg.near[1] + rng.normal() * cfg.spread
    else:
        x, y = rng.uniform(-cfg.w / 2 + r, cfg.w / 2 - r), rng.uniform(-cfg.d / 2 + r, cfg.d / 2 - r)
    if abs(x) > cfg.w / 2 - r or abs(y) > cfg.d / 2 - r:
        return None
    return x, y


def rest_height(cfg: Drop, placed: list[Ball], spot: Vec2, r: float) -> float:
    x, y = spot
    z = (surface_z(cfg.floor, x, y) if isinstance(cfg.floor, Surface) else cfg.floor) + r
    for px, py, pz, pr in placed:
        dx = math.hypot(px - x, py - y)
        s = pr + r
        if dx < s:
            z = max(z, pz + math.sqrt(s * s - dx * dx))
    return z


def drop_one(cfg: Drop, rng: np.random.Generator, placed: list[Ball], r: float) -> Ball | None:
    best: Ball | None = None
    got = 0
    for _ in range(cfg.tries * cfg.pick):
        spot = landing(cfg, rng, r)
        if spot is None:
            continue
        z = rest_height(cfg, placed, spot, r)
        if cfg.height is None or z + r <= cfg.height:
            if best is None or z < best[2]:
                best = (spot[0], spot[1], z, r)
            got += 1
            if got >= cfg.pick:
                break
    return best


def drop(items: list[float], cfg: Drop, rng: np.random.Generator, placed: list[Ball]) -> list[Ball]:
    out: list[Ball] = []
    for r in items:
        best = drop_one(cfg, rng, placed, r)
        if best is not None:
            placed.append(best)
            out.append(best)
    return out


def carbon_clusters(
    bed: Bed,
    rng: np.random.Generator,
    parts: list[Ball],
    placed: list[Ball],
    carbon: Spec,
) -> list[Ball]:
    cn = carbon.get("n", 300)
    cr = carbon.get("r", 0.025)
    found: list[Ball] = []
    for _ in range(CLUSTERS):
        c = parts[rng.integers(len(parts))]
        sizes = [cr * rng.uniform(0.7, 1.3) for _ in range(max(1, cn // (BATCHES * 3)))]
        cfg = Drop(bed.w, bed.d, bed.z0, height=bed.h + bed.z0, near=(c[0], c[1]), spread=cr * 2.5, pick=4)
        found += drop(sizes, cfg, rng, placed)
    return found


def fill_bed(bed: Bed, rng: np.random.Generator, opts: BedOpts) -> tuple[list[Ball], list[Ball]]:
    n = opts.get("n", 180)
    radius = opts.get("radius", (0.1, 0.2))
    carbon = opts.get("carbon")
    radii = [float(v) for v in rng.uniform(radius[0], radius[1], n * 3)]
    placed: list[Ball] = []
    parts: list[Ball] = []
    blacks: list[Ball] = []
    for bi in range(BATCHES):
        chunk = radii[bi * len(radii) // BATCHES : (bi + 1) * len(radii) // BATCHES]
        parts += drop(chunk, Drop(bed.w, bed.d, bed.z0, height=bed.h + bed.z0, pick=10), rng, placed)
        if carbon is not None and parts:
            blacks += carbon_clusters(bed, rng, parts, placed, carbon)
        if len(parts) >= n:
            break
    return parts, blacks


def particle_objects(bed: Bed, rng: np.random.Generator, parts: list[Ball], opts: BedOpts) -> list[bpy.types.Object]:
    jitter = opts.get("color_jitter", 0.08)
    shell = opts.get("shell")
    shades = [shade(opts.get("color", "#6f8fb0"), float(f)) for f in np.linspace(-jitter, jitter, SHADES)]
    bufs = [Buf() for _ in shades]
    sbuf = Buf()
    tpl = ico_tpl(3)
    for x, y, z, r in parts:
        ctr = np.array([x, y, z])
        verts, faces = make_blob(tpl, ctr, r, rng, opts.get("noise", 0.06))
        buf_add(bufs[rng.integers(len(shades))], verts + bed.ox, faces)
        if shell is not None:
            buf_add(sbuf, (verts - ctr) * (1 + shell.get("t", 0.02) / r) + ctr + bed.ox, faces)
    kind = opts.get("kind", "ceramic")
    made = [buf_obj(b, "particles", material(kind, c)) for c, b in zip(shades, bufs, strict=True)]
    objs = [o for o in made if o is not None]
    if shell is not None:
        objs.append(
            buf_solid(
                sbuf, "shells", material(shell.get("kind", "coat"), shell.get("color", "#f0c987"), shell.get("alpha"))
            )
        )
    return objs


def front_ball(parts: list[Ball]) -> Ball:
    best = parts[0]
    for p in parts[1:]:
        if p[1] - 0.6 * p[2] - 0.2 * p[0] < best[1] - 0.6 * best[2] - 0.2 * best[0]:
            best = p
    return best


def carbon_object(
    bed: Bed,
    rng: np.random.Generator,
    blacks: list[Ball],
    carbon: Spec | None,
) -> tuple[bpy.types.Object, Vec3] | None:
    lifted = [b for b in blacks if b[2] - b[3] > bed.z0 + MIN_ELEVATION]
    if not lifted:
        return None
    cb = Buf()
    tpl = ico_tpl(2)
    for x, y, z, r in lifted:
        verts, faces = make_blob(tpl, np.array([x, y, z]), r, rng, 0.15)
        buf_add(cb, verts + bed.ox, faces)
    obj = buf_solid(cb, "carbon", material("carbon", (carbon or {}).get("color", "#3a3a3d")))
    g = lifted[0]
    for p in lifted[1:]:
        if p[2] - 2 * p[1] > g[2] - 2 * g[1]:
            g = p
    return obj, (bed.loc[0] + g[0], bed.loc[1] + g[1], bed.loc[2] + g[2] + g[3])


def binder_near(centres: np.ndarray, radii: np.ndarray, i: int, j: int) -> bool:
    reach = float(radii[i] + radii[j])
    return reach * 1.0 < float(np.linalg.norm(centres[i] - centres[j])) < reach * BINDER_NEAR


def binder_pairs(centres: np.ndarray, radii: np.ndarray) -> list[tuple[int, int]]:
    n = len(centres)
    return [(i, j) for i in range(n) for j in range(i + 1, n) if binder_near(centres, radii, i, j)]


def binder_picks(
    pairs: list[tuple[int, int]],
    centres: np.ndarray,
    count: int,
    rng: np.random.Generator,
) -> list[tuple[int, int]]:
    scored = [
        (float(-(centres[i, 2] + centres[j, 2]) + 1.5 * (centres[i, 1] + centres[j, 1])), n, (i, j))
        for n, (i, j) in enumerate(pairs)
    ]
    scored.sort()
    ordered = [s[2] for s in scored]
    return ordered[: count // 2] + [ordered[int(k)] for k in rng.permutation(len(ordered))[: count // 2]]


def binder_ends(
    centres: np.ndarray,
    radii: np.ndarray,
    link: tuple[int, int],
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    i, j = link
    u = (centres[j] - centres[i]) / np.linalg.norm(centres[j] - centres[i])
    side = np.cross(u, rng.normal(size=3))
    side /= np.linalg.norm(side)
    ea = centres[i] + (u * 0.9 + side * 0.4) / np.linalg.norm(u * 0.9 + side * 0.4) * radii[i] * 0.97
    eb = centres[j] + (-u * 0.9 + side * 0.4) / np.linalg.norm(-u * 0.9 + side * 0.4) * radii[j] * 0.97
    mid = (ea + eb) / 2 + np.array([0, 0, -0.25 * np.linalg.norm(eb - ea)])
    return ea, mid, eb


def binder_objects(
    bed: Bed,
    rng: np.random.Generator,
    parts: list[Ball],
    binder: Spec,
) -> tuple[list[bpy.types.Object], np.ndarray | None]:
    centres = np.array([[p[0], p[1], p[2]] for p in parts])
    radii = np.array([p[3] for p in parts])
    m = material("polymer", binder.get("color", "#efe9da"), alpha=binder.get("alpha", 1.0), rough=0.55)
    picks = binder_picks(binder_pairs(centres, radii), centres, binder.get("n", 60), rng)
    objs: list[bpy.types.Object] = []
    best: np.ndarray | None = None
    for link in picks:
        ea, mid, eb = binder_ends(centres, radii, link, rng)
        objs.append(
            tube(
                [ea + bed.ox, mid + bed.ox, eb + bed.ox],
                binder.get("r", 0.012),
                m,
                name="binder",
                radii=[1.6, 0.8, 1.6],
            )
        )
        if best is None or float(mid[2] - 2 * mid[1]) > float(best[2] - 2 * best[1]):
            best = mid
    return objs, None if best is None else best + bed.ox


def foil_part(foil: Spec, size: Vec3, loc: Vec3) -> tuple[bpy.types.Object, Vec3, float]:
    ft = foil.get("t", 0.06)
    mg = foil.get("margin", 0.1)
    w, d, _ = size
    obj = slab(
        (w + 2 * mg, d + 2 * mg, ft),
        (loc[0], loc[1], loc[2] + ft / 2),
        material(foil.get("kind", "aluminium"), foil.get("color")),
        bevel=0.01,
    )
    return obj, (loc[0] + w / 2, loc[1] - d / 2 - mg, loc[2] + ft / 2), ft


def particle_bed(**opts: Unpack[BedOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    rng = np.random.default_rng(opts.get("seed", 0))
    size = opts.get("size", (3.0, 2.0, 0.9))
    loc = opts.get("loc", (0, 0, 0))
    objs: list[bpy.types.Object] = []
    anchors: dict[str, PtLike] = {}
    z0 = 0.0
    foil = opts.get("foil")
    if foil is not None:
        part, anchors["foil"], z0 = foil_part(foil, size, loc)
        objs.append(part)
    bed = Bed(size[0], size[1], size[2], loc, np.asarray(loc, float), z0)
    parts, blacks = fill_bed(bed, rng, opts)
    objs += particle_objects(bed, rng, parts, opts)
    fx, fy, fz, fr = front_ball(parts)
    anchors["particle"] = (loc[0] + fx, loc[1] + fy, loc[2] + fz + fr * 0.9)
    if opts.get("shell") is not None:
        anchors["shell"] = (loc[0] + fx + fr * 0.7, loc[1] + fy - fr * 0.3, loc[2] + fz + fr * 0.75)
    carbon_part = carbon_object(bed, rng, blacks, opts.get("carbon"))
    if carbon_part is not None:
        objs.append(carbon_part[0])
        anchors["carbon"] = carbon_part[1]
    binder = opts.get("binder")
    if binder is not None:
        made, found = binder_objects(bed, rng, parts, binder)
        objs += made
        if found is not None:
            anchors["binder"] = found
    anchors["top"] = (loc[0], loc[1], loc[2] + z0 + max(p[2] + p[3] for p in parts))
    anchors["front"] = (loc[0] + size[0] / 2, loc[1] - size[1] / 2, loc[2] + z0 + size[2] * 0.4)
    return objs, with_prefix(opts.get("prefix", ""), anchors)
