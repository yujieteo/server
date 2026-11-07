# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_tissue.py
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
import numpy as np
from bio3d_cut import halfspace
from bio3d_geo import box, cat, mix
from bio3d_mat import bio_mat
from bio3d_obj import Group, add_obj, anchor, boolean, cutter, done, group_new, smooth_mods
from bio3d_types import NO_ROT, ORIGIN, Built, MeshOpts, Rng, Vec3
from bio3d_voronoi import Plane, VCell, VSpec, add_cells, nuclei_for, voronoi_build

JITTER_XY = 0.28
JITTER_Z = 0.22
ROW_SHEAR = 0.87
GAP_REF = 0.4
APEX_TAG = 2
CUT_FACE_TAG = 1
SPAN_X = 1.4
SPAN_Z = 1.2


@dataclass(frozen=True)
class Layer:
    thickness: float
    size: float
    color: str
    rows: int


EPITHELIUM = [
    Layer(thickness=0.55, size=0.30, color="#b8577a", rows=1),
    Layer(thickness=0.55, size=0.36, color="#d9829a", rows=2),
    Layer(thickness=0.22, size=0.55, color="#eaa9a6", rows=1),
]


class TissueKw(TypedDict, total=False):
    size: Vec3
    loc: Vec3
    rot: Vec3
    cell_size: float
    seed: int
    color: str
    nucleus: str
    var: float
    layers: Sequence[Layer] | None
    cut_faces: Sequence[str]
    dome: float
    gap: float
    basement: str | None
    basement_h: float
    bevel: float


@dataclass(frozen=True)
class TissueSpec:
    size: Vec3 = (4.0, 2.4, 1.0)
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    cell_size: float = 0.4
    seed: int = 0
    color: str = "#e2929c"
    nucleus: str = "#4f3a8a"
    var: float = 0.08
    layers: Sequence[Layer] | None = None
    cut_faces: Sequence[str] = ("front", "right")
    dome: float = 0.12
    gap: float = 0.012
    basement: str | None = "#d8c49a"
    basement_h: float = 0.06
    bevel: float = 0.2


@dataclass(frozen=True)
class LayerPlan:
    planes: list[Plane]
    size: float
    row_h: float


def side_planes(w: float, d: float) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    return {
        "front": (np.array([0, -d / 2, 0.0]), np.array([0, -1.0, 0])),
        "back": (np.array([0, d / 2, 0.0]), np.array([0, 1.0, 0])),
        "left": (np.array([-w / 2, 0, 0.0]), np.array([-1.0, 0, 0])),
        "right": (np.array([w / 2, 0, 0.0]), np.array([1.0, 0, 0])),
    }


def layer_seeds(layer: Layer, wd: tuple[float, float], z0: float, rng: Rng) -> list[Vec3]:
    w, d = wd
    rows = layer.rows or 1
    nx, ny = max(1, round(w / layer.size)), max(1, round(d / (layer.size * ROW_SHEAR)))
    seeds: list[Vec3] = []
    for k in range(rows):
        for j in range(ny):
            for i in range(nx):
                x = -w / 2 + (i + 0.5 + 0.5 * (j % 2) + rng.uniform(-JITTER_XY, JITTER_XY)) * w / nx
                y = -d / 2 + (j + 0.5 + rng.uniform(-JITTER_XY, JITTER_XY)) * d / ny
                z = z0 + (k + 0.5 + (rng.uniform(-JITTER_Z, JITTER_Z) if rows > 1 else 0.0)) * layer.thickness / rows
                if x > w / 2:
                    x -= w
                seeds.append((x, y, z))
    return seeds


def layer_plan(layer: Layer, z0: float, remaining: int, spec: TissueSpec) -> LayerPlan:
    w, d, _ = spec.size
    planes = [
        Plane(np.array([0, 0, z0]), np.array([0, 0, -1.0]), 0),
        Plane(np.array([0, 0, z0 + layer.thickness]), np.array([0, 0, 1.0]), APEX_TAG if remaining == 0 else 0),
    ]
    for nm, (co, n) in side_planes(w, d).items():
        planes.append(Plane(co, n, CUT_FACE_TAG if nm in spec.cut_faces else 0))
    return LayerPlan(planes, layer.size, layer.thickness / (layer.rows or 1))


def layer_cells(plan: LayerPlan, seeds: Sequence[Vec3], spec: TissueSpec, remaining: int, rng: Rng) -> list[VCell]:
    reach = (SPAN_X * plan.size, SPAN_X * plan.size, SPAN_Z * max(plan.row_h, 0.5 * plan.size))
    domes = {APEX_TAG: spec.dome * plan.size} if remaining == 0 else {}
    vspec = VSpec(reach, spec.gap * plan.size / GAP_REF, domes)
    return voronoi_build(seeds, [plan.planes] * len(seeds), vspec, rng)


