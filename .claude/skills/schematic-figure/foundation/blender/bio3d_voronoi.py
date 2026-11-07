# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_voronoi.py
import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import NamedTuple

import bmesh
import bpy
import numpy as np
from bio3d_geo import inst
from bio3d_obj import Group, add_poly, make_radial, vec, wobbly
from bio3d_types import Mesh, MeshOpts, Point, Rng
from mathutils import Vector
from mathutils.kdtree import KDTree

EPS_PLANE = 1e-7
CUT_TAG = 1
ELONG = 1.7
TINY_VEC = 1e-3
MIN_VERTS = 4
DOME_SLIVER = 2.5
NEIGHBOUR_REACH = 1.6
SLIVER_KEEP = 0.55


class Plane(NamedTuple):
    co: np.ndarray
    normal: np.ndarray
    tag: int


class FaceInfo(NamedTuple):
    center: np.ndarray
    normal: np.ndarray
    tag: int
    area: float


@dataclass(frozen=True)
class VSpec:
    reach: tuple[float, float, float]
    gap: float
    domes: dict[int, float]
    min_in: float = 0.0


@dataclass
class VCell:
    verts: np.ndarray
    faces: list[list[int]]
    tags: list[int]
    info: list[FaceInfo]
    cen: np.ndarray
    pts: np.ndarray
    layer: int = 0


class CellMesh(NamedTuple):
    verts: np.ndarray
    faces: list[list[int]]
    face_mat: list[int]
    rand: list[float]
    rand2: list[float]


def coords(bm: bmesh.types.BMesh) -> np.ndarray:
    return np.array([v.co[:] for v in bm.verts])


def apply_plane(bm: bmesh.types.BMesh, tl: bmesh.types.BMLayerItem, plane: Plane) -> bool:
    s = (coords(bm) - plane.co) @ plane.normal
    if s.max() <= EPS_PLANE:
        return True
    if s.min() >= -EPS_PLANE:
        bm.free()
        return False
    geom = [*bm.verts, *bm.edges, *bm.faces]
    _ = bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        dist=EPS_PLANE,
        plane_co=tuple(plane.co),
        plane_no=tuple(plane.normal),
        clear_outer=True,
    )
    be = [e for e in bm.edges if e.is_boundary]
    if be:
        r = bmesh.ops.holes_fill(bm, edges=be, sides=0)
        for f in r["faces"]:
            f[tl] = plane.tag
    if len(bm.verts) < MIN_VERTS:
        bm.free()
        return False
    return True


def vcell(p: Point, half: Point, planes: Sequence[Plane]) -> bmesh.types.BMesh | None:
    bm = bmesh.new()
    tl = bm.faces.layers.int.new("tag")
    _ = bmesh.ops.create_cube(bm, size=1.0)
    pa, ha = np.asarray(p, float), np.asarray(half, float)
    for v in bm.verts:
        v.co = Vector(tuple(pa.item(k) + 2 * ha.item(k) * v.co[k] for k in range(3)))
    for f in bm.faces:
        f[tl] = 0
    for plane in planes:
        if not apply_plane(bm, tl, plane):
            return None
    _ = bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def neighbour_planes(kd: KDTree, pts: np.ndarray, i: int, spec: VSpec) -> list[Plane]:
    p = pts[i, :]
    found = sorted([(d, j) for (_, j, d) in kd.find_range(vec(p), NEIGHBOUR_REACH * max(spec.reach)) if j != i])
    planes: list[Plane] = []
    for d, j in found:
        pj = pts[j, :]
        planes.append(Plane(0.5 * (pj + p) - (pj - p) / d * spec.gap / 2, (pj - p) / d, 0))
    return planes


def face_infos(bm: bmesh.types.BMesh, tl: bmesh.types.BMLayerItem) -> list[FaceInfo]:
    return [
        FaceInfo(np.array(f.calc_center_median()[:]), np.array(f.normal[:]), f[tl], f.calc_area()) for f in bm.faces
    ]


def is_sliver(info: Sequence[FaceInfo], cen: np.ndarray, min_in: float) -> bool:
    if min_in <= 0 or any(fi.tag == CUT_TAG for fi in info):
        return False
    return min(np.dot(fi.center - cen, fi.normal) for fi in info) < min_in


def add_domes(bm: bmesh.types.BMesh, tl: bmesh.types.BMLayerItem, spec: VSpec, rng: Rng) -> None:
    for tag, h in spec.domes.items():
        for f in [f for f in bm.faces if f[tl] == tag]:
            a = f.calc_area()
            if math.sqrt(a) < DOME_SLIVER * h:
                continue
            _ = bmesh.ops.inset_individual(
                bm,
                faces=[f],
                thickness=0.2 * math.sqrt(a),
                depth=h * rng.uniform(0.75, 1.25),
                use_even_offset=True,
            )


def one_cell(
    kd: KDTree,
    pts: np.ndarray,
    i: int,
    extra: Sequence[Plane],
    spec_rng: tuple[VSpec, Rng],
) -> VCell | None:
    spec, rng = spec_rng
    planes = neighbour_planes(kd, pts, i, spec) + list(extra)
    bm = vcell(pts[i, :], np.asarray(spec.reach) * 1.0, planes)
    if bm is None:
        return None
    tl = bm.faces.layers.int["tag"]
    info = face_infos(bm, tl)
    cov = coords(bm)
    cen = np.mean(cov, axis=0)
    if is_sliver(info, cen, spec.min_in):
        bm.free()
        return None
    add_domes(bm, tl, spec, rng)
    out = VCell(coords(bm), [[v.index for v in f.verts] for f in bm.faces], [f[tl] for f in bm.faces], info, cen, cov)
    bm.free()
    return out


