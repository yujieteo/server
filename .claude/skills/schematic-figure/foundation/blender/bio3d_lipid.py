# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_lipid.py
import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack

import numpy as np
from bio3d_geo import blob_mesh, capsule, cat, fix, ico, inst, rot_to, shift, tube
from bio3d_mat import bio_mat
from bio3d_obj import Group, add_obj, anchor, done, group_new, organic
from bio3d_types import NO_ROT, ORIGIN, TWIST_MAX, Built, Mesh, MeshPart, Rng, Vec3

type Pair = tuple[float, float]

DEFAULT_COLOR = "#3a7fc0"
DEFAULT_SIZE = 0.35
ROW_SPACING = 0.866


@dataclass(frozen=True)
class ProteinSpec:
    kind: str
    pos: Pair
    color: str = DEFAULT_COLOR
    size: float = DEFAULT_SIZE


class MembraneKw(TypedDict, total=False):
    size: Pair
    loc: Vec3
    rot: Vec3
    spacing: float
    thickness: float
    seed: int
    head: str
    tail: str
    proteins: Sequence[ProteinSpec] | str | None
    wave: float


@dataclass(frozen=True)
class MembraneSpec:
    size: Pair = (5.0, 3.2)
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    spacing: float = 0.17
    thickness: float = 0.62
    seed: int = 0
    head: str = "#e0773a"
    tail: str = "#f1dfb4"
    proteins: Sequence[ProteinSpec] | str | None = "default"
    wave: float = 0.0


def lipid_tpl(rh: float, lt: float, sides: int = 7, pts: int = 7) -> tuple[Mesh, Mesh]:
    vh, fh = ico(2)
    tails: list[MeshPart] = []
    for sgn, kink in ((-1, 0.0), (1, 1.0)):
        z = np.linspace(-0.55 * rh, -(0.55 * rh + lt), pts)
        x = sgn * 0.42 * rh + 0.12 * rh * np.sin(np.linspace(0, 2.5, pts)) * sgn
        if kink:
            x = x + np.where(z < -(0.55 * rh + 0.45 * lt), 0.35 * rh * (-(z + 0.55 * rh + 0.45 * lt) / lt), 0)
        tails.append(tube(np.stack([x, np.zeros(pts), z], -1), 0.26 * rh, sides=sides))
    vt, ft = cat(tails)
    return (vh * rh, fh), (vt, fix(vt, ft))


def tm_helices(kind: str, t: float, w: float, rng: Rng) -> list[MeshPart]:
    nh = 6 if kind == "channel" else 7
    ring = 0.62 * w if kind == "channel" else 0.55 * w
    parts: list[MeshPart] = []
    for k in range(nh):
        a = 2 * math.pi * k / nh + rng.uniform(-0.1, 0.1)
        if kind == "channel" or k:
            p = np.array([ring * math.cos(a), ring * math.sin(a), rng.uniform(-0.05, 0.05) * t])
        else:
            p = np.zeros(3)
        tilt = np.array([-math.sin(a), math.cos(a), 0]) * 0.22 + np.array([0, 0, 1.0])
        vc, fc = capsule(t * 1.05, 0.22 * w, 16, 10)
        parts.append(inst(vc, fc, [rot_to(tilt, a)], [p]))
    return parts


def tm_protein(kind: str, t: float, w: float, rng: Rng) -> list[MeshPart]:
    if kind not in ("channel", "receptor"):
        return [blob_mesh(rng, n=12, r=0.42 * w, elong=(1, 1, 1.9))]
    parts = tm_helices(kind, t, w, rng)
    if kind == "channel":
        ring = 0.62 * w
        for zs in (1, -1):
            for k in range(6):
                a = 2 * math.pi * (k + 0.5) / 6
                vb, fb = ico(2)
                offs = [ring * 1.05 * math.cos(a), ring * 1.05 * math.sin(a), zs * (t * 0.62 + 0.1 * w)]
                parts.append((shift(vb * 0.2 * w, *offs), fb))
        return parts
    vb, fb = blob_mesh(rng, n=9, r=0.42 * w)
    parts.append((shift(vb, 0, 0, t * 0.55 + 0.85 * w), fb))
    vb, fb = blob_mesh(rng, n=5, r=0.3 * w)
    parts.append((shift(vb, 0.1 * w, 0, -t * 0.55 - 0.45 * w), fb))
    return parts


