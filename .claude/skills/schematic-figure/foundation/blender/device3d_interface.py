# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_interface.py
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
import numpy as np
from device3d_bed import Drop, drop
from device3d_field import Ball, Field, Surface, field_at_grid, field_at_point, make_blob, make_field, surface_top
from device3d_mat import material
from device3d_mesh import Buf, MeshOpts, add_sphere, buf_add, buf_obj, buf_solid, ico_tpl, make_object, with_prefix
from device3d_prim import slab, tube
from device3d_types import Anchors, Faces, PtLike, Spec, Vec2, Vec3

STEPS = 7
MAX_CHILDREN = 2
COAT_LIFT = 0.002
ROOT_SINK = 0.01


class InterfaceOpts(TypedDict, total=False):
    size: Vec2
    thickness: float
    seed: int
    roughness: float
    substrate: Spec | None
    coating: Spec | None
    deposit: Spec | None
    electrolyte: Spec | None
    res: tuple[int, int]
    loc: Vec3
    prefix: str


@dataclass(frozen=True)
class Grid:
    x: np.ndarray
    y: np.ndarray
    zb: np.ndarray
    zt: np.ndarray


@dataclass(frozen=True)
class Seed:
    start: np.ndarray
    direction: np.ndarray
    length: float
    radius: float
    depth: int


@dataclass
class Branch:
    seed: Seed
    pts: list[np.ndarray]
    children: int = 0


@dataclass
class Growth:
    objs: list[bpy.types.Object]
    tips: list[np.ndarray]


@dataclass(frozen=True)
class Deposit:
    rng: np.random.Generator
    ox: np.ndarray
    mat: bpy.types.Material
    size: Vec2
    surface: Surface
    spec: Spec


def grid_index(nx: int, ny: int, layer: int, i: int, j: int) -> int:
    return layer * nx * ny + i * nx + j


def grid_faces(nx: int, ny: int) -> Faces:
    faces: Faces = []
    for i in range(ny - 1):
        for j in range(nx - 1):
            faces.append(
                (
                    grid_index(nx, ny, 1, i, j),
                    grid_index(nx, ny, 1, i, j + 1),
                    grid_index(nx, ny, 1, i + 1, j + 1),
                    grid_index(nx, ny, 1, i + 1, j),
                )
            )
            faces.append(
                (
                    grid_index(nx, ny, 0, i, j),
                    grid_index(nx, ny, 0, i + 1, j),
                    grid_index(nx, ny, 0, i + 1, j + 1),
                    grid_index(nx, ny, 0, i, j + 1),
                )
            )
    return faces


def wall_paths(nx: int, ny: int) -> list[list[tuple[int, int]]]:
    return [
        [(0, j) for j in range(nx)],
        [(i, nx - 1) for i in range(ny)],
        [(ny - 1, j) for j in range(nx - 1, -1, -1)],
        [(i, 0) for i in range(ny - 1, -1, -1)],
    ]


def heightfield_solid(hf: Grid, mat: bpy.types.Material, name: str = "hf") -> bpy.types.Object:
    ny, nx = hf.x.shape
    verts: list[Vec3] = []
    for z in (hf.zb, hf.zt):
        verts += [(float(a), float(b), float(c)) for a, b, c in zip(hf.x.ravel(), hf.y.ravel(), z.ravel(), strict=True)]
    faces = grid_faces(nx, ny)
    for wall in wall_paths(nx, ny):
        o = len(verts)
        for z in (hf.zb, hf.zt):
            verts += [(float(hf.x[i, j]), float(hf.y[i, j]), float(z[i, j])) for i, j in wall]
        m = len(wall)
        faces += [(o + k, o + k + 1, o + m + k + 1, o + m + k) for k in range(m - 1)]
    return make_object(name, verts, faces, mat, MeshOpts(smooth=True, sharp=60, merge=False))


