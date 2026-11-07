# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_fluid.py
import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import (
    TAU,
    Anchors,
    Built,
    Obj,
    Part,
    Pts,
    Vec2,
    Vec3,
    add,
    add_all,
    anchor,
    box,
    chaikin,
    done,
    lathe,
    new_part,
    no_shadow,
    tag,
    vec3,
)
from apparatus3d_glass import beaker, vial
from apparatus3d_materials import anodized, brushed_metal, clear_plastic, glass_tint, painted
from apparatus3d_nodes import nbump, ncoord, new_graph, nmath, nparams, nxyz
from mathutils import Vector
from scene import cylinder, fiber_path, hex_rgb
from scene import mat as scene_mat

TUBE_RADIUS = 0.035


class CoilOpts(TypedDict, total=False):
    axis: str
    color: str
    bobbin: str
    turns: int
    rot: float


class CableOpts(TypedDict, total=False):
    liquid_color: str
    connectors: bool
    resolution: int


class PumpOpts(TypedDict, total=False):
    color: str
    rot: float
    seed: int


class CellOpts(TypedDict, total=False):
    liquid_color: str
    turns: int
    rot: float
    seed: int


class LoopOpts(TypedDict, total=False):
    liquid_color: str
    rot: float
    seed: int


@dataclass(frozen=True)
class PumpGeo:
    hx: float
    hz: float
    rh: float
    y0: float


def winding_material(color: str, depth: float, turns: int) -> bpy.types.Material:
    g = new_graph("winding")
    nparams(g, Base_Color=color, Metallic=1.0, Roughness=0.3)
    sp = nxyz(g, ncoord(g))
    wv = nmath(g, "SINE", nmath(g, "MULTIPLY", sp[2], turns / depth * math.pi))
    nbump(g, nmath(g, "ABSOLUTE", wv), 0.35, 0.01)
    return g.m


def rect(r0: float, r1: float, z0: float, z1: float) -> Pts:
    return [(r0, z0), (r1, z0), (r1, z1), (r0, z1)]


def helmholtz_coils(
    loc: Vec3 = (0, 0, 0),
    radius: float = 1.0,
    width: float = 0.2,
    depth: float = 0.2,
    separation: float | None = None,
    **kw: Unpack[CoilOpts],
) -> Built:
    tilt = {"z": (0, 0), "x": (0, 90), "y": (90, 0)}[kw.get("axis", "x")]
    pt = new_part(loc, kw.get("rot", 0), tilt)
    sep = radius if separation is None else separation
    wind = winding_material(kw.get("color", "#c9804f"), depth, kw.get("turns", 60))
    bob = anodized(kw.get("bobbin", "#2a2d33"), 0.5)
    r0, r1 = radius - width / 2, radius + width / 2
    for s in (-1, 1):
        zc = s * sep / 2
        add(pt, lathe(rect(r0, r1, zc - depth / 2, zc + depth / 2), wind, 160, name="coil", closed=True, sharp_deg=30))
        for e in (-1, 1):
            z = zc + e * (depth / 2 + 0.015)
            add(
                pt,
                lathe(
                    rect(r0 - 0.02, r1 + 0.025, z - 0.012, z + 0.012),
                    bob,
                    160,
                    name="flange",
                    closed=True,
                    sharp_deg=30,
                ),
            )
        core = rect(r0 - 0.02, r0 + 0.001, zc - depth / 2 - 0.02, zc + depth / 2 + 0.02)
        add(pt, lathe(core, bob, 160, name="core", closed=True, sharp_deg=30))
        anchor(pt, "coil_a" if s < 0 else "coil_b", (0, r1, zc))
        anchor(pt, "axis_a" if s < 0 else "axis_b", (0, 0, zc + s * 0.6 * radius))
    anchor(pt, "centre", (0, 0, 0))
    return done(pt)


def cable_objs(points: Sequence[Vec3], radius: float, color: str, kind: str, kw: CableOpts) -> list[Obj]:
    res = kw.get("resolution", 24)
    liquid_color = kw.get("liquid_color")
    if kind == "tube":
        outer = fiber_path(points, radius, clear_plastic(), res)
        no_shadow(outer)
        objs = [outer]
        if liquid_color:
            objs.append(fiber_path(points, radius * 0.55, painted(liquid_color, 0.2, 0.5), res))
        return objs
    if kind == "coax":
        return [fiber_path(points, radius, brushed_metal("#c8c2b8", 0.25), res)]
    return [fiber_path(points, radius, painted(color, 0.45, 0.15), res)]