def wave_z(wave: float, w: float, x: float) -> float:
    return wave * math.sin(2 * math.pi * x / (0.8 * w))


def wave_slope(wave: float, w: float, x: float) -> float:
    return wave * 2 * math.pi / (0.8 * w) * math.cos(2 * math.pi * x / (0.8 * w))


def default_proteins(w: float, d: float) -> list[ProteinSpec]:
    return [
        ProteinSpec("channel", (-0.28 * w, 0.05 * d), "#3a7fc0", 0.34),
        ProteinSpec("receptor", (0.22 * w, -0.05 * d), "#7b5aa6", 0.36),
        ProteinSpec("blob", (-0.02 * w, 0.28 * d), "#2f9e7e", 0.34),
    ]


def patch_lipids(
    spec: MembraneSpec, proteins: Sequence[ProteinSpec], rng: Rng
) -> tuple[list[np.ndarray], list[np.ndarray]]:
    w, d = spec.size
    sp, t = spec.spacing, spec.thickness
    rh = 0.5 * sp
    mats: list[np.ndarray] = []
    trans: list[np.ndarray] = []
    for leaf in (1, -1):
        for j in range(int(d / (sp * ROW_SPACING))):
            for i in range(int(w / sp)):
                x = -w / 2 + (i + 0.5 + 0.5 * (j % 2)) * sp + rng.gauss(0, 0.08 * sp)
                y = -d / 2 + (j + 0.5) * sp * ROW_SPACING + rng.gauss(0, 0.08 * sp)
                if abs(x) > w / 2 - 0.3 * sp:
                    continue
                if any(math.hypot(x - q.pos[0], y - q.pos[1]) < q.size * 1.05 for q in proteins):
                    continue
                nrm = np.array([-wave_slope(spec.wave, w, x), 0, 1.0])
                nrm /= np.linalg.norm(nrm)
                dirv = leaf * nrm + np.array([rng.gauss(0, 0.07), rng.gauss(0, 0.07), 0])
                mats.append(rot_to(dirv, rng.uniform(0, TWIST_MAX)) * rng.uniform(0.95, 1.05))
                trans.append(np.array([x, y, wave_z(spec.wave, w, x)]) + leaf * nrm * (t / 2 - rh))
    return mats, trans


def patch_proteins(g: Group, spec: MembraneSpec, proteins: Sequence[ProteinSpec]) -> None:
    t = spec.thickness
    for k, p in enumerate(proteins):
        x, y = p.pos
        w = p.size
        vp, fp = cat(tm_protein(p.kind, t, w, Rng(spec.seed * 31 + k)))
        zf = wave_z(spec.wave, spec.size[0], x)
        vp = shift(vp, x, y, zf)
        organic(add_obj(g, f"protein{k}", (vp, fp), [bio_mat(p.color, "protein")]), 0.06 * w, 0.7, 8)
        top = {"channel": t * 0.62 + 0.3 * w, "receptor": t * 0.55 + 1.3 * w, "blob": 0.9 * w * 1.9}[p.kind]
        anchor(g, f"protein{k}", (x, y, zf + top))


def membrane_patch(**kw: Unpack[MembraneKw]) -> Built:
    spec = MembraneSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("membrane", spec.loc, spec.rot)
    w, d = spec.size
    t = spec.thickness
    rh = 0.5 * spec.spacing
    proteins = default_proteins(w, d) if spec.proteins == "default" else spec.proteins
    plist = [] if proteins is None or isinstance(proteins, str) else list(proteins)
    (vh, fh), (vt, ft) = lipid_tpl(rh, t / 2 - 1.15 * rh)
    mh, th = patch_lipids(spec, plist, rng)
    _ = add_obj(g, "heads", inst(vh, fh, mh, th), [bio_mat(spec.head, "lipid_head")])
    _ = add_obj(g, "tails", inst(vt, ft, mh, th), [bio_mat(spec.tail, "lipid_tail")])
    patch_proteins(g, spec, plist)
    anchor(g, "head_top", (-0.42 * w, -d / 2, t / 2))
    anchor(g, "head_bottom", (-0.42 * w, -d / 2, -t / 2))
    anchor(g, "tails", (-0.42 * w, -d / 2, 0))
    anchor(g, "extracellular", (0, 0.3 * d, t / 2 + 0.8))
    anchor(g, "cytosol", (0, -0.3 * d, -t / 2 - 0.6))
    anchor(g, "corner", (w / 2, -d / 2, t / 2))
    return done(g)
