# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_organ.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
import numpy as np
from bio3d_cut import halfspace
from bio3d_geo import az_dir, cat, fib, ico, mix, shade
from bio3d_mat import bio_mat
from bio3d_obj import Group, add_obj, anchor, boolean, cutter, done, group_new, make_radial, smooth_mods, wobbly
from bio3d_types import NO_ROT, ORIGIN, Built, Mesh, Rng, Vec3
from bio3d_voronoi import Plane, VSpec, add_cells, nuclei_for, voronoi_build

OUTER_TAG = 2
INNER_TAG = 3
CUT_PLANE_TAG = 1
NUCLEUS_FRAC = 0.6


class OrganoidKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    thickness: float
    n_cells: int
    seed: int
    color: str
    nucleus: str
    lumen_color: str | None
    matrix: str | None
    var: float
    cutaway: bool
    cut_azimuth: float
    cut_elevation: float
    cut_offset: float
    gap: float
    bevel: float


@dataclass(frozen=True)
class OrganoidSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 1.5
    thickness: float = 0.45
    n_cells: int = 150
    seed: int = 0
    color: str = "#e7a07a"
    nucleus: str = "#4f3a8a"
    lumen_color: str | None = None
    matrix: str | None = None
    var: float = 0.1
    cutaway: bool = True
    cut_azimuth: float = -50.0
    cut_elevation: float = 10.0
    cut_offset: float = 0.0
    gap: float = 0.012
    bevel: float = 0.035


class SpheroidKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    cell_size: float
    seed: int
    color: str
    nucleus: str
    matrix: str | None
    var: float
    cutaway: bool
    cut_azimuth: float
    cut_elevation: float
    gap: float
    dome: float
    bevel: float


@dataclass(frozen=True)
class SpheroidSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 1.2
    cell_size: float = 0.32
    seed: int = 0
    color: str = "#8fb8de"
    nucleus: str = "#3d3a8c"
    matrix: str | None = None
    var: float = 0.1
    cutaway: bool = False
    cut_azimuth: float = -50.0
    cut_elevation: float = 10.0
    gap: float = 0.012
    dome: float = 0.4
    bevel: float = 0.15


def cell_mats(color: str, var: float) -> list[bpy.types.Material]:
    return [bio_mat(color, "cell", var=var), bio_mat(mix(color, "#ffffff", 0.25), "section", var=var)]


def nuclei_cut(g: Group, nucleus: str, plane: tuple[np.ndarray, np.ndarray], parts: list[Mesh]) -> None:
    verts, faces = cat(parts)
    nuc = add_obj(g, "nuclei", (verts, faces), [bio_mat(nucleus, "nucleus")])
    sec = bio_mat(nucleus, "section", mottle=0.3, tex=40)
    boolean(nuc, cutter(g, halfspace(plane[0], plane[1], 0.004), sec))


def organoid_planes(unit: np.ndarray, spec: OrganoidSpec, ncut: np.ndarray) -> list[list[Plane]]:
    rin, rout = spec.radius - spec.thickness, spec.radius
    out: list[list[Plane]] = []
    for i in range(len(unit)):
        u = unit[i, :]
        pl = [Plane(u * rout, u, OUTER_TAG), Plane(u * rin, -u, INNER_TAG)]
        if spec.cutaway:
            pl.append(Plane(ncut * spec.cut_offset, ncut, CUT_PLANE_TAG))
        out.append(pl)
    return out


def matrix_shell(g: Group, spec: OrganoidSpec, ncut: np.ndarray) -> None:
    rin, rout = spec.radius - spec.thickness, spec.radius
    matrix = spec.matrix or shade(spec.color, 0.86)
    vo, fo = ico(4)
    shell = cat([(vo * (rout - 0.3 * spec.thickness), fo), (vo * (rin + 0.3 * spec.thickness), fo[:, ::-1])])
    ecm = add_obj(g, "matrix", shell, [bio_mat(matrix, "cell", mottle=0.0)])
    if spec.cutaway:
        boolean(ecm, cutter(g, halfspace(ncut * spec.cut_offset, ncut, -0.002), bio_mat(matrix, "section", mottle=0.0)))


def organoid_anchors(g: Group, spec: OrganoidSpec, ncut: np.ndarray, n_cells: int) -> None:
    rin, rout = spec.radius - spec.thickness, spec.radius
    rm = spec.radius - spec.thickness / 2
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", (0, 0, rout))
    anchor(g, "outer", az_dir(spec.cut_azimuth - 80, 30) * rout)
    e = np.cross(ncut, [0, 0, 1.0])
    e /= np.linalg.norm(e)
    anchor(g, "lumen", -0.0 * ncut + 0.25 * rin * np.array([0, 0, 1]) + ncut * spec.cut_offset)
    anchor(g, "cut_face", ncut * spec.cut_offset + (rin + rout) / 2 * e)
    if spec.cutaway and n_cells:
        anchor(g, "nucleus", ncut * spec.cut_offset + rm * np.cross(e, ncut) * -1)


