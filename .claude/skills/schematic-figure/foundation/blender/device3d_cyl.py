# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_cyl.py
import math
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import accumulate
from typing import TypedDict, Unpack

import bpy
from device3d_mat import BATTERY, material, shade
from device3d_mesh import TAU, Buf, MeshOpts, buf_add, buf_solid, with_prefix
from device3d_prim import RollSection, arc, rounded_profile, sweep, sweep_data
from device3d_types import Anchors, Colors, Vec3

CUT_END = 1.5 * math.pi
ROLL_EPS = 1e-3
ROLL_STEPS = 200


class CylOpts(TypedDict, total=False):
    radius: float
    height: float
    cut: bool
    loc: Vec3
    colors: Colors | None
    layers: Sequence[tuple[float, str, str]] | None
    pitch: float | None
    prefix: str


@dataclass(frozen=True)
class Can:
    r: float
    h: float
    w: float
    a0: float
    a1: float
    loc: Vec3
    colors: Colors


@dataclass(frozen=True)
class Roll:
    unit: Sequence[tuple[float, str, str]]
    pitch: float
    r_in: float
    z0: float
    z1: float
    turns: float


def can_shell(c: Can) -> list[bpy.types.Object]:
    r, h, w = c.r, c.h, c.w
    steel = material("steel", c.colors["steel"])
    can = [
        (0, 0),
        *arc((r - 0.06 * r, 0.06 * r), 0.06 * r, 270, 360),
        (r, h * 0.93),
        (r - w, h * 0.93),
        *arc((r - w - 0.03 * r, w + 0.03 * r), 0.03 * r, 0, -90),
        (0, w),
    ]
    sl = 0.012 * r
    button = [
        (0, h * 0.925),
        (0.42 * r, h * 0.925),
        *arc((0.36 * r, h * 0.975), 0.05 * r, 0, 90),
        (0, h * 0.975 + 0.05 * r),
    ]
    sleeve = rounded_profile(r + 0.001, r + sl, 0.02 * h, 0.9 * h, sl * 0.45)
    crimp = rounded_profile(r - w - 0.05 * r, r, h * 0.925, h * 0.965, 0.02 * r)
    gasket = rounded_profile(r - w - 0.07 * r, r - w, h * 0.885, h * 0.93, 0.01 * r)
    cap = rounded_profile(0, r - w - 0.02 * r, h * 0.9, h * 0.925, 0.008 * r)
    mats = [
        steel,
        material("plastic", c.colors["sleeve"], rough=0.45),
        steel,
        material("rubber", c.colors["gasket"]),
        steel,
        material("steel", shade(c.colors["steel"], 0.15)),
    ]
    shapes = [("can", can), ("sleeve", sleeve), ("crimp", crimp), ("gasket", gasket), ("cap", cap), ("button", button)]
    return [
        sweep(prof, m, a0=c.a0, a1=c.a1, steps=180, loc=c.loc, name=name)
        for (name, prof), m in zip(shapes, mats, strict=True)
    ]


def roll_buffers(c: Can, roll: Roll) -> dict[tuple[str, str], Buf]:
    offs = list(accumulate([0.0, *[t for t, _, _ in roll.unit]]))
    bufs: dict[tuple[str, str], Buf] = {}
    for li, (t, col, kind) in enumerate(roll.unit):
        for k in range(math.ceil(roll.turns) + 1):
            s0, s1 = k * TAU + c.a0, min(k * TAU + c.a1, roll.turns * TAU)
            if s1 <= s0 + ROLL_EPS:
                continue
            section = RollSection(roll.r_in, roll.pitch, offs[li], t, k, roll.z0, roll.z1)
            verts, faces = sweep_data(section, s0 - k * TAU, s1 - k * TAU, ROLL_STEPS, c.loc)
            buf_add(bufs.setdefault((col, kind), Buf()), verts, faces)
    return bufs


def make_roll(c: Can, layers: Sequence[tuple[float, str, str]] | None, pitch: float | None) -> Roll:
    r, h = c.r, c.h
    unit = layers or [
        (0.036 * r, c.colors["cathode"], "oxide"),
        (0.012 * r, c.colors["separator"], "ceramic"),
        (0.036 * r, c.colors["anode"], "carbon"),
        (0.012 * r, c.colors["separator"], "ceramic"),
    ]
    p = pitch or sum(t for t, _, _ in unit)
    r_in = 0.14 * r
    r_out = r - c.w - 0.012 * r
    return Roll(unit, p, r_in, h * 0.06, h * 0.86, (r_out - r_in) / p - 0.2)


def roll_anchors(c: Can, roll: Roll, *, cut: bool) -> dict[str, Vec3]:
    x, y, z = c.loc
    r, h, w = c.r, c.h, c.w
    offs = list(accumulate([0.0, *[t for t, _, _ in roll.unit]]))
    zm = z + (roll.z0 + roll.z1) * 0.55
    kk = int(roll.turns * 0.6)
    out: dict[str, Vec3] = {}
    for li, name in enumerate(("cathode", "separator", "anode")):
        out[name] = (x + roll.r_in + roll.pitch * kk + offs[li] + roll.unit[li][0] / 2, y, zm)
    out["can"] = (x + r - w / 2, y, z + h * 0.3) if cut else (x + r, y, z + h * 0.3)
    out["sleeve"] = (x - r * 0.7, y - r * 0.72, z + h * 0.5)
    out["mandrel"] = (x + roll.r_in * 0.35, y, z + h * 0.7)
    return out


def cylindrical_cell(**opts: Unpack[CylOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    colors = {**BATTERY, **(opts.get("colors") or {})}
    r = opts.get("radius", 0.9)
    h = opts.get("height", 3.2)
    cut = opts.get("cut", True)
    loc = opts.get("loc", (0, 0, 0))
    c = Can(r, h, 0.035 * r, 0.0, CUT_END if cut else TAU, loc, colors)
    objs = can_shell(c)
    anchors: dict[str, Vec3] = {
        "cap": (loc[0] - (r - 0.1 * r), loc[1], loc[2] + h * 0.96),
        "button": (loc[0], loc[1], loc[2] + h * 0.975 + 0.05 * r),
    }
    roll = make_roll(c, opts.get("layers"), opts.get("pitch"))
    for (col, kind), b in roll_buffers(c, roll).items():
        objs.append(buf_solid(b, "roll", material(kind, col, rough=0.7), MeshOpts(sharp=40)))
    steel = material("steel", colors["steel"])
    objs.append(
        sweep(
            rounded_profile(0.0, roll.r_in * 0.7, h * 0.04, h * 0.88, 0.01),
            steel,
            a0=c.a0,
            a1=c.a1,
            steps=64,
            loc=loc,
            name="mandrel",
        )
    )
    anchors.update(roll_anchors(c, roll, cut=cut))
    return objs, with_prefix(opts.get("prefix", ""), anchors)
