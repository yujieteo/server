# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_trap.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import Built, Part, Vec2, Vec3, add, anchor, box, done, mesh_obj, new_part, no_shadow, sphere
from apparatus3d_materials import glow, gold_plating, halo, painted

R0 = 0.2
DEPTH = 0.5
TIP_W = 0.012
BACK_W = 0.07
BLADE_FACES = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
CHIP_W = 1.8
CHIP_T = 0.1
ELEC_T = 0.012
GAP = 0.025
ANGLES = (45, 135, 225, 315)
SEGMENTED = 1


class TrapOpts(TypedDict, total=False):
    n_ions: int
    ion_color: str
    spacing: float
    length: float
    segments: int
    electrode: str
    substrate: str
    rot: float
    seed: int


@dataclass(frozen=True)
class Trap:
    au: bpy.types.Material
    length: float
    segments: int


def ions(pt: Part, xs: list[float], yz: Vec2, color: str, r: float) -> None:
    y, z = yz
    core = glow(color, 5.0)
    hal = halo(color, 1.3, 2.2)
    for i, x in enumerate(xs):
        h_ = sphere((x, y, z), r * 3.2, hal, 32)
        h_.visible_glossy = False
        ion = sphere((x, y, z), r, core, 24)
        no_shadow([ion, h_])
        add(pt, ion)
        add(pt, h_)
        anchor(pt, f"ion{i}", (x, y, z))


def blade_verts(x0: float, x1: float, e: Vec2) -> list[Vec3]:
    ey, ez = e
    ny, nz = -ez, ey
    verts: list[Vec3] = []
    for x in (x0, x1):
        for rad, w in [(R0, TIP_W), (R0 + DEPTH, BACK_W)]:
            verts.extend((x, rad * ey + s * w / 2 * ny, rad * ez + s * w / 2 * nz) for s in (-1, 1))
    return verts


def blade_pieces(length: float, segments: int, *, segmented: bool) -> list[Vec2]:
    if not segmented:
        return [(-length / 2, length / 2)]
    return [
        (-length / 2 + k * length / segments + 0.03, -length / 2 + (k + 1) * length / segments - 0.03)
        for k in range(segments)
    ]


def blade_set(pt: Part, tr: Trap, bi: int, ang: float) -> None:
    a = math.radians(ang)
    segd = bi % 2 == SEGMENTED
    ey, ez = math.cos(a), math.sin(a)
    for pi, (x0, x1) in enumerate(blade_pieces(tr.length, tr.segments, segmented=segd)):
        o = mesh_obj("blade", blade_verts(x0, x1, (ey, ez)), BLADE_FACES, tr.au, smooth=False)
        md = o.modifiers.new("bev", "BEVEL")
        md.width = 0.006
        md.segments = 2
        add(pt, o)
        if segd:
            anchor(pt, f"dc{pi}" if bi == 1 else f"dcb{pi}", ((x0 + x1) / 2, (R0 + 0.3) * ey, (R0 + 0.3) * ez))
    cer = painted("#efe9dc", 0.5, 0.15)
    rad = R0 + DEPTH + 0.05
    for xh in (-tr.length / 2 + 0.12, tr.length / 2 - 0.12):
        add(pt, box((0.12, 0.1, 0.14), (xh, rad * ey, rad * ez), cer, 0.012, rot=(a, 0, 0)))


def blade_trap(pt: Part, tr: Trap, xs: list[float], ion_color: str) -> None:
    for bi, ang in enumerate(ANGLES):
        blade_set(pt, tr, bi, ang)
    r45, r135 = math.radians(45), math.radians(135)
    anchor(pt, "rf", (0.4, (R0 + 0.35) * math.cos(r45), (R0 + 0.35) * math.sin(r45)))
    anchor(pt, "dc", (-0.4, (R0 + 0.35) * math.cos(r135), (R0 + 0.35) * math.sin(r135)))
    ions(pt, xs, (0.0, 0.0), ion_color, 0.032)
    anchor(pt, "axis_l", (-tr.length / 2 - 0.3, 0, 0))
    anchor(pt, "axis_r", (tr.length / 2 + 0.3, 0, 0))


def span(a: float, b: float) -> Vec2:
    return (min(a, b), max(a, b))


def strip(pt: Part, au: bpy.types.Material, xr: Vec2, yr: Vec2) -> None:
    x0, x1 = xr
    y0, y1 = yr
    add(pt, box((x1 - x0, y1 - y0, ELEC_T), ((x0 + x1) / 2, (y0 + y1) / 2, ELEC_T / 2), au, 0.003))


def surface_side(pt: Part, tr: Trap, s: int) -> None:
    length, segments = tr.length, tr.segments
    z = ELEC_T / 2
    strip(pt, tr.au, (-length / 2, length / 2), span(s * (0.06 + GAP), s * (0.26 + GAP)))
    for k in range(segments):
        x0 = -length / 2 + k * length / segments + GAP / 2
        x1 = x0 + length / segments - GAP
        strip(pt, tr.au, (x0, x1), span(s * (0.26 + 2 * GAP), s * (CHIP_W / 2 - 0.08)))
        if s < 0:
            anchor(pt, f"dc{k}", ((x0 + x1) / 2, -0.55, z))


def surface_trap(pt: Part, tr: Trap, xs: list[float], kw: TrapOpts) -> None:
    length = tr.length
    add(
        pt,
        box(
            (length + 0.4, CHIP_W, CHIP_T),
            (0, 0, -CHIP_T / 2),
            painted(kw.get("substrate", "#2b2e36"), 0.35, 0.3),
            0.01,
        ),
    )
    z = ELEC_T / 2
    strip(pt, tr.au, (-length / 2, length / 2), (-0.06, 0.06))
    for s in (-1, 1):
        surface_side(pt, tr, s)
    anchor(pt, "rf", (0.6 * length / 2, -0.17, z))
    anchor(pt, "dc", (0, -0.55, z))
    anchor(pt, "chip", (length / 2, -CHIP_W / 2, -CHIP_T / 2))
    ions(pt, xs, (0.0, 0.2), kw.get("ion_color", "#3fb6f2"), 0.03)
    anchor(pt, "axis_l", (-length / 2, 0, 0.2))
    anchor(pt, "axis_r", (length / 2, 0, 0.2))


def ion_trap(kind: str = "blade", loc: Vec3 = (0, 0, 0), **kw: Unpack[TrapOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    tr = Trap(gold_plating(kw.get("electrode", "#e2b04a"), 0.22), kw.get("length", 2.6), kw.get("segments", 5))
    n = kw.get("n_ions", 5)
    xs = [(i - (n - 1) / 2) * kw.get("spacing", 0.2) for i in range(n)]
    if kind == "blade":
        blade_trap(pt, tr, xs, kw.get("ion_color", "#3fb6f2"))
    else:
        surface_trap(pt, tr, xs, kw)
    return done(pt)
