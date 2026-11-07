# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_vesicle.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import numpy as np
from bio3d_cut import Cut, cut_depth, cut_inside, cut_new, cut_world
from bio3d_geo import az_dir, blob_mesh, cat, fib, inst, rot_to
from bio3d_lipid import lipid_tpl, tm_protein
from bio3d_mat import bio_mat
from bio3d_obj import Group, add_obj, anchor, done, group_new, organic
from bio3d_types import NO_ROT, ORIGIN, TWIST_MAX, Built, MeshPart, Rng, Vec3

PROTEIN_KINDS = ("receptor", "channel", "blob")


class VesicleKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    thickness: float
    spacing: float
    seed: int
    head: str
    tail: str
    cutaway: str | None
    cut_azimuth: float
    cargo: int
    cargo_color: str
    proteins: int
    protein_color: str


@dataclass(frozen=True)
class VesicleSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 1.2
    thickness: float = 0.3
    spacing: float = 0.085
    seed: int = 0
    head: str = "#e0773a"
    tail: str = "#f1dfb4"
    cutaway: str | None = "octant"
    cut_azimuth: float = -45.0
    cargo: int = 40
    cargo_color: str = "#d1495b"
    proteins: int = 8
    protein_color: str = "#3a7fc0"


def leaflet_poses(
    spec: VesicleSpec,
    cut: Cut | None,
    keep_p: list[np.ndarray],
    rng: Rng,
) -> tuple[list[np.ndarray], list[np.ndarray]]:
    big, t, sp = spec.radius, spec.thickness, spec.spacing
    rh, pw = 0.5 * sp, 0.13 * big
    mats: list[np.ndarray] = []
    trans: list[np.ndarray] = []
    for leaf, rr in ((1, big - rh), (-1, big - t + rh)):
        n = int(4 * math.pi * rr * rr / (0.866 * sp * sp) * 0.92)
        pts = fib(n, rng, 0.25 * sp / rr)
        for i in range(len(pts)):
            u = pts[i, :]
            p = u * rr
            if cut is not None and cut_inside(cut, p, -0.0):
                continue
            if any(np.dot(u, q) > math.cos(pw * 1.1 / big) for q in keep_p):
                continue
            d = leaf * u + np.array([rng.gauss(0, 0.06) for _ in range(3)])
            mats.append(rot_to(d, rng.uniform(0, TWIST_MAX)))
            trans.append(p)
    return mats, trans


def vesicle_proteins(g: Group, spec: VesicleSpec, keep_p: list[np.ndarray], rng: Rng) -> np.ndarray | None:
    big, t, pw = spec.radius, spec.thickness, 0.13 * spec.radius
    view = az_dir(spec.cut_azimuth - 40, 35)
    parts: list[MeshPart] = []
    found: np.ndarray | None = None
    for k, u in enumerate(keep_p):
        vp, fp = cat(tm_protein(PROTEIN_KINDS[k % 3], t, pw, Rng(spec.seed * 7 + k)))
        parts.append(inst(vp, fp, [rot_to(u, rng.uniform(0, TWIST_MAX))], [u * (big - t / 2)]))
        if found is None or np.dot(u, view) > np.dot(found / big, view):
            found = u * (big + 0.2 * big)
    organic(add_obj(g, "proteins", cat(parts), [bio_mat(spec.protein_color, "protein")]), 0.06 * pw, 0.7, 8)
    return found


def cargo_point(spec: VesicleSpec, cut: Cut | None, rng: Rng) -> np.ndarray:
    big, t = spec.radius, spec.thickness
    p = np.zeros(3)
    for _ in range(50):
        p = np.array([rng.uniform(-1, 1) for _ in range(3)]) * (big - t - 0.1 * big)
        if np.linalg.norm(p) < big - t - 0.1 * big and (cut is None or not cut_inside(cut, p, 0.04 * big)):
            break
    return p


def vesicle_cargo(g: Group, spec: VesicleSpec, cut: Cut | None, rng: Rng) -> np.ndarray | None:
    parts: list[MeshPart] = []
    found: np.ndarray | None = None
    for _ in range(spec.cargo):
        p = cargo_point(spec, cut, rng)
        vb, fb = blob_mesh(rng, n=rng.randint(2, 4), r=0.05 * spec.radius, sub=2)
        parts.append((vb + p, fb))
        if found is None or (cut is not None and cut_depth(cut, p) > cut_depth(cut, found)):
            found = p
    _ = add_obj(g, "cargo", cat(parts), [bio_mat(spec.cargo_color, "protein")])
    return found


def vesicle_anchors(g: Group, spec: VesicleSpec, cut: Cut | None) -> None:
    big, t = spec.radius, spec.thickness
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", (0, 0, big))
    anchor(g, "outer_leaflet", az_dir(spec.cut_azimuth - 75, 30) * big)
    if cut is None:
        return
    if cut.mode != "half":
        anchor(g, "bilayer_cut", cut_world(cut, [big - t / 2, -0.0, 0.45 * big]))
    else:
        anchor(g, "bilayer_cut", cut_world(cut, [0.7 * big, 0, 0.3 * big]))
    anchor(g, "inner_leaflet", cut_world(cut, [(big - t) * 0.62, 0.0, (big - t) * 0.62]))
    anchor(g, "lumen", cut_world(cut, [0.35 * big, -0.35 * big, 0.0]))


def vesicle(**kw: Unpack[VesicleKw]) -> Built:
    spec = VesicleSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("vesicle", spec.loc, spec.rot)
    big, t = spec.radius, spec.thickness
    rh = 0.5 * spec.spacing
    cut = cut_new(spec.cutaway, spec.cut_azimuth, 0.0) if spec.cutaway else None
    (vh, fh), (vt, ft) = lipid_tpl(rh, t / 2 - 1.15 * rh, sides=6, pts=6)
    pu = fib(spec.proteins, rng, 0.2) if spec.proteins else np.zeros((0, 3))
    keep_p = [pu[i, :] for i in range(len(pu)) if cut is None or not cut_inside(cut, pu[i, :] * big, 0.13 * big)]
    mh, th = leaflet_poses(spec, cut, keep_p, rng)
    _ = add_obj(g, "heads", inst(vh, fh, mh, th), [bio_mat(spec.head, "lipid_head")])
    _ = add_obj(g, "tails", inst(vt, ft, mh, th), [bio_mat(spec.tail, "lipid_tail")])
    a_prot = vesicle_proteins(g, spec, keep_p, rng) if keep_p else None
    a_cargo = vesicle_cargo(g, spec, cut, rng) if spec.cargo else None
    vesicle_anchors(g, spec, cut)
    if a_cargo is not None:
        anchor(g, "cargo", a_cargo)
    if a_prot is not None:
        anchor(g, "protein", a_prot)
    return done(g)


liposome = vesicle
