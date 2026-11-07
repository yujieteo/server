# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_cell.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

from apparatus3d_core import TAU, Built, Part, Vec3, add, anchor, chaikin, cyl, done, lathe, new_part
from apparatus3d_glass import vessel
from apparatus3d_materials import brushed_metal, glass_tint, liquid, matte, painted
from scene import fiber_path


class CellOpts(TypedDict, total=False):
    electrolyte: str
    we: str
    ce: str
    re: str
    cable_out: tuple[float, float]
    cable_reach: float
    rot: float
    seed: int


@dataclass(frozen=True)
class CellGeo:
    radius: float
    height: float
    ztop: float
    we: Vec3
    ce: Vec3
    re: Vec3
    rb: float
    rr: float


def cell_geo(radius: float, height: float) -> CellGeo:
    ztop = height + 0.02 + 0.1
    return CellGeo(
        radius,
        height,
        ztop,
        (-0.05 * radius, -0.28 * radius, 0.25 * height),
        (0.42 * radius, 0.1 * radius, 0.0),
        (-0.38 * radius, 0.22 * radius, 0.0),
        0.3 * height,
        0.07 * radius / 0.6,
    )


def cell_lid(pt: Part, gm: CellGeo) -> None:
    zl = gm.height + 0.02
    r = gm.radius
    prof = chaikin([(0, zl + 0.1), (r * 1.08, zl + 0.1), (r * 1.08, zl), (r * 0.95, zl), (r * 0.95, zl - 0.12)], 2)
    add(pt, lathe([*prof, (0, zl - 0.12)], painted("#efeee8", 0.5, 0.1), 96, name="lid"))


def cell_we(pt: Part, gm: CellGeo) -> None:
    wx, wy, wtip = gm.we
    ptfe = painted("#f1f0ea", 0.45, 0.1)
    scale = gm.radius / 0.6
    add(pt, cyl((wx, wy, wtip), (wx, wy, gm.ztop + 0.35), 0.075 * scale, ptfe))
    add(pt, cyl((wx, wy, wtip - 0.004), (wx, wy, wtip + 0.01), 0.04 * scale, painted("#1d1f22", 0.15, 0.6)))
    add(pt, cyl((wx, wy, gm.ztop + 0.35), (wx, wy, gm.ztop + 0.5), 0.03, brushed_metal("#d9dcdf", 0.18, "z")))


def cell_ce(pt: Part, gm: CellGeo) -> None:
    cx, cy, _ = gm.ce
    h, r = gm.height, gm.radius
    pts = [(cx, cy, gm.ztop + 0.35), (cx, cy, 0.5 * h)]
    for i in range(1, 60):
        t = i / 59
        a = t * 7 * TAU
        pts.append((cx + 0.07 * r * math.cos(a), cy + 0.07 * r * math.sin(a), 0.5 * h - t * 0.3 * h))
    add(pt, fiber_path(pts, 0.012, brushed_metal("#d9dcdf", 0.18, "z"), 6))


def cell_re(pt: Part, gm: CellGeo, cap: str) -> None:
    rx, ry, _ = gm.re
    rb, rr, ztop = gm.rb, gm.rr, gm.ztop
    tube = [*chaikin([(0, rb), (rr * 0.9, rb), (rr, rb + 0.02)], 2), (rr, ztop + 0.3), (0, ztop + 0.3)]
    add(pt, lathe(tube, glass_tint("#e9f3f5", "#7c96a5", 0.5), 48, (rx, ry, 0), "RE"))
    add(pt, cyl((rx, ry, rb - 0.005), (rx, ry, rb + 0.05), rr * 0.92, matte("#cdb892", 0.95)))
    fill = [(0, rb + 0.05), (rr * 0.8, rb + 0.05), (rr * 0.8, ztop - 0.05), (0, ztop - 0.05)]
    add(pt, lathe(fill, liquid("#f2e7c4", 0.3), 32, (rx, ry, 0), "REfill"))
    add(pt, cyl((rx, ry, rb + 0.15), (rx, ry, ztop + 0.3), 0.012, brushed_metal("#cfd2d4", 0.25)))
    add(pt, cyl((rx, ry, rb + 0.12), (rx, ry, rb + 0.2), 0.016, matte("#4b3f3a", 0.7)))
    add(pt, cyl((rx, ry, ztop + 0.3), (rx, ry, ztop + 0.42), rr * 1.25, painted(cap, 0.4)))


def cell_cable(pt: Part, start: Vec3, col: str, drr: Vec3, radius: float) -> Vec3:
    x, y, z0 = start
    dx, dy, reach = drr
    k = reach / 2.2
    e = (x + dx * reach * radius, y + dy * reach * radius, 0.03)
    mids = [(0.35, z0 + 0.5), (1.3, z0 + 0.1), (1.9, 0.2)]
    path = [(x, y, z0 - 0.02), (x, y, z0 + 0.3)] + [
        (x + dx * f * k * radius, y + dy * f * k * radius, z) for f, z in mids
    ]
    add(pt, fiber_path([*path, e], 0.022, painted(col, 0.35), 32))
    add(pt, cyl((x, y, z0 - 0.02), (x, y, z0 + 0.08), 0.035, brushed_metal("#c9ccd0", 0.3)))
    return e


def cell_cables(pt: Part, gm: CellGeo, kw: CellOpts) -> list[Vec3]:
    dx, dy = kw.get("cable_out", (1, 0.6))
    length = math.hypot(dx, dy)
    drr = (dx / length, dy / length, kw.get("cable_reach", 2.2))
    z = gm.ztop
    srcs = [
        ((gm.we[0], gm.we[1], z + 0.5), kw.get("we", "#2e9d57")),
        ((gm.ce[0], gm.ce[1], z + 0.35), kw.get("ce", "#d6453d")),
        ((gm.re[0], gm.re[1], z + 0.42), kw.get("re", "#e2b43a")),
    ]
    return [cell_cable(pt, start, col, drr, gm.radius) for start, col in srcs]


def cell_anchors(pt: Part, gm: CellGeo, zliq: float, ends: list[Vec3]) -> None:
    anchor(pt, "WE", (gm.we[0], gm.we[1] - 0.08, zliq * 0.7))
    anchor(pt, "WE_tip", gm.we)
    anchor(pt, "CE", (gm.ce[0], gm.ce[1], 0.35 * gm.height))
    anchor(pt, "RE", (gm.re[0], gm.re[1], gm.rb))
    anchor(pt, "lid", (0, -gm.radius * 1.08, gm.ztop))
    anchor(pt, "electrolyte", (0, -gm.radius, zliq * 0.5))
    for nm, e in zip(("WE", "CE", "RE"), ends, strict=True):
        anchor(pt, "cable_" + nm, e)


def electrochem_cell(loc: Vec3 = (0, 0, 0), radius: float = 0.6, height: float = 1.25, **kw: Unpack[CellOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    o, va = vessel(
        "beaker",
        (0, 0, 0),
        radius,
        height=height,
        fill=0.7,
        liquid_color=kw.get("electrolyte", "#8ec3e6"),
        liquid_opacity=0.35,
        spout=False,
        graduations=0,
    )
    pt.objs.extend(o)
    gm = cell_geo(radius, height)
    cell_lid(pt, gm)
    cell_we(pt, gm)
    cell_ce(pt, gm)
    cell_re(pt, gm, kw.get("re", "#e2b43a"))
    ends = cell_cables(pt, gm, kw)
    cell_anchors(pt, gm, va["liquid"][2], ends)
    return done(pt)
