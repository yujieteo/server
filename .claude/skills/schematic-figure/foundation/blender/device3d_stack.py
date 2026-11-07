# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_stack.py
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from device3d_lattice import lattice
from device3d_mat import material, shade
from device3d_mesh import with_prefix
from device3d_prim import prism
from device3d_types import Anchors, Layer, Poly, Vec2, Vec3

STEP_FRACTION = 0.12
LATTICE_MARGIN = 0.06
LATTICE_LIFT = 0.004
LATTICE_A = 0.075
LATTICE_R = 0.009
BEVEL_FRACTION = 0.3
EDGE_SHARE = 0.15


class StackOpts(TypedDict, total=False):
    footprint: Vec2
    loc: Vec3
    exploded: float
    cut: bool | str
    step: float | None
    bevel: float
    notch: Vec2
    prefix: str


@dataclass(frozen=True)
class Stack:
    w: float
    d: float
    loc: Vec3
    exploded: float
    cut: bool | str
    step: float
    bevel: float
    notch: Vec2
    count: int


@dataclass(frozen=True)
class Box:
    x0: float
    x1: float
    y0: float
    y1: float
    d: float
    xn: float
    yn: float
    corner: bool
    z: float
    t: float


def layer_box(s: Stack, i: int, layer: Layer, z: float) -> Box:
    ins = layer.get("inset", 0.0)
    w, d = s.w - 2 * ins, s.d - 2 * ins
    x0 = s.loc[0] - s.w / 2 + ins
    x1 = x0 + w
    if s.cut == "step":
        x1 = min(x1, s.loc[0] + s.w / 2 - s.step * i) if i else x1
    y0, y1 = s.loc[1] - d / 2, s.loc[1] + d / 2
    corner = s.cut == "corner" and i > 0
    return Box(x0, x1, y0, y1, d, x1 - w * s.notch[0], y0 + d * s.notch[1], corner, z, layer["thickness"])


def box_poly(b: Box) -> Poly:
    if b.corner:
        return [(b.xn, b.y0), (b.xn, b.yn), (b.x1, b.yn), (b.x1, b.y1), (b.x0, b.y1), (b.x0, b.y0)]
    return [(b.x0, b.y0), (b.x1, b.y0), (b.x1, b.y1), (b.x0, b.y1)]


def layer_lattice(layer: Layer, b: Box, loc: Vec3, ztop: float) -> list[bpy.types.Object]:
    objs, _ = lattice(
        layer.get("lattice", ""),
        a=layer.get("lattice_a", LATTICE_A),
        size=(b.x1 - b.x0 - LATTICE_MARGIN, b.d - LATTICE_MARGIN),
        loc=((b.x0 + b.x1) / 2, loc[1], ztop + LATTICE_LIFT),
        colors=[layer.get("lattice_color") or shade(layer.get("color") or "#30343b", -0.35)],
        style="stick",
        bond_radius=layer.get("lattice_r", LATTICE_R),
    )
    return objs


def layer_anchors(s: Stack, i: int, label: str, b: Box) -> Anchors:
    z, t = b.z, b.t
    xe = b.xn if b.corner else b.x1
    out: Anchors = {label + ".side": ((b.x0 + xe) / 2, b.y0, z + t / 2), label + ".edge": (xe, b.y0, z + t / 2)}
    if s.cut == "step":
        last = i + 1 >= s.count
        nx = b.x0 if last else b.x1 - s.step
        out[label] = ((b.x0 + b.x1) / 2 if last else (nx + b.x1) / 2, s.loc[1] - b.d * EDGE_SHARE, z + t)
    elif b.corner:
        out[label] = (b.x1, b.yn, z + t / 2)
    else:
        out[label] = (b.x1, b.y0, z + t / 2)
    return out


def build_layer(s: Stack, i: int, layer: Layer, z: float) -> tuple[list[bpy.types.Object], Anchors]:
    t = layer["thickness"]
    label = layer.get("label", f"layer{i}")
    mat = material(layer.get("kind", "oxide"), layer.get("color"), layer.get("alpha"))
    b = layer_box(s, i, layer, z)
    objs = [prism(box_poly(b), z, z + t, mat, bevel=min(s.bevel, t * BEVEL_FRACTION), name=label)]
    if layer.get("lattice"):
        objs += layer_lattice(layer, b, s.loc, z + t)
    return objs, layer_anchors(s, i, label, b)


def layer_stack(layers: Sequence[Layer], **opts: Unpack[StackOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    w, d = opts.get("footprint", (3.0, 2.0))
    loc = opts.get("loc", (0, 0, 0))
    step = opts.get("step")
    cut = opts.get("cut", False)
    s = Stack(
        w,
        d,
        loc,
        opts.get("exploded", 0.0),
        "step" if cut is True else cut,
        w * STEP_FRACTION if step is None else step,
        opts.get("bevel", 0.02),
        opts.get("notch", (0.42, 0.5)),
        len(layers),
    )
    z = loc[2]
    objs: list[bpy.types.Object] = []
    anchors: Anchors = {}
    for i, layer in enumerate(layers):
        made, found = build_layer(s, i, layer, z)
        objs += made
        anchors.update(found)
        z += layer["thickness"] + (s.exploded if i + 1 < s.count else 0)
    anchors["top"] = (loc[0], loc[1], z)
    anchors["bottom"] = (loc[0], loc[1] - d / 2, loc[2])
    return objs, with_prefix(opts.get("prefix", ""), anchors)
