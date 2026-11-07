# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_glass.py
import math
from dataclasses import dataclass
from itertools import pairwise
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import (
    TAU,
    Built,
    Part,
    Pts,
    Vec3,
    add,
    anchor,
    chaikin,
    done,
    lathe,
    lathe_data,
    mesh_obj,
    new_part,
    offset2d,
)
from apparatus3d_materials import glass_tint, liquid, matte, painted

HEIGHTS = {"beaker": 2.7, "flask": 3.1, "round": 3.3, "vial": 4.2, "tube": 7.0}
NECKS = {"flask": 0.3, "round": 0.28, "vial": 0.72}
SPOUT_ANGLE = math.radians(-40)
SPOUT_WIDTH = 0.28
SPOUT_BAND = 0.16
GRAD_SEGMENTS = 14
ROUND_STEPS = 40
TUBE_STEPS = 16
MENISCUS_STEPS = 12
EPS = 1e-6


class VesselOpts(TypedDict, total=False):
    height: float
    fill: float
    liquid_color: str
    liquid_opacity: float
    wall: float
    neck: float
    glass: bpy.types.Material
    spout: bool
    graduations: int
    grad_color: str
    cap: str
    rot: float
    seed: int


@dataclass(frozen=True)
class Shell:
    kind: str
    radius: float
    h: float
    rn: float
    wt: float
    outer: Pts
    inner: Pts


def round_outer(rb: float, h: float, rn: float) -> Pts:
    t1 = math.pi - math.asin(min(rn / rb, 0.99))
    pts = [(rb * math.sin(t), rb * (1 - math.cos(t))) for t in [t1 * i / ROUND_STEPS for i in range(ROUND_STEPS + 1)]]
    neck = [(rn, 2 * rb + 0.1 * (h - 2 * rb)), (rn, 2 * rb + 0.5 * (h - 2 * rb))]
    return [*chaikin(pts + neck, 2), (rn, h * 0.985), (rn * 1.12, h)]


def vessel_outer(kind: str, r: float, h: float, rn: float) -> Pts:
    c = min(0.12 * r, 0.08)
    if kind == "beaker":
        return [*chaikin([(0, 0), (r * 0.5, 0), (r, 0), (r, c * 1.5)], 3), (r, h * 0.97), (r * 1.035, h)]
    if kind == "flask":
        base = [(0, 0), (r * 0.5, 0), (r, 0), (r, c), (rn * 1.05, h * 0.66), (rn, h * 0.74), (rn, h * 0.86)]
        return [*chaikin(base, 3), (rn, h * 0.97), (rn * 1.12, h)]
    if kind == "round":
        return round_outer(r, h, rn)
    if kind == "vial":
        return [
            *chaikin([(0, 0), (r * 0.5, 0), (r, 0), (r, c * 2), (r, h * 0.8), (rn, h * 0.86), (rn, h * 0.9)], 3),
            (rn, h),
        ]
    if kind == "tube":
        arc = [
            (r * math.sin(t), r * (1 - math.cos(t)))
            for t in [math.pi / 2 * i / TUBE_STEPS for i in range(TUBE_STEPS + 1)]
        ]
        return [*arc, (r, h * 0.98), (r * 1.08, h)]
    raise ValueError(kind)


def make_shell(kind: str, radius: float, kw: VesselOpts) -> Shell:
    h = kw.get("height") or HEIGHTS[kind] * radius
    rn = kw.get("neck") or NECKS.get(kind, 1.0) * radius
    wt = kw.get("wall") or max(0.018, 0.045 * radius)
    outer = vessel_outer(kind, radius, h, rn)
    inner = offset2d(outer[:-1] if kind != "vial" else outer, wt)
    inner[0] = (0.0, inner[0][1])
    return Shell(kind, radius, h, rn, wt, outer, inner)


def spout_shift(v: list[Vec3], radius: float, h: float) -> list[Vec3]:
    out = list(v)
    for i, (x, y, z) in enumerate(v):
        da = (math.atan2(y, x) - SPOUT_ANGLE + math.pi) % TAU - math.pi
        wgt = math.exp(-((da / SPOUT_WIDTH) ** 2)) * max(0.0, (z - (h - SPOUT_BAND * h)) / (SPOUT_BAND * h))
        r = math.hypot(x, y)
        if r > EPS:
            k = (r + 0.14 * radius * math.pow(wgt, 1.5)) / r
            out[i] = (x * k, y * k, z + 0.03 * h * wgt)
    return out


def shell_mesh(shell: Shell, kw: VesselOpts) -> bpy.types.Object:
    outer, inner, wt = shell.outer, shell.inner, shell.wt
    lip = outer[-1]
    top_in = (inner[-1][0], lip[1])
    prof = [*outer, ((lip[0] + top_in[0]) / 2, lip[1] + wt * 0.35), top_in, *list(reversed(inner))]
    v, f = lathe_data(prof, 96)
    if kw.get("spout", True) and shell.kind == "beaker":
        v = spout_shift(v, shell.radius, shell.h)
    return mesh_obj("vessel", v, f, kw.get("glass") or glass_tint(), smooth=True, sharp_deg=60)


