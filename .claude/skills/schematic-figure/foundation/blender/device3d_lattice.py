# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_lattice.py
import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
import numpy as np
from device3d_graph import NEIGHBOUR, cut_2d, pairs, prune_dangling
from device3d_mat import material, shade
from device3d_mesh import Buf, MeshOpts, add_cyl, add_sphere, buf_add, buf_obj, cyl_tpl, sphere_tpl, with_prefix
from device3d_types import Anchors, Faces, PtLike, Tpl, Vec2, Vec3

S3 = math.sqrt(3)
GRID_TOL = 1e-6
TWO_D: dict[str, tuple[list[Vec2], list[Vec2]]] = {
    "square": ([(1, 0), (0, 1)], [(0, 0)]),
    "hex": ([(1, 0), (0.5, S3 / 2)], [(0, 0)]),
    "honeycomb": ([(S3, 0), (S3 / 2, 1.5)], [(0, 0), (S3 / 2, 0.5)]),
    "kagome": ([(2, 0), (1, S3)], [(0, 0), (1, 0), (0.5, S3 / 2)]),
}
FCC_BASIS: list[tuple[Vec3, int]] = [((0, 0, 0), 0), ((0.5, 0.5, 0), 0), ((0.5, 0, 0.5), 0), ((0, 0.5, 0.5), 0)]
CELLS: dict[str, tuple[float, list[tuple[Vec3, int]]]] = {
    "sc": (1.0, [((0, 0, 0), 0)]),
    "bcc": (2 / S3, [((0, 0, 0), 0), ((0.5, 0.5, 0.5), 1)]),
    "fcc": (math.sqrt(2), FCC_BASIS),
    "rocksalt": (2.0, [*FCC_BASIS, ((0.5, 0, 0), 1), ((0, 0.5, 0), 1), ((0, 0, 0.5), 1), ((0.5, 0.5, 0.5), 1)]),
    "diamond": (
        4 / S3,
        [
            *FCC_BASIS,
            ((0.25, 0.25, 0.25), 1),
            ((0.75, 0.75, 0.25), 1),
            ((0.75, 0.25, 0.75), 1),
            ((0.25, 0.75, 0.75), 1),
        ],
    ),
}
OCT_VERTS: list[Vec3] = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
OCT_FACES: Faces = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
PEROVSKITE_RADII = (0.55, 1.25, 0.62)
PEROVSKITE_SPECIES_O = 2
DIM_2 = 2
DIM_3 = 3


class LatticeOpts(TypedDict, total=False):
    n: int
    a: float
    loc: Vec3
    colors: Sequence[str]
    style: str
    atom_radius: float | None
    bond_radius: float | None
    bond_color: str | None
    shape: str
    size: Vec2 | None
    twist: float | None
    interlayer: float | None
    colors2: Sequence[str] | None
    polyhedra: bool | None
    polyhedra_color: str
    bond_rule: Sequence[tuple[int, int]] | None
    bonds: bool | None
    prefix: str
    seed: int


type Sheet = tuple[np.ndarray, np.ndarray, Sequence[str]]


@dataclass(frozen=True)
class Cfg:
    kind: str
    a: float
    style: str
    atom_r: float
    bond_r: float
    bond_color: str | None
    polyhedra: bool
    poly_color: str
    bonds: bool
    rule: Sequence[tuple[int, int]] | None
    dim: int
    off: np.ndarray
    sph: Tpl
    cyl: Tpl


def grounded(pts: list[np.ndarray] | list[Vec3]) -> np.ndarray:
    arr = np.array(pts)
    arr -= arr.mean(0)
    arr[:, 2] -= arr[:, 2].min()
    return arr


def points_2d(kind: str, a: float, size: Vec2) -> tuple[np.ndarray, np.ndarray]:
    vecs, basis = TWO_D[kind]
    v1, v2 = np.array(vecs[0]) * a, np.array(vecs[1]) * a
    reach = int(max(size) / (a * 0.7)) + 4
    pts: list[Vec3] = []
    species: list[int] = []
    for i in range(-reach, reach + 1):
        for j in range(-reach, reach + 1):
            for k, b in enumerate(basis):
                p = i * v1 + j * v2 + np.array(b) * a
                pts.append((float(p[0]), float(p[1]), 0.0))
                species.append(k)
    return np.array(pts), np.array(species)


