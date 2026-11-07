# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_land.py
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import Built, HeightSpec, Part, Terrain, Vec3, add, anchor, done, mesh_obj, new_part, shade
from apparatus3d_height import axis_samples, height_at, perimeter, phases, river_at, river_strip, water_level
from apparatus3d_materials import water
from apparatus3d_nodes import ncoord, new_graph, nmap, nparams, nput, nramp, nxyz
from apparatus3d_strata import Layers, Strata, hypso_mat, strata_mat

LAND_LAYERS: Layers = [(0.1, "#c9a979"), (0.12, "#a77b55"), (0.14, "#d8c79e"), (0.5, "#8f7d6a")]
Palette = list[tuple[float, str]]


class LandOpts(TypedDict, total=False):
    seed: int
    relief: float
    scale: float
    res: int
    river: bool
    coast: bool
    sea: str
    sea_clarity: float
    palette: Palette
    skirt: float
    layers: Layers
    snow: bool
    rot: float


@dataclass(frozen=True)
class LandMesh:
    xs: list[float]
    ys: list[float]
    heights: list[list[float]]
    verts: list[Vec3]
    faces: list[tuple[int, ...]]
    base_n: int
    per: list[tuple[int, int]]
    zmin: float


def land_spec(size: tuple[float, float], kw: LandOpts) -> HeightSpec:
    seed = kw.get("seed", 3)
    relief = kw.get("relief", 0.9)
    return HeightSpec(
        seed=seed,
        sx=size[0],
        sy=size[1],
        relief=relief,
        scale=kw.get("scale", 0.3),
        river=kw.get("river", False),
        coast=kw.get("coast", True),
        river_depth=0.15 * relief,
        river_width=0.1,
        valley=0.5,
        coast_x=0.25,
        phases=phases(seed),
    )


def land_mesh(sp: HeightSpec, res: int, skirt: float) -> LandMesh:
    nx, ny = res, max(8, int(res * sp.sy / sp.sx))
    xs, ys = axis_samples(sp.sx, nx), axis_samples(sp.sy, ny)
    z = [[height_at(sp, x, y) for y in ys] for x in xs]
    zmin = min(min(r) for r in z) - skirt
    verts: list[Vec3] = []
    idx: dict[tuple[int, int], int] = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            idx[i, j] = len(verts)
            verts.append((xs[i], ys[j], z[i][j]))
    faces: list[tuple[int, ...]] = [
        (idx[i, j], idx[i + 1, j], idx[i + 1, j + 1], idx[i, j + 1]) for i in range(nx) for j in range(ny)
    ]
    per = perimeter(nx, ny)
    base_n = len(verts)
    bidx: dict[tuple[int, int], int] = {}
    for k in per:
        bidx[k] = len(verts)
        verts.append((xs[k[0]], ys[k[1]], zmin))
    faces.extend((idx[a], bidx[a], bidx[b], idx[b]) for a, b in zip(per, per[1:] + per[:1], strict=True))
    faces.append(tuple(bidx[k] for k in reversed(per)))
    return LandMesh(xs, ys, z, verts, faces, base_n, per, zmin)


def hypso_palette(z0: float, zt: float, zb: float, kw: LandOpts) -> Palette:
    d = max(zt - z0, 1e-3)
    base = [
        (min(zb, z0 - 0.05), "#2d6a9e"),
        (z0 - 0.02, "#79b7cf"),
        (z0, "#e3d3a4"),
        (z0 + 0.03 * d, "#9cc06a"),
        (z0 + 0.3 * d, "#6d9a4c"),
        (z0 + 0.62 * d, "#9c9a62"),
        (z0 + 0.85 * d, "#9a8f80"),
        (z0 + d + 1e-3, "#a9a39b"),
    ]
    return kw.get("palette") or base + ([(z0 + d + 2e-3, "#f7f8fa")] if kw.get("snow", False) else [])