def sprout(dep: Deposit, out: Growth, seed: Seed) -> Branch:
    p = seed.start
    d = seed.direction
    pts = [p]
    for _ in range(STEPS):
        d = d + dep.rng.normal(size=3) * 0.45
        d[2] = abs(float(d[2])) + 0.35
        d = d / np.linalg.norm(d)
        p = p + d * seed.length / STEPS
        pts.append(p)
    rr = [float(v) for v in np.linspace(1.0, 0.4, len(pts))]
    out.objs.append(tube([q + dep.ox for q in pts], seed.radius, dep.mat, name="dendrite", radii=rr))
    tip = Buf()
    add_sphere(tip, p + dep.ox, seed.radius * 0.42)
    out.objs.append(buf_solid(tip, "tip", dep.mat))
    out.tips.append(p)
    return Branch(seed, pts)


def child_seed(dep: Deposit, parent: Branch) -> Seed:
    i = int(dep.rng.integers(2, STEPS))
    base = np.array(parent.pts[i])
    nd = dep.rng.normal(size=3)
    nd[2] = abs(float(nd[2])) * 0.5 + 0.25
    length = parent.seed.length * dep.rng.uniform(0.3, 0.5)
    radius = parent.seed.radius * (1 - i / STEPS * 0.6) * 0.7
    return Seed(base, nd / np.linalg.norm(nd), length, radius, parent.seed.depth + 1)


def dendrite(dep: Deposit, seed: Seed) -> Growth:
    out = Growth([], [])
    stack = [sprout(dep, out, seed)]
    while stack:
        top = stack[-1]
        if top.seed.depth >= dep.spec.get("branching", 1) or top.children >= MAX_CHILDREN:
            _ = stack.pop()
            continue
        top.children += 1
        stack.append(sprout(dep, out, child_seed(dep, top)))
    return out


def dendrite_field(dep: Deposit) -> tuple[list[bpy.types.Object], np.ndarray | None]:
    w, d = dep.size
    rng = dep.rng
    objs: list[bpy.types.Object] = []
    best: np.ndarray | None = None
    for _ in range(dep.spec.get("n", 9)):
        x0, y0 = rng.uniform(-w * 0.42, w * 0.42), rng.uniform(-d * 0.35, d * 0.35)
        hh = dep.spec.get("height", 0.9) * rng.uniform(0.45, 1.0)
        r0 = dep.spec.get("r", 0.035) * rng.uniform(0.8, 1.2)
        base = np.array([x0, y0, surface_top(dep.surface, x0, y0) - ROOT_SINK])
        grown = dendrite(dep, Seed(base, np.array([0, 0, 1.0]), hh, r0, 0))
        objs += grown.objs
        for p in grown.tips:
            if best is None or float(p[2] - p[1]) > float(best[2] - best[1]):
                best = p
        root = Buf()
        add_sphere(root, base + dep.ox, r0 * 2.0, scale=(1, 1, 0.4))
        objs.append(buf_solid(root, "root", dep.mat))
    return objs, best


def grain_field(dep: Deposit) -> tuple[list[bpy.types.Object], np.ndarray | None]:
    w, d = dep.size
    rng = dep.rng
    mossy = dep.spec.get("kind", "dendrite") == "mossy"
    placed: list[Ball] = []
    tpl = ico_tpl(2 if mossy else 3)
    buf = Buf()
    for _ in range(dep.spec.get("n", 9)):
        cx, cy = rng.uniform(-w * 0.4, w * 0.4), rng.uniform(-d * 0.35, d * 0.35)
        rr = [rng.uniform(0.03, 0.06) if mossy else rng.uniform(0.08, 0.16) for _ in range(40 if mossy else 4)]
        cfg = Drop(w, d, dep.surface, height=dep.spec.get("height", 0.9), near=(cx, cy), spread=0.12)
        for x, y, z, r in drop(rr, cfg, rng, placed):
            verts, faces = make_blob(tpl, np.array([x, y, z]), r, rng, 0.1)
            buf_add(buf, verts + dep.ox, faces)
    objs = [o for o in [buf_obj(buf, "deposit", dep.mat)] if o is not None]
    if not placed:
        return objs, None
    top = placed[0]
    for p in placed[1:]:
        if p[2] - p[1] > top[2] - top[1]:
            top = p
    return objs, np.array([top[0], top[1], top[2]])


