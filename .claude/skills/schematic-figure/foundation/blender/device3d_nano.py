# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_nano.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack, cast

import bpy
import numpy as np
from device3d_mat import material
from device3d_mesh import TAU, Buf, MeshOpts, add_cyl, add_sphere, buf_add, buf_solid, cyl_tpl, with_prefix
from device3d_prim import slab
from device3d_types import Anchors, Face, Faces, Spec, Vec2, Vec3

SQUARE = 4
ROUND_SIDES = 48
HEX_ROW = math.sqrt(3) / 2


class NanoOpts(TypedDict, total=False):
    n: tuple[int, int]
    pitch: float
    radius: float
    height: float
    sides: int
    taper: float
    jitter: float
    seed: int
    color: str
    kind: str
    tip: Spec | None
    shell: Spec | None
    substrate: Spec | None
    hex_grid: bool
    loc: Vec3
    prefix: str


class MembraneOpts(TypedDict, total=False):
    size: Vec2
    thickness: float
    pore_radius: float
    pitch: float
    arrangement: str
    jitter: float
    seed: int
    color: str
    kind: str
    loc: Vec3
    front_cut: bool
    prefix: str


@dataclass(frozen=True)
class Wire:
    c: Vec3
    r: float
    h: float
    sides: int
    taper: float
    tilt: Vec2


@dataclass(frozen=True)
class Front:
    pos: Vec3
    h: float
    top: Vec3


@dataclass(frozen=True)
class Bufs:
    wires: Buf
    tips: Buf
    shells: Buf


def prism_mesh(buf: Buf, wire: Wire) -> None:
    c, sides = wire.c, wire.sides
    top_r = wire.r * (1 - wire.taper)
    tx, ty = wire.tilt
    shift = math.pi / sides if sides == SQUARE else 0
    verts: list[Vec3] = []
    for k in range(sides):
        a = TAU * k / sides + shift
        verts.append((c[0] + wire.r * math.cos(a), c[1] + wire.r * math.sin(a), c[2]))
    for k in range(sides):
        a = TAU * k / sides + shift
        x = c[0] + tx * wire.h + top_r * math.cos(a)
        y = c[1] + ty * wire.h + top_r * math.sin(a)
        verts.append((x, y, c[2] + wire.h))
    faces: Faces = [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)]
    bottom: Face = tuple(range(sides))[::-1]
    faces.append(bottom)
    faces.append(tuple(range(sides, 2 * sides)))
    buf_add(buf, verts, faces)


def wire_at(opts: NanoOpts, rng: np.random.Generator, pos: Vec3, bufs: Bufs) -> Front:
    radius = opts.get("radius", 0.07)
    taper = opts.get("taper", 0.1)
    sides = opts.get("sides", 6)
    jitter = opts.get("jitter", 0.12)
    h = opts.get("height", 1.2) * (1 + jitter * rng.normal() * 0.6)
    tl = (rng.normal() * jitter * 0.05, rng.normal() * jitter * 0.05)
    prism_mesh(bufs.wires, Wire(pos, radius, h, sides, taper, tl))
    top = (pos[0] + tl[0] * h, pos[1] + tl[1] * h, pos[2] + h)
    shell = opts.get("shell")
    if shell is not None:
        prism_mesh(bufs.shells, Wire(pos, radius + shell.get("t", 0.02), h * 0.96, sides, taper, tl))
    tip = opts.get("tip")
    if tip is not None:
        tip_r = radius * (1 - taper) * tip.get("r", 1.25)
        add_sphere(bufs.tips, (top[0], top[1], top[2] + radius * 0.35), tip_r, scale=(1, 1, 0.8))
    return Front(pos, h, top)


def wire_objects(opts: NanoOpts, bufs: Bufs) -> list[bpy.types.Object]:
    kind, color = opts.get("kind", "semiconductor"), opts.get("color", "#6f8fb0")
    objs = [buf_solid(bufs.wires, "wires", material(kind, color), MeshOpts(sharp=30))]
    shell = opts.get("shell")
    if shell is not None:
        mat = material(shell.get("kind", "polymer"), shell.get("color", "#e0c27a"), shell.get("alpha", 0.5))
        objs.append(buf_solid(bufs.shells, "shells", mat, MeshOpts(sharp=30)))
    tip = opts.get("tip")
    if tip is not None:
        objs.append(buf_solid(bufs.tips, "tips", material("gold", tip.get("color", "#d6a74f"))))
    return objs