def perovskite_sites(a: float, nn: tuple[int, int, int]) -> tuple[list[Vec3], list[int]]:
    cell = 2 * a
    pts: list[Vec3] = []
    species: list[int] = []
    seen: set[tuple[int, ...]] = set()
    for i in range(nn[0]):
        for j in range(nn[1]):
            for k in range(nn[2]):
                pts.append((i * cell, j * cell, k * cell))
                species.append(0)
                for ax in range(3):
                    for sg in (-0.5, 0.5):
                        q = [float(i), float(j), float(k)]
                        q[ax] += sg
                        site = tuple(round(v * 2) for v in q)
                        if site not in seen:
                            seen.add(site)
                            pts.append((q[0] * cell, q[1] * cell, q[2] * cell))
                            species.append(2)
                if i < nn[0] - 1 and j < nn[1] - 1 and k < nn[2] - 1:
                    pts.append(((i + 0.5) * cell, (j + 0.5) * cell, (k + 0.5) * cell))
                    species.append(1)
    return pts, species


def points_cells(kind: str, a: float, nn: tuple[int, int, int]) -> tuple[np.ndarray, np.ndarray]:
    c, basis = CELLS[kind]
    cell = c * a
    pts: list[np.ndarray] = []
    species: list[int] = []
    for i in range(-1, nn[0] + 1):
        for j in range(-1, nn[1] + 1):
            for k in range(-1, nn[2] + 1):
                for b, sp in basis:
                    p = (np.array((i, j, k)) + np.array(b)) * cell
                    if all(-GRID_TOL <= float(p[q]) <= nn[q] * cell + GRID_TOL for q in range(3)):
                        pts.append(p)
                        species.append(sp)
    return grounded(pts), np.array(species)


def lattice_points(kind: str, a: float, n: int, size: Vec2) -> tuple[np.ndarray, np.ndarray, int]:
    if kind in TWO_D:
        pts, species = points_2d(kind, a, size)
        return pts, species, 2
    nn = (n, n, n)
    if kind == "perovskite":
        sites, species_list = perovskite_sites(a, nn)
        return grounded(sites), np.array(species_list), 3
    pts, species = points_cells(kind, a, nn)
    return pts, species, 3


def rule_allows(rule: Sequence[tuple[int, int]] | None, si: int, sj: int) -> bool:
    if not rule:
        return True
    return (si, sj) in rule or (sj, si) in rule


def make_cfg(kind: str, dim: int, opts: LatticeOpts) -> Cfg:
    a = opts.get("a", 0.3)
    style = opts.get("style", "ball")
    bond_radius = opts.get("bond_radius")
    atom_radius = opts.get("atom_radius")
    polyhedra = opts.get("polyhedra")
    bonds = opts.get("bonds")
    if polyhedra is None:
        polyhedra = kind == "perovskite"
    if bonds is None:
        bonds = not polyhedra
    atom_r = (
        atom_radius if atom_radius is not None else 0.28 * a if style == "ball" else (bond_radius or 0.07 * a) * 1.0
    )
    bond_r = bond_radius if bond_radius is not None else (0.08 * a if style == "ball" else 0.07 * a)
    rule = opts.get("bond_rule")
    if rule is None and kind == "perovskite":
        rule = [(0, PEROVSKITE_SPECIES_O)]
    ball = style == "ball"
    return Cfg(
        kind,
        a,
        style,
        atom_r,
        bond_r,
        opts.get("bond_color"),
        polyhedra,
        opts.get("polyhedra_color", "#7fa6cf"),
        bonds,
        rule,
        dim,
        np.asarray(opts.get("loc", (0, 0, 0)), float),
        sphere_tpl(20 if ball else 10, 12 if ball else 6),
        cyl_tpl(14 if ball else 8, caps=False),
    )


def make_sheets(cfg: Cfg, pts: np.ndarray, species: np.ndarray, opts: LatticeOpts) -> list[Sheet]:
    colors = opts.get("colors", ("#3a3f47", "#8a93a0", "#c9483c"))
    sheets: list[Sheet] = [(pts, species, colors)]
    twist = opts.get("twist")
    if twist is not None and cfg.dim == DIM_2:
        th = math.radians(twist)
        rz = np.array([[math.cos(th), -math.sin(th), 0], [math.sin(th), math.cos(th), 0], [0, 0, 1]])
        second = pts @ rz.T
        interlayer = opts.get("interlayer")
        second[:, 2] += interlayer if interlayer is not None else 2.35 * cfg.a
        sheets.append((second, species, opts.get("colors2") or [shade(c, 0.35) for c in colors]))
    return sheets


def sheet_radii(cfg: Cfg, species: np.ndarray) -> list[float]:
    if cfg.style != "ball":
        return [cfg.atom_r] * len(species)
    return [cfg.atom_r * (1.0 if cfg.kind != "perovskite" else PEROVSKITE_RADII[int(s)]) for s in species]


def sphere_bufs(cfg: Cfg, pts: np.ndarray, species: np.ndarray, cols: Sequence[str]) -> dict[str, Buf]:
    bufs: dict[str, Buf] = {}
    for p, s, r in zip(pts, species, sheet_radii(cfg, species), strict=True):
        if cfg.polyhedra and cfg.kind == "perovskite" and int(s) == 0:
            continue
        add_sphere(bufs.setdefault(cols[int(s) % len(cols)], Buf()), p, r, cfg.sph)
    return bufs