@dataclass(frozen=True)
class Base:
    field: Field
    xs: np.ndarray
    x: np.ndarray
    y: np.ndarray
    size: Vec2
    loc: Vec3


def coating_part(base: Base, coating: Spec) -> tuple[bpy.types.Object, Vec3, Surface]:
    w, d = base.size
    loc = base.loc
    t = coating.get("t", 0.05)
    fx = coating.get("from_x", -0.2) * w
    mask = base.xs >= fx
    xc, yc = base.x[:, mask], base.y[:, mask]
    hc = field_at_grid(base.field, xc, yc)
    grid = Grid(xc + loc[0], yc + loc[1], hc - COAT_LIFT + loc[2], hc + t + loc[2])
    mat = material(coating.get("kind", "ceramic"), coating.get("color", "#5aa0c8"), coating.get("alpha"))
    anchor = (loc[0] + w * 0.35, loc[1] - d / 2, loc[2] + field_at_point(base.field, w * 0.35, -d / 2) + t * 0.5)
    return heightfield_solid(grid, mat, "coating"), anchor, Surface(base.field, t, fx)


def deposit_part(
    rng: np.random.Generator,
    base: Base,
    spec: Spec,
    surface: Surface,
) -> tuple[list[bpy.types.Object], PtLike | None]:
    ox = np.asarray(base.loc, float)
    mat = material(spec.get("kind_m", "lithium"), spec.get("color"))
    dep = Deposit(rng, ox, mat, base.size, surface, spec)
    objs, best = dendrite_field(dep) if spec.get("kind", "dendrite") == "dendrite" else grain_field(dep)
    return objs, None if best is None else best + ox


def electrolyte_part(spec: Spec, size: Vec2, loc: Vec3) -> tuple[bpy.types.Object, Vec3]:
    w, d = size
    eh = spec.get("height", 1.1)
    mat = material("electrolyte", spec.get("color"), spec.get("alpha", 0.25))
    obj = slab((w, d, eh), (loc[0], loc[1], loc[2] + eh / 2), mat, bevel=0.0)
    return obj, (loc[0] + w / 2, loc[1] - d / 2, loc[2] + eh * 0.75)


def electrode_interface(**opts: Unpack[InterfaceOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    rng = np.random.default_rng(opts.get("seed", 0))
    w, d = opts.get("size", (3.2, 2.0))
    loc = opts.get("loc", (0, 0, 0))
    thickness = opts.get("thickness", 0.5)
    sub = opts.get("substrate") or {}
    field = make_field(rng, opts.get("roughness", 0.07))
    res = opts.get("res", (140, 90))
    xs = np.linspace(-w / 2, w / 2, res[0])
    ys = np.linspace(-d / 2, d / 2, res[1])
    gx, gy = np.meshgrid(xs, ys)
    zt = field_at_grid(field, gx, gy)
    grid = Grid(gx + loc[0], gy + loc[1], np.full_like(zt, -thickness) + loc[2], zt + loc[2])
    objs = [heightfield_solid(grid, material(sub.get("kind", "lithium"), sub.get("color")), "substrate")]
    anchors: dict[str, PtLike] = {
        "substrate": (loc[0] + w * 0.3, loc[1] - d / 2, loc[2] - thickness * 0.5),
        "surface": (loc[0] - w * 0.3, loc[1] - d * 0.1, loc[2] + field_at_point(field, -w * 0.3, -d * 0.1)),
    }
    surface = Surface(field, 0.0, None)
    base = Base(field, xs, gx, gy, (w, d), loc)
    coating = opts.get("coating")
    if coating:
        part, anchors["coating"], surface = coating_part(base, coating)
        objs.append(part)
    deposit = opts.get("deposit")
    if deposit:
        made, found = deposit_part(rng, base, deposit, surface)
        objs += made
        if found is not None:
            anchors["deposit"] = found
    electrolyte = opts.get("electrolyte")
    if electrolyte:
        part, anchors["electrolyte"] = electrolyte_part(electrolyte, (w, d), loc)
        objs.append(part)
    return objs, with_prefix(opts.get("prefix", ""), anchors)
