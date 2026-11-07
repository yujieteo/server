# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_block.py
import math
from dataclasses import dataclass, replace
from typing import TypedDict, Unpack

import bmesh
from apparatus3d_core import (
    Built,
    HeightSpec,
    Mat,
    Obj,
    Part,
    Terrain,
    Vec3,
    add,
    anchor,
    bm_obj,
    done,
    mesh_obj,
    new_part,
)
from apparatus3d_height import axis_samples, height_at, perimeter, phases, river_at, river_strip, water_level
from apparatus3d_materials import water
from apparatus3d_strata import Layers, Strata, strata_mat, surface_mat
from mathutils import Vector

DEFAULT_LAYERS: Layers = [(0.35, "#d8c08a"), (0.3, "#b7875a"), (0.4, "#e2d3a8"), (0.35, "#9c6b4e"), (0.5, "#7f7a74")]
CUT_SAMPLES = 400
NOTCH = 1e-5


class Fault(TypedDict, total=False):
    x: float
    dip: float
    throw: float


class BlockOpts(TypedDict, total=False):
    seed: int
    layers: Layers
    relief: float
    scale: float
    res: int
    fault: Fault
    water_table: float
    river: bool
    surface: str
    soil: str
    undulation: float
    gap: float
    rot: float


@dataclass(frozen=True)
class BlockGrid:
    sp: HeightSpec
    xs: list[float]
    ys: list[float]
    heights: dict[tuple[int, int], float]
    ztop: float
    zbot: float


@dataclass(frozen=True)
class BlockCtx:
    bg: BlockGrid
    top_m: Mat
    st: Strata
    gap: float


def block_grid(sp: HeightSpec, sz: float, res: int) -> BlockGrid:
    nx, ny = res, max(8, int(res * sp.sy / sp.sx))
    xs, ys = axis_samples(sp.sx, nx), axis_samples(sp.sy, ny)
    ztop = sz / 2
    heights = {(i, j): ztop + height_at(sp, xs[i], ys[j]) for i in range(nx + 1) for j in range(ny + 1)}
    return BlockGrid(sp, xs, ys, heights, ztop, -sz / 2)


def build_block(bg: BlockGrid) -> bmesh.types.BMesh:
    nx, ny = len(bg.xs) - 1, len(bg.ys) - 1
    bm = bmesh.new()
    hl = bm.verts.layers.float.new("hsurf")
    top: dict[tuple[int, int], bmesh.types.BMVert] = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            v = bm.verts.new((bg.xs[i], bg.ys[j], bg.heights[i, j]))
            v[hl] = bg.heights[i, j]
            top[i, j] = v
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1])).material_index = 0
    per = perimeter(nx, ny)
    bot: dict[tuple[int, int], bmesh.types.BMVert] = {}
    for k in per:
        v = bm.verts.new((bg.xs[k[0]], bg.ys[k[1]], bg.zbot))
        v[hl] = bg.heights[k]
        bot[k] = v
    for a, b in zip(per, per[1:] + per[:1], strict=True):
        bm.faces.new((top[a], bot[a], bot[b], top[b])).material_index = 1
    bm.faces.new([bot[k] for k in reversed(per)]).material_index = 1
    bm.normal_update()
    return bm


def fault_halves(pt: Part, cx: BlockCtx, fault: Fault) -> None:
    fx = fault.get("x", 0.0)
    dip = math.radians(fault.get("dip", 60))
    throw = fault.get("throw", 0.3)
    n = Vector((math.sin(dip), 0, math.cos(dip)))
    for side in (1, -1):
        bm = build_block(cx.bg)
        _ = bmesh.ops.bisect_plane(
            bm,
            geom=[*bm.verts, *bm.edges, *bm.faces],
            dist=NOTCH,
            plane_co=Vector((fx, 0, 0)),
            plane_no=n,
            clear_inner=(side == 1),
            clear_outer=(side == -1),
        )
        filled = bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
        for f in filled["faces"]:
            f.material_index = 1
        bmesh.ops.translate(bm, verts=bm.verts, vec=n * (cx.gap / 2) * side)
        sm = strata_mat("strata", replace(cx.st, offset=throw if side == 1 else 0.0))
        add(pt, bm_obj("terrain", bm, [cx.top_m, sm], smooth=True, sharp_deg=50, flat=(1,)))
    sy, ztop, zbot = cx.bg.sp.sy, cx.bg.ztop, cx.bg.zbot
    xt = fx - ztop * math.cos(dip) / math.sin(dip)
    anchor(pt, "fault_top", (xt, -sy / 2, ztop + height_at(cx.bg.sp, xt, -sy / 2)))
    anchor(pt, "fault_mid", (fx, -sy / 2, 0.0))
    anchor(pt, "fault_bottom", (fx - zbot * math.cos(dip) / math.sin(dip), -sy / 2, zbot))


