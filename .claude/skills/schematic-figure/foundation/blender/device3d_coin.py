# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_coin.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from device3d_mat import BATTERY, material, shade
from device3d_mesh import TAU, with_prefix
from device3d_prim import SpringSection, arc, rounded_profile, sweep
from device3d_types import Anchors, Colors, Poly, Vec3

CUT_END = 1.5 * math.pi


class CoinOpts(TypedDict, total=False):
    radius: float
    exploded: float
    cut: bool
    loc: Vec3
    colors: Colors | None
    prefix: str


@dataclass(frozen=True)
class Part:
    name: str
    prof: Poly | SpringSection
    mat: bpy.types.Material
    h: float


@dataclass(frozen=True)
class Ring:
    x: float
    y: float
    a0: float
    a1: float
    cut: bool


def can_profile(r: float, hc: float, w: float) -> Poly:
    return [
        (0, 0),
        *arc((r - 0.07 * r, 0.07 * r), 0.07 * r, 270, 360),
        (r, hc - 0.012 * r),
        (r - w, hc - 0.012 * r),
        *arc((r - w - 0.04 * r, w + 0.04 * r), 0.04 * r, 0, -90),
        (0, w),
    ]


def cap_profile(r: float) -> Poly:
    return [
        (0, 0.24 * r),
        (0.8 * r, 0.24 * r),
        *arc((0.8 * r, 0.2 * r), 0.04 * r, 90, 0),
        (0.84 * r, 0.0),
        (0.81 * r, 0.0),
        (0.81 * r, 0.19 * r),
        *arc((0.78 * r, 0.19 * r), 0.03 * r, 0, 90),
        (0, 0.22 * r),
    ]


def gasket_profile(r: float) -> Poly:
    return [
        (0.84 * r, 0),
        (0.93 * r, 0),
        (0.93 * r, 0.2 * r),
        (0.88 * r, 0.2 * r),
        (0.88 * r, 0.035 * r),
        (0.84 * r, 0.035 * r),
    ]


def coin_parts(r: float, c: Colors, hc: float, w: float) -> list[Part]:
    steel = material("steel", c["steel"])
    return [
        Part("case", can_profile(r, hc, w), steel, hc),
        Part(
            "cathode",
            rounded_profile(0, 0.78 * r, 0, 0.075 * r, 0.012 * r),
            material("oxide", c["cathode"], rough=0.72),
            0.075 * r,
        ),
        Part(
            "separator",
            rounded_profile(0, 0.86 * r, 0, 0.014 * r, 0.005 * r),
            material("separator", c["separator"]),
            0.014 * r,
        ),
        Part(
            "anode", rounded_profile(0, 0.74 * r, 0, 0.06 * r, 0.015 * r), material("lithium", c["lithium"]), 0.06 * r
        ),
        Part("spacer", rounded_profile(0, 0.8 * r, 0, 0.04 * r, 0.01 * r), steel, 0.04 * r),
        Part("spring", SpringSection(0.5 * r, 0.66 * r, 0.012 * r, 0.13 * r), steel, 0.13 * r),
        Part("gasket", gasket_profile(r), material("rubber", c["gasket"]), 0.2 * r),
        Part("cap", cap_profile(r), material("steel", shade(c["steel"], 0.12)), 0.24 * r),
    ]


def nested_offsets(r: float, hc: float, w: float) -> dict[str, float]:
    return {
        "cathode": w,
        "separator": w + 0.075 * r,
        "anode": w + 0.089 * r,
        "spacer": w + 0.149 * r,
        "spring": w + 0.189 * r,
        "gasket": hc - 0.2 * r + 0.02 * r,
        "cap": hc - 0.2 * r + 0.035 * r,
    }


def place_part(part: Part, ring: Ring, zz: float) -> tuple[bpy.types.Object, Vec3]:
    x, y = ring.x, ring.y
    steps = 240 if isinstance(part.prof, SpringSection) else 160
    obj = sweep(part.prof, part.mat, a0=ring.a0, a1=ring.a1, steps=steps, loc=(x, y, zz), name=part.name)
    if isinstance(part.prof, SpringSection):
        r2 = part.prof.r2
        return obj, (x + r2 * math.cos(ring.a0 + 0.3), y + r2 * math.sin(ring.a0 + 0.3), zz)
    rmax = max(p[0] for p in part.prof)
    if ring.cut:
        return obj, (x + rmax, y, zz + part.h * 0.5)
    return obj, (x + rmax * math.cos(-0.35), y + rmax * math.sin(-0.35), zz + part.h * 0.5)


def coin_cell(**opts: Unpack[CoinOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    colors = {**BATTERY, **(opts.get("colors") or {})}
    r = opts.get("radius", 1.0)
    exploded = opts.get("exploded", 0.3)
    cut = opts.get("cut", False)
    x, y, z = opts.get("loc", (0, 0, 0))
    ring = Ring(x, y, 0.0, CUT_END if cut else TAU, cut)
    hc, w = 0.32 * r, 0.035 * r
    nested = nested_offsets(r, hc, w)
    objs: list[bpy.types.Object] = []
    anchors: dict[str, Vec3] = {}
    zc = z
    for part in coin_parts(r, colors, hc, w):
        zz = zc if exploded > 0 else z + nested.get(part.name, 0.0)
        obj, anchors[part.name] = place_part(part, ring, zz)
        objs.append(obj)
        zc = zz + part.h + exploded
    return objs, with_prefix(opts.get("prefix", ""), anchors)