def tissue_cells(layers: Sequence[Layer], spec: TissueSpec, rng: Rng) -> tuple[list[VCell], float]:
    w, d, _ = spec.size
    z0 = spec.basement_h
    seeds: list[list[Vec3]] = []
    plans: list[LayerPlan] = []
    for li, layer in enumerate(layers):
        seeds.append(layer_seeds(layer, (w, d), z0, rng))
        plans.append(layer_plan(layer, z0, len(layers) - 1 - li, spec))
        z0 += layer.thickness
    cells: list[VCell] = []
    for li, plan in enumerate(plans):
        cs = layer_cells(plan, seeds[li], spec, len(layers) - 1 - li, rng)
        for c in cs:
            c.layer = li
        cells += cs
    return cells, z0


def layer_mats(layers: Sequence[Layer], spec: TissueSpec) -> list[bpy.types.Material]:
    mats: list[bpy.types.Material] = []
    for layer in layers:
        cs = layer.size
        mats += [
            bio_mat(layer.color, "cell", var=spec.var, mottle=0.05, tex=2.5 / cs),
            bio_mat(mix(layer.color, "#ffffff", 0.18), "section", var=spec.var, tex=3.0 / cs),
        ]
    return mats


def add_nuclei(g: Group, cells: Sequence[VCell], spec: TissueSpec, rng: Rng) -> list[np.ndarray]:
    parts, cen = nuclei_for(cells, rng)
    if not parts:
        return cen
    verts, faces = cat(parts)
    nuc = add_obj(g, "nuclei", (verts, faces), [bio_mat(spec.nucleus, "nucleus")])
    sides = side_planes(spec.size[0], spec.size[1])
    for nm in spec.cut_faces:
        co, n = sides[nm]
        sec = bio_mat(spec.nucleus, "section", mottle=0.3, tex=40.0)
        boolean(nuc, cutter(g, halfspace(co, n, 0.004), sec))
    return cen


def tissue_anchors(
    g: Group, layers: Sequence[Layer], spec: TissueSpec, top_nuc: tuple[float, list[np.ndarray]]
) -> None:
    w, d, _ = spec.size
    htot, cen = top_nuc
    ylo, xhi, bh = -d / 2, w / 2, spec.basement_h
    anchor(g, "top", (0.1 * w, 0.15 * d, htot + spec.dome * spec.cell_size * 0.8))
    anchor(g, "apical", (-0.25 * w, 0.2 * d, htot + spec.dome * spec.cell_size * 0.8))
    anchor(g, "front_face", (0, ylo, htot * 0.5))
    anchor(g, "right_face", (xhi, 0, htot * 0.5))
    anchor(g, "corner", (xhi, ylo, htot))
    anchor(g, "basement", (0, ylo, bh * 0.5))
    zz = bh
    for li, layer in enumerate(layers):
        anchor(g, f"layer{li}", (-0.2 * w, ylo, zz + layer.thickness / 2))
        zz += layer.thickness
    front = [c for c in cen if abs(c[1] - ylo) < 0.3 * spec.cell_size]
    best: np.ndarray | None = None
    for c in front:
        if best is None or abs(c[0]) + abs(c[2] - htot / 2) < abs(best[0]) + abs(best[2] - htot / 2):
            best = c
    if best is not None:
        anchor(g, "nucleus", best)


def tissue_slab(**kw: Unpack[TissueKw]) -> Built:
    spec = TissueSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("tissue", spec.loc, spec.rot)
    w, d, h = spec.size
    layers = spec.layers or [Layer(h, spec.cell_size, spec.color, max(1, round(h / spec.cell_size)))]
    cells, htot = tissue_cells(layers, spec, rng)
    o = add_cells(g, cells, layer_mats(layers, spec), rng)
    smooth_mods(o, bevel=spec.bevel * min(layer.size for layer in layers), levels=2)
    cen = add_nuclei(g, cells, spec, rng)
    if spec.basement:
        bmesh_box = box((-w / 2, -d / 2, 0.0), (w / 2, d / 2, spec.basement_h * 0.92))
        _ = add_obj(g, "basement", bmesh_box, [bio_mat(spec.basement, "matte", rough=0.6)], MeshOpts(smooth=False))
    tissue_anchors(g, layers, spec, (htot, cen))
    return done(g)