def cable(
    points: Sequence[Vec3], radius: float = 0.03, color: str = "#2a2d33", kind: str = "cable", **kw: Unpack[CableOpts]
) -> Built:
    objs = cable_objs(points, radius, color, kind, kw)
    if kw.get("connectors", True) and kind != "tube":
        m = brushed_metal("#d0d4d8", 0.22, "radial")
        for p, q in [(points[0], points[1]), (points[-1], points[-2])]:
            a, b = Vector(p), Vector(q)
            d = (b - a).normalized()
            objs.append(
                cylinder(vec3(a - d * 0.02), vec3(a + d * radius * 4), radius * 1.5, m, 6 if kind == "coax" else 32)
            )
    anchors = Anchors()
    anchors["start"] = points[0]
    anchors["end"] = points[-1]
    anchors["mid"] = points[len(points) // 2]
    return objs, anchors


def pump_housing(pt: Part, size: Vec3, color: str) -> PumpGeo:
    length, w, hh = size
    add(pt, box((length, w, hh), (0, 0, hh / 2), painted(color, 0.4, 0.3), 0.04))
    lcd = scene_mat(
        "lcd",
        **{
            "Base Color": hex_rgb("#27405c"),
            "Roughness": 0.1,
            "Emission Color": hex_rgb("#5aa0d8"),
            "Emission Strength": 0.25,
        },
    )
    add(pt, box((length * 0.4, 0.01, hh * 0.22), (-length * 0.22, -w / 2 - 0.004, hh * 0.72), lcd))
    for k in range(3):
        x = -length * 0.36 + k * 0.14
        add(pt, cylinder((x, -w / 2, hh * 0.35), (x, -w / 2 - 0.03, hh * 0.35), 0.04, painted("#3b3f46", 0.4), 24))
    return PumpGeo(length * 0.22, hh * 0.52, hh * 0.3, -w / 2)


def pump_head(pt: Part, gm: PumpGeo) -> list[Vec3]:
    hx, hz, rh, y0 = gm.hx, gm.hz, gm.rh, gm.y0
    add(pt, cylinder((hx, y0, hz), (hx, y0 - 0.08, hz), rh * 1.15, anodized("#30343a"), 64))
    steel = brushed_metal("#cfd3d7", 0.2, "radial")
    add(pt, cylinder((hx, y0 - 0.08, hz), (hx, y0 - 0.17, hz), rh * 0.55, steel, 48))
    for k in range(4):
        a = TAU * k / 4 + 0.3
        x, z = hx + rh * 0.62 * math.cos(a), hz + rh * 0.62 * math.sin(a)
        add(pt, cylinder((x, y0 - 0.08, z), (x, y0 - 0.17, z), rh * 0.2, steel, 32))
    angs = [math.pi + 0.35 - (math.pi + 0.7) * t / 12 for t in range(13)]
    loop = [(hx + rh * 0.86 * math.cos(a), y0 - 0.125, hz + rh * 0.86 * math.sin(a)) for a in angs]
    tpts = [(hx - rh * 2.2, y0 - 0.125, hz - rh * 0.9), *loop, (hx + rh * 2.2, y0 - 0.125, hz - rh * 0.9)]
    add(pt, fiber_path(tpts, 0.03, painted("#e9c9a0", 0.3, 0.4), 32))
    add(pt, cylinder((hx, y0 - 0.17, hz), (hx, y0 - 0.19, hz), rh * 1.12, glass_tint("#eef5f7", "#8fa8b5", 0.45), 64))
    return tpts


def peristaltic_pump(loc: Vec3 = (0, 0, 0), size: Vec3 = (1.1, 0.8, 0.6), **kw: Unpack[PumpOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    gm = pump_housing(pt, size, kw.get("color", "#c9ced5"))
    tpts = pump_head(pt, gm)
    anchor(pt, "head", (gm.hx, gm.y0 - 0.19, gm.hz + gm.rh))
    anchor(pt, "tube_in", tpts[0])
    anchor(pt, "tube_out", tpts[-1])
    anchor(pt, "body", (-size[0] * 0.2, -size[1] / 2, size[2]))
    return done(pt)


def serpentine(length: float, w: float, turns: int) -> tuple[list[Vec3], list[float]]:
    zc = 0.075
    x0, x1 = -length * 0.3, length * 0.3
    ys = [w * 0.28 - k * (w * 0.56) / (turns - 1) for k in range(turns)] if turns > 1 else [0.0]
    pts: list[Vec3] = [(-length * 0.36, w * 0.28, zc)]
    for k, y in enumerate(ys):
        a, b = (x0, x1) if k % 2 == 0 else (x1, x0)
        pts += [(a, y, zc), (b, y, zc)]
    pts.append((length * 0.36 if len(ys) % 2 else -length * 0.36, ys[-1], zc))
    return pts, ys


def flow_cell(loc: Vec3 = (0, 0, 0), size: Vec2 = (2.2, 1.0), **kw: Unpack[CellOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    length, w = size
    plate = box((length, w, 0.05), (0, 0, 0.025), glass_tint("#e6f1f4", "#7d9aa9", 0.6), 0.004)
    no_shadow(plate)
    add(pt, plate)
    block = glass_tint("#f1f5f2", "#93a8a4", 0.45, 1.41)
    body = box((length * 0.8, w * 0.82, 0.22), (0, 0, 0.16), block, 0.03)
    no_shadow(body)
    add(pt, body)
    zc = 0.075
    pts, ys = serpentine(length, w, kw.get("turns", 4))
    rounded = chaikin([(p[0], p[1]) for p in pts], 3)
    liquid_mat = painted(kw.get("liquid_color", "#e0564a"), 0.25, 0.4)
    add(pt, fiber_path([(x, y, zc) for x, y in rounded], 0.025, liquid_mat, 4))
    port = brushed_metal("#cdd1d5", 0.2, "z")
    for nm, p in [("inlet", pts[0]), ("outlet", pts[-1])]:
        add(pt, cylinder((p[0], p[1], zc), (p[0], p[1], 0.36), 0.045, port, 32))
        anchor(pt, nm, (p[0], p[1], 0.36))
    anchor(pt, "channel", (0, ys[len(ys) // 2], 0.27))
    anchor(pt, "chip", (length * 0.4, -w * 0.41, 0.2))
    return done(pt)


def loop_tubes(a: Anchors) -> list[list[Vec3]]:
    tin, tout = a["pump.tube_in"], a["pump.tube_out"]
    cin, cout = a["cell.inlet"], a["cell.outlet"]
    return [
        [(-2.6, 0.2, 0.55), (-2.6, 0.2, 1.1), (-2.0, -0.2, 1.0), (-1.7, -0.525, 0.35), tin],
        [tout, (-0.3, -0.53, 0.2), (0.2, -0.3, 0.8), (cin[0], cin[1], cin[2] + 0.3), cin],
        [cout, (cout[0] + 0.1, cout[1], 0.8), (2.6, 0.1, 0.9), (2.85, 0.3, 0.45)],
    ]


def flow_loop(loc: Vec3 = (0, 0, 0), **kw: Unpack[LoopOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    anchors = Anchors()
    liquid_color = kw.get("liquid_color", "#e0564a")
    parts = [
        ("reservoir", vial((-2.6, 0.2, 0), 0.26, fill=0.7, liquid_color=liquid_color)),
        ("pump", peristaltic_pump((-1.1, 0.1, 0))),
        ("cell", flow_cell((1.1, -0.2, 0), liquid_color=liquid_color)),
        ("waste", beaker((2.9, 0.3, 0), 0.34, fill=0.3, liquid_color=liquid_color, graduations=2)),
    ]
    for name, (o, a) in parts:
        add_all(pt, o)
        anchors.update(tag(a, name))
    for i, t in enumerate(loop_tubes(anchors)):
        o, a = cable(t, TUBE_RADIUS, kind="tube", liquid_color=liquid_color)
        add_all(pt, o)
        anchors[f"tube{i}"] = a["mid"]
    objs, _ = done(pt)
    return objs, Anchors({k: vec3(pt.xf @ Vector(v)) for k, v in anchors.items()})
