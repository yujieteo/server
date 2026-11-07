# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_wind.py
import math
from itertools import pairwise
from typing import TypedDict, Unpack

import bmesh
from apparatus3d_core import TAU, Built, Mat, Part, Rng, Vec3, add, anchor, bm_obj, box, chaikin, done, lathe, new_part
from apparatus3d_materials import painted
from mathutils import Euler, Vector

SECTIONS = 16
ROOT_T = 0.04
RING = 10
Ring = list[bmesh.types.BMVert]


class TurbineOpts(TypedDict, total=False):
    blade: float
    yaw: float
    seed: int
    color: str
    rotor_angle: float | None


def chord_at(height: float, length: float, t: float) -> float:
    if t < ROOT_T:
        return 0.022 * height
    return length * (0.075 * min(1, (t - 0.04) / 0.16 + 0.55) * (1 - 0.75 * max(0, t - 0.2) / 0.8))


def blade_ring(bm: bmesh.types.BMesh, dims: tuple[float, float, float], rot: float, t: float) -> Ring:
    height, length, yh = dims
    r = 0.03 * height + t * length
    chord = chord_at(height, length, t)
    thk = chord * (0.35 - 0.23 * t)
    tw = math.radians(16 * (1 - t))
    ring: Ring = []
    for k in range(RING):
        a = TAU * k / RING
        u = 0.5 * chord * math.cos(a) - 0.15 * chord
        w = 0.5 * thk * math.sin(a) * (1 if math.sin(a) > 0 else 0.6)
        cu, cw = u * math.cos(tw) - w * math.sin(tw), u * math.sin(tw) + w * math.cos(tw)
        xx = cu * math.cos(rot) - r * math.sin(rot)
        zz = cu * math.sin(rot) + r * math.cos(rot)
        ring.append(bm.verts.new((xx, yh - 0.03 * height + cw, height + zz)))
    return ring


def blade(bm: bmesh.types.BMesh, dims: tuple[float, float, float], rot: float) -> None:
    secs = [blade_ring(bm, dims, rot, s / SECTIONS) for s in range(SECTIONS + 1)]
    for a, c in pairwise(secs):
        for k in range(RING):
            _ = bm.faces.new((a[k], a[(k + 1) % RING], c[(k + 1) % RING], c[k]))
    _ = bm.faces.new(list(reversed(secs[0])))
    _ = bm.faces.new(secs[-1])


def head(pt: Part, height: float, yh: float, mat: Mat) -> None:
    prof = [(0.05 * height, 0), (0.046 * height, 0.02), (0.028 * height, height * 0.97), (0, height * 0.97)]
    add(pt, lathe(prof, mat, 48, name="tower", sharp_deg=60))
    add(pt, box((0.1 * height, 0.2 * height, 0.085 * height), (0, 0.04 * height, height), mat, 0.02 * height))
    nose = [(0, 0), (0.035 * height, 0.0), (0.042 * height, 0.03 * height), (0.03 * height, 0.07 * height)]
    sp = lathe(chaikin([*nose, (0, 0.1 * height)], 2), mat, 48, name="spinner")
    sp.rotation_euler = Euler((math.pi / 2, 0, 0))
    sp.location = Vector((0, yh, height))
    add(pt, sp)


def wind_turbine(loc: Vec3 = (0, 0, 0), hub_height: float = 2.0, **kw: Unpack[TurbineOpts]) -> Built:
    pt = new_part(loc, kw.get("yaw", 0.0))
    rr = Rng(kw.get("seed", 0))
    wm = painted(kw.get("color", "#dde1e5"), 0.35, 0.3)
    height = hub_height
    yh = -0.07 * height
    head(pt, height, yh, wm)
    rotor = kw.get("rotor_angle")
    ang0 = rr.uniform(0, TAU / 3) if rotor is None else math.radians(rotor)
    length = kw.get("blade", 0.85) * height
    bm = bmesh.new()
    for b in range(3):
        blade(bm, (height, length, yh), ang0 + TAU * b / 3)
    rot = ang0
    anchor(pt, "tip", (-length * math.sin(rot), yh, height + length * math.cos(rot)))
    add(pt, bm_obj("blades", bm, wm, smooth=True, sharp_deg=60))
    anchor(pt, "hub", (0, yh - 0.1 * height, height))
    anchor(pt, "base", (0, 0, 0))
    anchor(pt, "nacelle", (0, 0.12 * height, height + 0.05 * height))
    return done(pt)