def nanowire_array(**opts: Unpack[NanoOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    rng = np.random.default_rng(opts.get("seed", 0))
    x, y, z = opts.get("loc", (0, 0, 0))
    pitch = opts.get("pitch", 0.42)
    radius = opts.get("radius", 0.07)
    hex_grid = opts.get("hex_grid", True)
    sub: Spec = {"t": 0.2, "color": "#9aa3ad", "kind": "semiconductor", "margin": 0.3, **(opts.get("substrate") or {})}
    nx, ny = opts.get("n", (7, 5))
    mg = sub.get("margin", 0.3)
    st = sub.get("t", 0.2)
    row = HEX_ROW if hex_grid else 1
    w = (nx - 1) * pitch + (pitch / 2 if hex_grid else 0) + 2 * mg
    d = (ny - 1) * pitch * row + 2 * mg
    base = material(sub.get("kind", "semiconductor"), sub.get("color"))
    objs = [slab((w, d, st), (x, y, z - st / 2), base, bevel=0.02, name="substrate")]
    anchors: dict[str, Vec3] = {"substrate": (x + w / 2, y - d / 2, z - st / 2)}
    bufs = Bufs(Buf(), Buf(), Buf())
    front: Front | None = None
    for j in range(ny):
        for i in range(nx):
            px = x - w / 2 + mg + i * pitch + (pitch / 2 if hex_grid and j % 2 else 0)
            py = y - d / 2 + mg + j * pitch * row
            made = wire_at(opts, rng, (px, py, z), bufs)
            if j == 0 and i == nx // 2 + 1:
                front = made
    objs += wire_objects(opts, bufs)
    if front is not None:
        (px, py, pz), h, top = front.pos, front.h, front.top
        anchors["wire"] = (px + radius, py - radius * 0.5, pz + h * 0.5)
        anchors["tip"] = (top[0], top[1], top[2] + radius * 0.9)
        anchors["shell"] = (px + radius * 1.2, py - radius * 0.5, pz + h * 0.7)
        anchors["base"] = (px, py - radius, z)
    return objs, with_prefix(opts.get("prefix", ""), anchors)


def pillar_array(shape: str = "round", **opts: Unpack[NanoOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    merged: NanoOpts = {
        "sides": ROUND_SIDES if shape == "round" else SQUARE,
        "taper": 0.0,
        "jitter": 0.0,
        "color": "#a9b3c0",
        "kind": "semiconductor",
        **opts,
    }
    return nanowire_array(**merged)


def pore_sites(opts: MembraneOpts, rng: np.random.Generator) -> list[Vec2]:
    w, d = opts.get("size", (3.0, 2.0))
    pitch = opts.get("pitch", 0.3)
    pr = opts.get("pore_radius", 0.1)
    arrangement = opts.get("arrangement", "hex")
    row = HEX_ROW if arrangement == "hex" else 1
    rows = int(d / (pitch * row)) + 2
    cols = int(w / pitch) + 2
    pores: list[Vec2] = []
    if arrangement == "random":
        for _ in range(rows * cols):
            px = rng.uniform(-w / 2 + pr * 1.5, w / 2 - pr * 1.5)
            pores.append((px, rng.uniform(-d / 2, d / 2 - pr * 1.5)))
        return pores
    dy = pitch * row
    y0 = -d / 2 if opts.get("front_cut", True) else -d / 2 + pitch * 0.7
    jitter = opts.get("jitter", 0.0)
    for j in range(rows):
        for i in range(cols):
            px = -w / 2 + pitch * 0.7 + i * pitch + (pitch / 2 if arrangement == "hex" and j % 2 else 0)
            py = y0 + j * dy
            px += rng.normal() * jitter * pitch
            py += rng.normal() * jitter * pitch
            if abs(px) < w / 2 - pr * 1.4 and py < d / 2 - pr * 1.4:
                pores.append((px, py))
    return pores


def pore_cutter(body: bpy.types.Object, pores: list[Vec2], opts: MembraneOpts) -> None:
    x, y, z = opts.get("loc", (0, 0, 0))
    thickness = opts.get("thickness", 0.28)
    cut = Buf()
    tpl = cyl_tpl(40)
    for px, py in pores:
        p0 = (x + px, y + py, z - 0.1)
        p1 = (x + px, y + py, z + thickness + 0.1)
        add_cyl(cut, p0, p1, opts.get("pore_radius", 0.1), tpl=tpl)
    cutter = buf_solid(cut, "pores_cutter", None)
    cutter.hide_render = True
    cutter.hide_viewport = True
    md = body.modifiers.new("pores", "BOOLEAN")
    md.operation = "DIFFERENCE"
    md.object = cutter
    try:
        md.solver = "MANIFOLD"
    except TypeError:
        md.solver = "EXACT"
    mesh = cast("bpy.types.Mesh", body.data)
    mesh.shade_smooth()
    for poly in mesh.polygons:
        poly.use_smooth = False


def nearest_top(pores: list[Vec2], w: float, d: float) -> Vec2:
    if not pores:
        return (0, 0)
    best = pores[0]
    best_score = (best[1] - d / 2 * 0.2) ** 2 + (best[0] - w * 0.2) ** 2
    for p in pores[1:]:
        score = (p[1] - d / 2 * 0.2) ** 2 + (p[0] - w * 0.2) ** 2
        if score < best_score:
            best, best_score = p, score
    return best


def nearest_front(pores: list[Vec2], d: float) -> Vec2:
    if not pores:
        return (0, -d / 2)
    best = pores[0]
    best_score = abs(best[1] + d / 2) + abs(best[0]) * 0.1
    for p in pores[1:]:
        score = abs(p[1] + d / 2) + abs(p[0]) * 0.1
        if score < best_score:
            best, best_score = p, score
    return best


def porous_membrane(**opts: Unpack[MembraneOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    rng = np.random.default_rng(opts.get("seed", 0))
    w, d = opts.get("size", (3.0, 2.0))
    x, y, z = opts.get("loc", (0, 0, 0))
    thickness = opts.get("thickness", 0.28)
    mat = material(opts.get("kind", "ceramic"), opts.get("color", "#cfd6de"))
    body = slab((w, d, thickness), (x, y, z + thickness / 2), mat, bevel=0.0, name="membrane")
    pores = pore_sites(opts, rng)
    pore_cutter(body, pores, opts)
    top = nearest_top(pores, w, d)
    front = nearest_front(pores, d)
    anchors: dict[str, Vec3] = {
        "membrane": (x + w / 2, y - d / 2, z + thickness / 2),
        "pore": (x + top[0], y + top[1], z + thickness),
        "channel": (x + front[0], y - d / 2, z + thickness * 0.5),
    }
    return [body], with_prefix(opts.get("prefix", ""), anchors)