def voronoi_build(
    seeds: Sequence[Point] | np.ndarray, planes: Sequence[Sequence[Plane]], spec: VSpec, rng: Rng
) -> list[VCell]:
    pts = np.asarray(seeds, float)
    kd = KDTree(len(pts))
    for i in range(len(pts)):
        kd.insert(vec(pts[i, :]), i)
    kd.balance()
    cells: list[VCell] = []
    for i in range(len(pts)):
        c = one_cell(kd, pts, i, planes[i], (spec, rng))
        if c is not None:
            cells.append(c)
    return cells


def cells_mesh(cells: Sequence[VCell], rng: Rng) -> CellMesh:
    verts: list[np.ndarray] = []
    faces: list[list[int]] = []
    fm: list[int] = []
    r1: list[float] = []
    r2: list[float] = []
    off = 0
    for c in cells:
        si, ci = 2 * c.layer, 2 * c.layer + 1
        a, b = rng.random(), rng.random()
        verts.append(c.verts)
        faces += [[k + off for k in f] for f in c.faces]
        fm += [ci if t == CUT_TAG else si for t in c.tags]
        r1 += [a] * len(c.faces)
        r2 += [b] * len(c.faces)
        off += len(c.verts)
    if not verts:
        msg = "no cells survived: check size, cell_size and the cut plane"
        raise ValueError(msg)
    return CellMesh(np.vstack(verts), faces, fm, r1, r2)


def add_cells(
    g: Group,
    cells: Sequence[VCell],
    mats: Sequence[bpy.types.Material],
    rng: Rng,
) -> bpy.types.Object:
    cm = cells_mesh(cells, rng)
    opts = MeshOpts(face_mat=cm.face_mat, rand=cm.rand, rand2=cm.rand2, smooth=True)
    return add_poly(g, "cells", (cm.verts, cm.faces), mats, opts)


def inner_distance(point: np.ndarray, others: Sequence[tuple[np.ndarray, np.ndarray]]) -> float:
    return min(np.dot(fc - point, fn) for fc, fn in others)


def largest_cut(info: Sequence[FaceInfo]) -> FaceInfo | None:
    best: FaceInfo | None = None
    for fi in info:
        if fi.tag == CUT_TAG and (best is None or fi.area > best.area):
            best = fi
    return best


def nucleus_for_cell(
    c: VCell,
    rng: Rng,
    tpls: Sequence[Mesh],
    frac_lift: tuple[float, float],
) -> tuple[float, Mesh, np.ndarray] | None:
    best = largest_cut(c.info)
    if best is None:
        return None
    fc, fn = best.center, best.normal
    others = [(fi.center, fi.normal) for fi in c.info if fi.tag != CUT_TAG]
    x = c.pts - c.cen
    w, u = np.linalg.eigh(x.T @ x)
    e1 = u[:, -1]
    k = min(max(math.sqrt(max(w.item(-1), 1e-12) / max(w.item(-2), 1e-12)), 1.0), ELONG)
    c0 = c.cen - fn * np.dot(c.cen - fc, fn)
    rin = inner_distance(c.cen, others) if others else 0.2
    r = frac_lift[0] * rin
    cc = c0 - fn * 0.3 * r
    if frac_lift[1]:
        cc = cc + frac_lift[1] * c.cen / np.linalg.norm(c.cen)
    dmin = inner_distance(cc, others) if others else r
    r = max(0.25 * rin, min(r, 0.85 * dmin / (1 + 0.5 * (k - 1))))
    e1p = e1 - fn * np.dot(e1, fn)
    e1p = e1p / (np.linalg.norm(e1p) + 1e-9) if np.linalg.norm(e1p) > TINY_VEC else e1
    e2 = np.cross(fn, e1p)
    e2 /= np.linalg.norm(e2) + 1e-12
    col1 = e1p * r * k * rng.uniform(0.9, 1.1)
    col2 = e2 * r * rng.uniform(0.9, 1.1)
    vt, ft = tpls[rng.randrange(4)]
    return r, inst(vt, ft, [np.column_stack([col1, col2, fn * r])], [cc]), cc


def nuclei_for(
    cells: Sequence[VCell],
    rng: Rng,
    frac: float = 0.55,
    lift: float = 0.0,
) -> tuple[list[Mesh], list[np.ndarray]]:
    tpls = [wobbly(3, 1.0, (1, 1, 1), make_radial(rng.randint(0, 10**6), 0.07))[:2] for _ in range(4)]
    parts: list[tuple[float, Mesh]] = []
    cen: list[np.ndarray] = []
    for c in cells:
        res = nucleus_for_cell(c, rng, tpls, (frac, lift))
        if res is not None:
            parts.append((res[0], res[1]))
            cen.append(res[2])
    if not parts:
        return [], []
    med = float(np.median([r for r, _ in parts]))
    keep = [(pp, cc) for (r, pp), cc in zip(parts, cen, strict=True) if r > SLIVER_KEEP * med]
    return [pp for pp, _ in keep], [cc for _, cc in keep]