def add_land(pt: Part, lm: LandMesh, sp: HeightSpec, kw: LandOpts) -> None:
    zt, zb = max(max(r) for r in lm.heights), min(min(r) for r in lm.heights)
    coast = kw.get("coast", True)
    z0 = 0.0 if coast else (water_level(sp) if sp.river else zb)
    seed = kw.get("seed", 3)
    top_m = hypso_mat(seed, sp.relief, hypso_palette(z0, zt, zb, kw))
    lay = kw.get("layers") or LAND_LAYERS
    lay = [(lay[0][0] + zt + 0.05, lay[0][1]), *lay[1:]]
    st = Strata(lm.zmin - 0.05, zt + 0.05, lay, 0.03, seed, 0.0, None, "#6a4a32", 0.05, "#7fa656")
    nx, ny = len(lm.xs) - 1, len(lm.ys) - 1
    mi = [0] * (nx * ny) + [1] * (len(lm.per) + 1)
    o = mesh_obj(
        "land",
        lm.verts,
        lm.faces,
        [top_m, strata_mat("strata", st)],
        smooth=True,
        sharp_deg=60,
        mat_index=mi,
        flat=(1,),
    )
    me = o.data
    if isinstance(me, bpy.types.Mesh):
        at = me.attributes.new("hsurf", "FLOAT", "POINT")
        vals = [v[2] for v in lm.verts[: lm.base_n]] + [lm.heights[k[0]][k[1]] for k in lm.per]
        at.data.foreach_set("value", vals)
    add(pt, o)


def add_sea(pt: Part, lm: LandMesh, sp: HeightSpec, kw: LandOpts) -> None:
    sx, sy = sp.sx, sp.sy
    sea = kw.get("sea", "#3f8fc4")
    wm = water(sea, kw.get("sea_clarity", 0.45))
    e = 0.004
    zlo = lm.zmin + 0.01
    v: list[Vec3] = [(-sx / 2 + e, -sy / 2 + e, zlo), (sx / 2 - e, -sy / 2 + e, zlo)]
    v += [(sx / 2 - e, sy / 2 - e, zlo), (-sx / 2 + e, sy / 2 - e, zlo)]
    v += [(x, y, 0.0) for x, y, _ in v]
    side = new_graph("sea_cut")
    nparams(side, Roughness=0.3, Coat_Weight=0.4)
    sp2 = nxyz(side, ncoord(side))
    ramp = nramp(side, nmap(side, sp2[2], (zlo, 0.0)), [(0, shade(sea, 0.45)), (1, shade(sea, 0.95))])
    nput(side, side.bsdf.inputs["Base Color"], ramp)
    faces = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    add(pt, mesh_obj("sea", v, faces, [wm, side.m], smooth=False, mat_index=[0, 1, 1, 1, 1]))


def land_anchors(pt: Part, lm: LandMesh, sp: HeightSpec, kw: LandOpts) -> None:
    sx, sy = sp.sx, sp.sy
    nx, ny = len(lm.xs) - 1, len(lm.ys) - 1
    best = (0, 0)
    for i in range(nx + 1):
        for j in range(ny + 1):
            if lm.heights[i][j] > lm.heights[best[0]][best[1]]:
                best = (i, j)
    anchor(pt, "peak", (lm.xs[best[0]], lm.ys[best[1]], lm.heights[best[0]][best[1]]))
    if kw.get("coast", True):
        for i in range(nx):
            if lm.heights[i][ny // 2] > 0 >= lm.heights[i + 1][ny // 2]:
                anchor(pt, "coast", (lm.xs[i], 0, 0))
                break
        anchor(pt, "sea", (0.4 * sx, -0.2 * sy, 0))
    anchor(pt, "lowland", (-0.3 * sx, -0.3 * sy, height_at(sp, -0.3 * sx, -0.3 * sy)))


def terrain_surface(loc: Vec3 = (0, 0, 0), size: tuple[float, float] = (8.0, 6.0), **kw: Unpack[LandOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    sp = land_spec(size, kw)
    lm = land_mesh(sp, kw.get("res", 180), kw.get("skirt", 0.5))
    add_land(pt, lm, sp, kw)
    anchor(pt, "skirt", (-0.3 * size[0], -size[1] / 2, (lm.zmin + 0.0) / 2))
    if kw.get("coast", True):
        add_sea(pt, lm, sp, kw)
    if sp.river:
        zw = water_level(sp)
        add(pt, river_strip(sp, zw, 0.45, water(kw.get("sea", "#3f8fc4"), 0.3)))
        anchor(pt, "river", (-0.2 * size[0], river_at(sp, -0.2 * size[0]), zw))
    land_anchors(pt, lm, sp, kw)
    objs, anchors = done(pt)
    sea_z = 0.0 if sp.coast else -9.0
    anchors.terrain = Terrain(xf=pt.xf, inv=pt.xf.inverted(), spec=sp, base_z=0.0, sea_z=sea_z, clamp_sea=True)
    return objs, anchors