def bond_bufs(cfg: Cfg, pts: np.ndarray, species: np.ndarray, cols: Sequence[str]) -> dict[str, Buf]:
    bufs: dict[str, Buf] = {}
    for i, j in pairs(pts, cfg.a * NEIGHBOUR) if cfg.bonds else []:
        if not rule_allows(cfg.rule, int(species[i]), int(species[j])):
            continue
        if cfg.bond_color:
            add_cyl(bufs.setdefault(cfg.bond_color, Buf()), pts[i], pts[j], cfg.bond_r, tpl=cfg.cyl)
        else:
            mid = (pts[i] + pts[j]) / 2
            add_cyl(bufs.setdefault(cols[int(species[i]) % len(cols)], Buf()), pts[i], mid, cfg.bond_r, tpl=cfg.cyl)
            add_cyl(bufs.setdefault(cols[int(species[j]) % len(cols)], Buf()), mid, pts[j], cfg.bond_r, tpl=cfg.cyl)
    return bufs


def octahedra(cfg: Cfg, pts: np.ndarray, species: np.ndarray) -> bpy.types.Object | None:
    buf = Buf()
    for b in pts[species == 0]:
        buf_add(buf, [b + np.array(v) * cfg.a * 0.98 for v in OCT_VERTS], OCT_FACES)
    mat = material("ceramic", cfg.poly_color, alpha=0.82, rough=0.35)
    return buf_obj(buf, "octahedra", mat, MeshOpts(smooth=False))


def sheet_anchors(cfg: Cfg, si: int, pts: np.ndarray, species: np.ndarray, rad: list[float]) -> dict[str, PtLike]:
    c0 = pts.mean(0)
    out: dict[str, PtLike] = {f"layer{si + 1}" if si else "center": c0}
    for sp in (0, 1):
        idx = np.where(species == sp)[0]
        if len(idx) and si == 0:
            if cfg.dim == DIM_2:
                k = int(idx[int(np.argmin(np.linalg.norm(pts[idx] - c0, axis=1)))])
            else:
                k = int(idx[int(np.argmax(pts[idx, 2] * 10 - pts[idx, 1] + pts[idx, 0]))])
            out[f"atom{sp}"] = pts[k] + np.array([0.0, 0.0, rad[k] if cfg.style == "ball" else 0.0])
    return out


def build_sheet(cfg: Cfg, si: int, sheet: Sheet) -> tuple[list[bpy.types.Object | None], dict[str, PtLike]]:
    pts, species, cols = sheet
    pts = pts + cfg.off
    bufs = sphere_bufs(cfg, pts, species, cols)
    bonds = bond_bufs(cfg, pts, species, cols)
    kind_m = "graphene" if cfg.style == "stick" else "ceramic"
    objs: list[bpy.types.Object | None] = [
        buf_obj(b, "lattice", material(kind_m, c)) for c, b in [*bufs.items(), *bonds.items()]
    ]
    if cfg.polyhedra and cfg.kind == "perovskite":
        objs.append(octahedra(cfg, pts, species))
    return objs, sheet_anchors(cfg, si, pts, species, sheet_radii(cfg, species))


def lattice(kind: str = "honeycomb", **opts: Unpack[LatticeOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    n = opts.get("n", 6)
    a = opts.get("a", 0.3)
    pts, species, dim = lattice_points(kind, a, n, opts.get("size") or (2 * n * a, 2 * n * a))
    if dim == DIM_2:
        pts, species = cut_2d(pts, species, n, a, (opts.get("size"), opts.get("shape", "disk")))
        pts, species = prune_dangling(pts, species, kind, a)
    cfg = make_cfg(kind, dim, opts)
    if dim == DIM_3:
        pts = pts.copy()
        pts[:, 2] += cfg.atom_r * (1.25 if kind == "perovskite" and cfg.style == "ball" else 1.0)
    sheets = make_sheets(cfg, pts, species, opts)
    objs: list[bpy.types.Object | None] = []
    anchors: dict[str, PtLike] = {}
    for si, sheet in enumerate(sheets):
        made, found = build_sheet(cfg, si, sheet)
        objs += made
        anchors.update(found)
    all_pts = np.concatenate([s[0] for s in sheets]) + cfg.off
    anchors["top"] = (float(cfg.off[0]), float(cfg.off[1]), float(all_pts[:, 2].max()) + cfg.atom_r)
    anchors["edge"] = all_pts[int(np.argmax(all_pts[:, 0] - 0.3 * all_pts[:, 1]))]
    return [o for o in objs if o is not None], with_prefix(opts.get("prefix", ""), anchors)
