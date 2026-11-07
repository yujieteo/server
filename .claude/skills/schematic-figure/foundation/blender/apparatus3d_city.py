# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_city.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

from apparatus3d_core import Built, Mat, Part, Rng, Vec3, add, anchor, box, done, jitter, new_part, set_color
from apparatus3d_materials import matte
from apparatus3d_nodes import ncoord, new_graph, nmap, nmath, nmix, nnew, nput, nxyz

PALETTE = ("#e7e1d6", "#d5dbe2", "#cbbfae", "#b9c4cf", "#e2d2bc", "#c7cdd3")
CENTRE_BOOST = 1.3
TOWER_MIN = 0.8
TOWER_PROB = 0.6


class CityOpts(TypedDict, total=False):
    seed: int
    heights: tuple[float, float]
    palette: tuple[str, ...]
    window: str
    street: str
    sidewalk: str
    rot: float


@dataclass(frozen=True)
class Lots:
    nx: int
    ny: int
    lot: float
    heights: tuple[float, float]
    palette: tuple[str, ...]


def facade_mat(window: str) -> Mat:
    g = new_graph("facade")
    oi = nnew(g, "ShaderNodeObjectInfo")
    sp = nxyz(g, ncoord(g))
    nrm = nxyz(g, ncoord(g, "Normal"))
    hcoord = nmath(g, "ADD", sp[0], sp[1])
    wx = nmath(g, "ABSOLUTE", nmath(g, "SUBTRACT", nmath(g, "FRACT", nmath(g, "DIVIDE", hcoord, 0.07)), 0.5))
    wz = nmath(g, "ABSOLUTE", nmath(g, "SUBTRACT", nmath(g, "FRACT", nmath(g, "DIVIDE", sp[2], 0.085)), 0.55))
    win = nmath(g, "MULTIPLY", nmap(g, wx, (0.3, 0.26)), nmap(g, wz, (0.28, 0.24)))
    side = nmap(g, nmath(g, "ABSOLUTE", nrm[2]), (0.5, 0.3))
    win = nmath(g, "MULTIPLY", nmath(g, "MULTIPLY", win, side), nmap(g, sp[2], (0.07, 0.1)))
    roof = nmap(g, nrm[2], (0.6, 0.9))
    col = nmix(g, roof, oi.outputs["Color"], "#9ea3a8")
    col = nmix(g, win, col, window)
    nput(g, g.bsdf.inputs["Base Color"], col)
    nput(g, g.bsdf.inputs["Roughness"], nmap(g, win, (0, 1), (0.8, 0.12)))
    nput(g, g.bsdf.inputs["Coat Weight"], nmath(g, "MULTIPLY", win, 0.8))
    return g.m


def building(pt: Part, rr: Rng, lots: Lots, ij: tuple[int, int], mat: Mat) -> tuple[float, Vec3]:
    i, j = ij
    lot = lots.lot
    w, d = lots.nx * lot, lots.ny * lot
    cx, cy = -w / 2 + (i + 0.5) * lot, -d / 2 + (j + 0.5) * lot
    fw, fd = lot * rr.uniform(0.72, 0.9), lot * rr.uniform(0.72, 0.9)
    t = math.pow(rr.random(), 1.6)
    boost = CENTRE_BOOST if (i, j) == (lots.nx // 2, lots.ny // 2) else 1.0
    h = lots.heights[0] + (lots.heights[1] - lots.heights[0]) * t * boost
    col = jitter(rr.choice(lots.palette), rr, 0.01, 0.1, 0.05)
    o = box((fw, fd, h), (cx, cy, 0.08 + h / 2), mat, 0.004)
    o.name = "bldg"
    set_color(o, col)
    add(pt, o)
    top = 0.08 + h
    if h > TOWER_MIN and rr.random() < TOWER_PROB:
        h2 = h * rr.uniform(0.15, 0.35)
        o = box((fw * 0.7, fd * 0.7, h2), (cx, cy, top + h2 / 2), mat, 0.004)
        set_color(o, col)
        add(pt, o)
        top += h2
    ru = rr.uniform(0.04, 0.07)
    size = (fw * rr.uniform(0.2, 0.35), fd * rr.uniform(0.2, 0.35), ru)
    loc = (cx + rr.uniform(-0.1, 0.1) * fw, cy + rr.uniform(-0.1, 0.1) * fd, top + ru / 2)
    add(pt, box(size, loc, matte("#8d9197", 0.6), 0.003))
    return top, (cx, cy, top)


def city_block(
    loc: Vec3 = (0, 0, 0), lots: tuple[int, int] = (4, 3), lot: float = 0.55, **kw: Unpack[CityOpts]
) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    rr = Rng(kw.get("seed", 0))
    nx, ny = lots
    w, d = nx * lot, ny * lot
    add(pt, box((w + 0.5, d + 0.5, 0.04), (0, 0, 0.02), matte(kw.get("street", "#55595f"), 0.8), 0))
    add(pt, box((w + 0.16, d + 0.16, 0.06), (0, 0, 0.05), matte(kw.get("sidewalk", "#c9c8c3"), 0.85), 0.01))
    mat = facade_mat(kw.get("window", "#2e3d52"))
    spec = Lots(nx, ny, lot, kw.get("heights", (0.3, 1.8)), kw.get("palette", PALETTE))
    best_top, best_at = 0.0, (0.0, 0.0, 0.0)
    for i in range(nx):
        for j in range(ny):
            top, at = building(pt, rr, spec, (i, j), mat)
            if top > best_top:
                best_top, best_at = top, at
    anchor(pt, "tallest", best_at)
    anchor(pt, "block", (0, -d / 2, 0.3))
    anchor(pt, "street", (0, -d / 2 - 0.2, 0.04))
    return done(pt)