def fill_radius(inner: Pts, zf: float, default: float, wt: float) -> float:
    for a, b in pairwise(inner):
        if a[1] <= zf <= b[1] and b[1] > a[1]:
            return a[0] + (b[0] - a[0]) * (zf - a[1]) / (b[1] - a[1]) + 0.35 * wt
    return default


def add_liquid(pt: Part, shell: Shell, kw: VesselOpts) -> None:
    inner, wt, radius = shell.inner, shell.wt, shell.radius
    zin0 = inner[0][1]
    zf = zin0 + kw.get("fill", 0.55) * (max(z for _, z in inner) - zin0)
    lq = [p for p in offset2d(inner, -0.35 * wt) if p[1] < zf]
    lq[0] = (0.0, zin0 - 0.2 * wt)
    rf = fill_radius(inner, zf, lq[-1][0], wt)
    m = min(0.06 * radius, 0.35 * rf)
    steps = [i / MENISCUS_STEPS for i in range(MENISCUS_STEPS + 1)]
    men = [(rf - 3 * m * s, zf + m * math.exp(-4 * s) - m * math.exp(-4)) for s in steps]
    lq = [*lq, (rf, zf + m), *men[1:], (0.0, zf)]
    v2, f2 = lathe_data(lq, 96)
    mat = liquid(kw.get("liquid_color", "#3a8fd0"), kw.get("liquid_opacity", 0.45))
    add(pt, mesh_obj("liquid", v2, f2, mat, smooth=True, sharp_deg=70))
    anchor(pt, "liquid", (0, 0, zf))
    anchor(pt, "liquid_side", (0, -rf, zf))
    anchor(pt, "body", (0, -radius, zin0 + 0.5 * (zf - zin0)))


def radius_at(prof: Pts, z: float) -> float:
    for a, b in pairwise(prof):
        if min(a[1], b[1]) <= z <= max(a[1], b[1]) and a[1] != b[1]:
            return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])
    return prof[-1][0]


def grad_mark(rad: float, z: float, span: float, h: float) -> tuple[list[Vec3], list[tuple[int, ...]]]:
    a0 = -math.pi / 2 - 0.55
    vv: list[Vec3] = []
    for k in range(GRAD_SEGMENTS + 1):
        a = a0 + span * k / GRAD_SEGMENTS
        vv.extend((rad * math.cos(a), rad * math.sin(a), z + dz) for dz in (-0.006 * h, 0.006 * h))
    return vv, [(2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1) for k in range(GRAD_SEGMENTS)]


def add_graduations(pt: Part, shell: Shell, kw: VesselOpts) -> None:
    count = kw.get("graduations", 4)
    if not count or shell.kind not in {"beaker", "flask"}:
        return
    gmat = matte(kw.get("grad_color", "#6f8594"), 0.6)
    h = shell.h
    top = h * (0.8 if shell.kind == "beaker" else 0.55)
    for i in range(count):
        z = h * 0.2 + (top - h * 0.2) * (i + 1) / count
        vv, ff = grad_mark(radius_at(shell.outer, z) + 0.003, z, 0.28 if i % 2 == 0 else 0.16, h)
        add(pt, mesh_obj("grad", vv, ff, gmat, smooth=False))


def add_cap(pt: Part, shell: Shell, kw: VesselOpts) -> None:
    h, rn = shell.h, shell.rn
    ch = 0.14 * h
    prof = [*chaikin([(0, h + ch), (rn * 1.18, h + ch), (rn * 1.18, h - 0.02 * h)], 2), (rn * 1.0, h - 0.02 * h)]
    add(pt, lathe(prof, painted(kw.get("cap", "#2f5d9c"), 0.45), 64, name="cap"))
    anchor(pt, "cap", (0, 0, h + ch))


def vessel(kind: str = "beaker", loc: Vec3 = (0, 0, 0), radius: float = 0.5, **kw: Unpack[VesselOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    shell = make_shell(kind, radius, kw)
    add(pt, shell_mesh(shell, kw))
    if kw.get("fill", 0.55) > 0:
        add_liquid(pt, shell, kw)
    add_graduations(pt, shell, kw)
    if kind == "vial":
        add_cap(pt, shell, kw)
    anchor(pt, "rim", (0, 0, shell.h))
    anchor(pt, "bottom", (0, 0, 0))
    anchor(pt, "neck", (0, -shell.rn, shell.h * 0.9))
    return done(pt)


def beaker(loc: Vec3 = (0, 0, 0), radius: float = 0.5, **kw: Unpack[VesselOpts]) -> Built:
    return vessel("beaker", loc, radius, **kw)


def flask(loc: Vec3 = (0, 0, 0), radius: float = 0.5, **kw: Unpack[VesselOpts]) -> Built:
    return vessel("flask", loc, radius, **kw)


def vial(loc: Vec3 = (0, 0, 0), radius: float = 0.2, **kw: Unpack[VesselOpts]) -> Built:
    return vessel("vial", loc, radius, **kw)