def river_cut(bg: BlockGrid, edge: tuple[float, float, float, float], zw: float, mat: Mat) -> Obj | None:
    ax0, ay0, ax1, ay1 = edge
    vv: list[Vec3] = []
    for k in range(CUT_SAMPLES + 1):
        x = ax0 + (ax1 - ax0) * k / CUT_SAMPLES
        y = ay0 + (ay1 - ay0) * k / CUT_SAMPLES
        zb = bg.ztop + height_at(bg.sp, x, y)
        vv += [(x, y, min(zb, zw)), (x, y, zw)]
    ff = [
        (2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1)
        for k in range(CUT_SAMPLES)
        if vv[2 * k][2] < zw - NOTCH or vv[2 * k + 2][2] < zw - NOTCH
    ]
    if not ff:
        return None
    o = mesh_obj("river_cut", vv, ff, mat, smooth=False)
    dxn, dyn = ay1 - ay0, -(ax1 - ax0)
    length = math.hypot(dxn, dyn)
    o.location = Vector((dxn / length * 0.002, dyn / length * 0.002, 0))
    return o


def block_river(pt: Part, bg: BlockGrid) -> None:
    sp = bg.sp
    sx, sy = sp.sx, sp.sy
    zw = bg.ztop + water_level(sp)
    add(pt, river_strip(sp, zw, 0.5, water("#3d8fc6", 0.25)))
    ws = water("#2f79b3", 0)
    edges = [(-sx / 2, -sy / 2, sx / 2, -sy / 2), (sx / 2, sy / 2, -sx / 2, sy / 2)]
    edges += [(-sx / 2, sy / 2, -sx / 2, -sy / 2), (sx / 2, -sy / 2, sx / 2, sy / 2)]
    for edge in edges:
        cut = river_cut(bg, edge, zw, ws)
        if cut is not None:
            add(pt, cut)
    anchor(pt, "river", (0.0, river_at(sp, 0.0), zw))
    anchor(pt, "river_front", (-sx / 2 + 0.3, river_at(sp, -sx / 2 + 0.3), zw))


def block_anchors(pt: Part, bg: BlockGrid, layers: Layers, water_table: float | None) -> None:
    sx, sy = bg.sp.sx, bg.sp.sy
    ztop, zbot = bg.ztop, bg.zbot
    anchor(pt, "surface", (-0.25 * sx, -0.25 * sy, ztop + height_at(bg.sp, -0.25 * sx, -0.25 * sy)))
    zc = ztop
    for i, (th, _) in enumerate(layers):
        zm = zc - th / 2 if i < len(layers) - 1 else (zc + zbot) / 2
        anchor(pt, f"layer{i}", (0.3 * sx, -sy / 2, zm))
        zc -= th
    if water_table is not None:
        anchor(pt, "water_table", (-0.35 * sx, -sy / 2, water_table))
    corners = {"corner_fl": (-sx / 2, -sy / 2), "corner_fr": (sx / 2, -sy / 2)}
    corners.update({"corner_bl": (-sx / 2, sy / 2), "corner_br": (sx / 2, sy / 2)})
    for nm, (x, y) in corners.items():
        anchor(pt, nm, (x, y, zbot))


def block_spec(size: Vec3, kw: BlockOpts) -> HeightSpec:
    seed = kw.get("seed", 1)
    return HeightSpec(
        seed=seed,
        sx=size[0],
        sy=size[1],
        relief=kw.get("relief", 0.22),
        scale=kw.get("scale", 0.35),
        river=kw.get("river", True),
        coast=False,
        river_depth=0.12,
        river_width=0.14,
        valley=0.55,
        coast_x=0.25,
        phases=phases(seed),
    )


def terrain_block(loc: Vec3 = (0, 0, 0), size: Vec3 = (6.0, 4.0, 2.2), **kw: Unpack[BlockOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    seed, relief = kw.get("seed", 1), kw.get("relief", 0.22)
    sp = block_spec(size, kw)
    layers = kw.get("layers") or DEFAULT_LAYERS
    bg = block_grid(sp, size[2], kw.get("res", 120))
    z0, z1 = bg.zbot - 0.3, bg.ztop + relief + 0.1
    lay = [(layers[0][0] + (z1 - bg.ztop), layers[0][1]), *layers[1:]]
    wt = kw.get("water_table")
    st = Strata(z0, z1, lay, kw.get("undulation", 0.1), seed, 0.0, wt)
    top_m = surface_mat("grass", kw.get("surface", "#7aa352"), "#b3ad6c", seed)
    fault = kw.get("fault")
    if fault:
        fault_halves(pt, BlockCtx(bg, top_m, st, kw.get("gap", 0.018)), fault)
    else:
        add(
            pt,
            bm_obj("terrain", build_block(bg), [top_m, strata_mat("strata", st)], smooth=True, sharp_deg=50, flat=(1,)),
        )
    if sp.river:
        block_river(pt, bg)
    block_anchors(pt, bg, layers, wt)
    objs, anchors = done(pt)
    anchors.terrain = Terrain(xf=pt.xf, inv=pt.xf.inverted(), spec=sp, base_z=bg.ztop, sea_z=0.0, clamp_sea=False)
    return objs, anchors
