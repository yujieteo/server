# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_cryo.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import TAU, Built, Part, Vec3, add, anchor, box, chaikin, done, lathe, new_part
from apparatus3d_materials import brushed_metal, gold_plating, painted
from scene import cylinder

STAGES = ("300 K", "50 K", "4 K", "Still", "Cold plate", "MXC")
RADII = (1.15, 1.02, 0.92, 0.78, 0.68, 0.6)
STANDOFF_LEVEL = 2
STANDOFF_G10_LEVEL = 3


class FridgeOpts(TypedDict, total=False):
    stages: tuple[str, ...]
    radii: tuple[float, ...]
    spacing: float
    n_lines: int
    sample: bool
    gold: str
    rot: float
    seed: int


@dataclass(frozen=True)
class Fridge:
    stages: tuple[str, ...]
    radii: tuple[float, ...]
    zs: list[float]
    au: bpy.types.Material
    ss: bpy.types.Material
    g10: bpy.types.Material


def plate(pt: Part, fr: Fridge, i: int) -> float:
    r, z = fr.radii[i], fr.zs[i]
    th = 0.07 if i == 0 else 0.045
    prof = chaikin([(0, z - th), (r - 0.02, z - th), (r, z - th + 0.01), (r, z - 0.01), (r - 0.02, z)], 1)
    add(pt, lathe([*prof, (0, z)], fr.ss if i == 0 else fr.au, 128, name="plate", sharp_deg=45))
    n = 10 if i == 0 else 8
    for k in range(n):
        a = TAU * (k + 0.5) / n
        p0 = (0.9 * r * math.cos(a), 0.9 * r * math.sin(a), z)
        add(pt, cylinder(p0, (p0[0], p0[1], z + 0.018), 0.022, fr.ss, 6))
    anchor(pt, "stage." + fr.stages[i], (r, 0, z - th / 2))
    anchor(pt, "stage_c." + fr.stages[i], (0, 0, z))
    return th


def standoffs(pt: Part, fr: Fridge, i: int, th: float) -> None:
    rn, zn, z = fr.radii[i + 1], fr.zs[i + 1], fr.zs[i]
    for k in range(3):
        a = TAU * k / 3 + 0.5
        x, y = 0.78 * rn * math.cos(a), 0.78 * rn * math.sin(a)
        mat = fr.g10 if i < STANDOFF_G10_LEVEL else fr.au
        add(pt, cylinder((x, y, zn), (x, y, z - th), 0.035 if i < STANDOFF_LEVEL else 0.025, mat, 32))


def pots(pt: Part, fr: Fridge) -> None:
    if "Still" in fr.stages:
        z = fr.zs[fr.stages.index("Still")]
        prof = [*chaikin([(0, z - 0.3), (0.2, z - 0.3), (0.2, z - 0.05)], 2), (0.2, z - 0.045), (0, z - 0.045)]
        add(pt, lathe(prof, fr.au, 64, (0.18, 0.15, 0), "still"))
    zm = fr.zs[-1] - 0.045
    add(
        pt,
        lathe([*chaikin([(0, zm - 0.3), (0.16, zm - 0.3), (0.16, zm)], 2), (0, zm)], fr.au, 64, (-0.3, 0.12, 0), "mxc"),
    )


def coax_lines(pt: Part, fr: Fridge, n_lines: int) -> None:
    coax = brushed_metal("#c8c2b8", 0.25, "z")
    att = gold_plating("#d8a640", 0.25)
    zs = fr.zs
    for n in range(n_lines):
        a = math.radians(-120 + 60 * n / max(1, n_lines - 1)) if n_lines > 1 else -math.pi / 2
        rl = 0.42 * fr.radii[-1]
        x, y = rl * math.cos(a), rl * math.sin(a)
        add(pt, cylinder((x, y, zs[0] + 0.25), (x, y, zs[-1] - 0.25), 0.012, coax, 16))
        add(pt, cylinder((x, y, zs[0] + 0.1), (x, y, zs[0] + 0.25), 0.028, fr.ss, 24))
        for i in range(1, len(fr.stages)):
            add(pt, cylinder((x, y, zs[i] + 0.05), (x, y, zs[i] + 0.17), 0.028, att, 24))
        anchor(pt, f"line{n}", (x, y, zs[0] + 0.25))


def sample_box(pt: Part, fr: Fridge) -> None:
    zb = fr.zs[-1] - 0.05
    add(pt, cylinder((0.1, -0.05, zb), (0.1, -0.05, zb - 0.45), 0.05, fr.au, 32))
    add(pt, box((0.46, 0.34, 0.2), (0.1, -0.05, zb - 0.55), fr.au, 0.015))
    anchor(pt, "sample", (0.1, -0.22, zb - 0.55))


def dilution_fridge(loc: Vec3 = (0, 0, 0), **kw: Unpack[FridgeOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    stages = kw.get("stages", STAGES)
    spacing = kw.get("spacing", 0.62)
    au = gold_plating(kw.get("gold", "#e2b04a"), 0.2)
    ss = brushed_metal("#c9cdd2", 0.3, "radial")
    fr = Fridge(
        stages, kw.get("radii", RADII), [-i * spacing for i in range(len(stages))], au, ss, painted("#b8b27a", 0.5, 0.2)
    )
    for i in range(len(stages)):
        th = plate(pt, fr, i)
        if i + 1 < len(stages):
            standoffs(pt, fr, i, th)
    pots(pt, fr)
    coax_lines(pt, fr, kw.get("n_lines", 4))
    if kw.get("sample", True):
        sample_box(pt, fr)
    return done(pt)
