# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_solar.py
import math
from typing import TypedDict, Unpack

from apparatus3d_core import Built, Mat, Part, Vec3, add, anchor, box, done, new_part
from apparatus3d_materials import brushed_metal
from apparatus3d_nodes import Graph, Sock, ncoord, new_graph, nmap, nmath, nmix, nparams, nput, nxyz
from mathutils import Euler, Vector
from scene import cylinder


class SolarOpts(TypedDict, total=False):
    rows: int
    cols: int
    module: tuple[float, float]
    tilt: float
    row_gap: float
    cell: str
    frame: str
    rot: float


def cell_wave(g: Graph, axis: Sock, half: float, div: float, shift: float) -> Sock:
    scaled = nmath(g, "DIVIDE", nmath(g, "ADD", axis, half), div)
    return nmath(g, "ABSOLUTE", nmath(g, "SUBTRACT", nmath(g, "FRACT", scaled), shift))


def pv_mat(mod: tuple[float, float], cell: str) -> Mat:
    mw, mh = mod
    g = new_graph("pv")
    sp = nxyz(g, ncoord(g))
    cx = cell_wave(g, sp[0], mw / 2, mw / 6, 0.5)
    cy = cell_wave(g, sp[1], mh / 2, mh / 10, 0.5)
    gap = nmath(g, "MAXIMUM", nmap(g, cx, (0.46, 0.49)), nmap(g, cy, (0.44, 0.48)))
    bus = nmap(g, cell_wave(g, sp[0], mw / 2, mw / 18, 0.5), (0.03, 0.015))
    col = nmix(g, gap, cell, "#dfe3e8")
    col = nmix(g, nmath(g, "MULTIPLY", bus, 0.8), col, "#b8bec6")
    nput(g, g.bsdf.inputs["Base Color"], col)
    nparams(g, Roughness=0.12, Coat_Weight=1.0, Coat_Roughness=0.03, Metallic=0.1)
    return g.m


def tilted(pt: Part, size: Vec3, mat: Mat, at: tuple[Vec3, float], bevel: float) -> None:
    o = box(size, (0, 0, 0), mat, bevel)
    o.rotation_euler = Euler((at[1], 0, 0))
    o.location = Vector(at[0])
    add(pt, o)


def legs(pt: Part, geo: tuple[float, float, float, float], x: float, y: float, leg: Mat) -> None:
    depth, zlow, mh, tr = geo
    s = mh * math.sin(tr)
    add(pt, cylinder((x, y - 0.3 * depth, 0), (x, y - 0.3 * depth, zlow + 0.2 * s), 0.015, leg, 12))
    add(pt, cylinder((x, y + 0.3 * depth, 0), (x, y + 0.3 * depth, zlow + 0.8 * s), 0.015, leg, 12))


def solar_row(pt: Part, r: int, mats: tuple[Mat, Mat, Mat], kw: SolarOpts) -> None:
    pv, fm, leg = mats
    mw, mh = kw.get("module", (0.42, 0.7))
    cols, tr = kw.get("cols", 5), math.radians(kw.get("tilt", 25.0))
    depth = mh * math.cos(tr)
    y = r * (depth + kw.get("row_gap", 0.55))
    zlow = 0.22
    for c in range(cols):
        x = (c - (cols - 1) / 2) * (mw + 0.02)
        zc = zlow + 0.5 * mh * math.sin(tr)
        tilted(pt, (mw, mh, 0.025), pv, ((x, y, zc), tr), 0.003)
        tilted(pt, (mw + 0.02, mh + 0.02, 0.018), fm, ((x, y, zc - 0.012), tr), 0.004)
    w = cols * (mw + 0.02)
    nleg = max(2, cols // 2 + 1)
    for k in range(nleg):
        x = -w / 2 + 0.1 + k * (w - 0.2) / max(1, nleg - 1)
        legs(pt, (depth, zlow, mh, tr), x, y, leg)
    anchor(pt, f"row{r}", (w / 2, y, zlow + mh * math.sin(tr)))


def solar_array(loc: Vec3 = (0, 0, 0), **kw: Unpack[SolarOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    mw, mh = kw.get("module", (0.42, 0.7))
    rows, cols, tr = kw.get("rows", 3), kw.get("cols", 5), math.radians(kw.get("tilt", 25.0))
    mats = (
        pv_mat((mw, mh), kw.get("cell", "#1c2e55")),
        brushed_metal(kw.get("frame", "#c9ced4"), 0.3, "x"),
        brushed_metal("#aeb4bb", 0.35, "z"),
    )
    for r in range(rows):
        solar_row(pt, r, mats, kw)
    pitch = mh * math.cos(tr) + kw.get("row_gap", 0.55)
    anchor(pt, "array", (0, (rows - 1) * pitch / 2, 0.6))
    anchor(pt, "module", (-(cols - 1) / 2 * (mw + 0.02), 0, 0.22 + 0.5 * mh * math.sin(tr)))
    return done(pt)