def organoid(**kw: Unpack[OrganoidKw]) -> Built:
    spec = OrganoidSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("organoid", spec.loc, spec.rot)
    rm, rin = spec.radius - spec.thickness / 2, spec.radius - spec.thickness
    unit = fib(spec.n_cells, rng, 0.25 / math.sqrt(spec.n_cells))
    a = math.sqrt(4 * math.pi * rm**2 / spec.n_cells)
    ncut = az_dir(spec.cut_azimuth, spec.cut_elevation)
    rv = max(a, spec.thickness) * 1.3
    reach = (rv, rv, rv)
    domes = {OUTER_TAG: 0.10 * spec.thickness, INNER_TAG: 0.12 * spec.thickness}
    vspec = VSpec(reach, spec.gap, domes, 0.12 * min(a, spec.thickness))
    cells = voronoi_build(unit * rm, organoid_planes(unit, spec, ncut), vspec, rng)
    o = add_cells(g, cells, cell_mats(spec.color, spec.var), rng)
    smooth_mods(o, bevel=spec.bevel * spec.radius, levels=2)
    if spec.cutaway:
        parts, _ = nuclei_for(cells, rng, NUCLEUS_FRAC, 0.12 * spec.thickness)
        if parts:
            nuclei_cut(g, spec.nucleus, (ncut * spec.cut_offset, ncut), parts)
    matrix_shell(g, spec, ncut)
    if spec.lumen_color:
        vl, fl, _ = wobbly(3, rin * 0.6, (1, 1, 1), make_radial(spec.seed + 5, 0.1))
        _ = add_obj(g, "lumen", (vl, fl), [bio_mat(spec.lumen_color, "cell")])
    organoid_anchors(g, spec, ncut, len(cells))
    return done(g)


def grid_seeds(radius: float, c: float, rng: Rng) -> list[np.ndarray]:
    seeds: list[np.ndarray] = []
    n = int(radius / c) + 2
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            for k in range(-n, n + 1):
                p = np.array([i + rng.uniform(-0.3, 0.3), j + rng.uniform(-0.3, 0.3), k + rng.uniform(-0.3, 0.3)]) * c
                if np.linalg.norm(p) < radius - 1.3 * c:
                    seeds.append(p)
    return seeds


def spheroid_planes(unit: np.ndarray, total: int, spec: SpheroidSpec, ncut: np.ndarray) -> list[list[Plane]]:
    out: list[list[Plane]] = []
    for i in range(total):
        pl: list[Plane] = []
        if i < len(unit):
            u = unit[i, :]
            pl.append(Plane(u * spec.radius, u, OUTER_TAG))
        if spec.cutaway:
            pl.append(Plane(np.zeros(3), ncut, CUT_PLANE_TAG))
        out.append(pl)
    return out


def spheroid_anchors(g: Group, spec: SpheroidSpec, ncut: np.ndarray) -> None:
    r = spec.radius
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", (0, 0, r))
    anchor(g, "surface", az_dir(spec.cut_azimuth - 80, 30) * r)
    e = np.cross(ncut, [0, 0, 1.0])
    e /= np.linalg.norm(e)
    anchor(g, "cut_face", 0.5 * r * e)
    anchor(g, "nucleus", 0.3 * r * np.cross(e, ncut))


def spheroid(**kw: Unpack[SpheroidKw]) -> Built:
    spec = SpheroidSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("spheroid", spec.loc, spec.rot)
    r, c = spec.radius, spec.cell_size
    ro = r - 0.5 * c
    unit = fib(int(4 * math.pi * ro * ro / (0.9 * c * c)), rng, 0.2 * c / ro)
    seeds = [unit[i, :] * ro for i in range(len(unit))]
    seeds += grid_seeds(r, c, rng)
    ncut = az_dir(spec.cut_azimuth, spec.cut_elevation)
    vspec = VSpec((1.3 * c, 1.3 * c, 1.3 * c), spec.gap, {OUTER_TAG: spec.dome * c}, 0.14 * c)
    cells = voronoi_build(seeds, spheroid_planes(unit, len(seeds), spec, ncut), vspec, rng)
    if not spec.cutaway:
        cells = [cl for cl in cells if OUTER_TAG in cl.tags]
    o = add_cells(g, cells, cell_mats(spec.color, spec.var), rng)
    smooth_mods(o, bevel=spec.bevel * c, levels=2)
    if spec.cutaway:
        parts, _ = nuclei_for(cells, rng, NUCLEUS_FRAC)
        if parts:
            nuclei_cut(g, spec.nucleus, (np.zeros(3), ncut), parts)
    matrix = spec.matrix or shade(spec.color, 0.86)
    vo, fo = ico(4)
    ecm = add_obj(g, "matrix", (vo * (r - 0.35 * c), fo), [bio_mat(matrix, "cell", mottle=0.0)])
    if spec.cutaway:
        boolean(ecm, cutter(g, halfspace(np.zeros(3), ncut, -0.002), bio_mat(matrix, "section", mottle=0.0)))
    spheroid_anchors(g, spec, ncut)
    return done(g)
