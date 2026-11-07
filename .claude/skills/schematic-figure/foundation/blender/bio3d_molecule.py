# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_molecule.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import numpy as np
from bio3d_geo import blob_mesh, capsule, cat, ico, inst, rot_to, shade, tube
from bio3d_mat import bio_mat
from bio3d_obj import Group, add_obj, anchor, done, group_new, organic
from bio3d_types import NO_ROT, ORIGIN, Built, MeshOpts, MeshPart, Rng, Vec3

BASE_COLORS = {"A": "#d1495b", "T": "#edae49", "G": "#00798c", "C": "#66a182"}
COMPLEMENT = {"A": "T", "T": "A", "G": "C", "C": "G"}
RECALC = MeshOpts(recalc=True)
SAMPLES_PER_BP = 12


class DnaKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    n_bp: int
    radius: float
    rise: float
    bp_per_turn: float
    groove: float
    seed: int
    sequence: str | None
    strand1: str
    strand2: str
    base_colors: dict[str, str] | None
    beads: bool


@dataclass(frozen=True)
class DnaSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    n_bp: int = 24
    radius: float = 1.0
    rise: float = 0.34
    bp_per_turn: float = 10.5
    groove: float = 150.0
    seed: int = 0
    sequence: str | None = None
    strand1: str = "#30638e"
    strand2: str = "#8e5aa8"
    base_colors: dict[str, str] | None = None
    beads: bool = True


class BlobKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    size: float
    n: int
    seed: int
    color: str
    elong: Vec3
    smooth: float
    voxel: float


@dataclass(frozen=True)
class BlobSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    size: float = 1.0
    n: int = 14
    seed: int = 0
    color: str = "#3a7fc0"
    elong: Vec3 = (1, 1, 1)
    smooth: float = 0.5
    voxel: float = 0.025


def helix_pt(th: float, x: float, rr: float) -> np.ndarray:
    return np.array([x, rr * math.cos(th), rr * math.sin(th)])


def base_pairs(g: Group, spec: DnaSpec, seq: str) -> tuple[list[np.ndarray], list[np.ndarray]]:
    rb, dth, gr = spec.radius, 2 * math.pi / spec.bp_per_turn, math.radians(spec.groove)
    bc = dict(BASE_COLORS, **(spec.base_colors or {}))
    rods: dict[str, list[MeshPart]] = {k: [] for k in "ATGC"}
    bead1: list[np.ndarray] = []
    bead2: list[np.ndarray] = []
    for i, b in enumerate(seq):
        x = i * spec.rise
        a1, a2 = helix_pt(i * dth, x, rb * 0.95), helix_pt(i * dth + gr, x, rb * 0.95)
        mid = 0.5 * (a1 + a2)
        for p, q, base in ((a1, mid, b), (mid, a2, COMPLEMENT[b])):
            d = q - p
            vc, fc = capsule(np.linalg.norm(d) - 0.05 * rb, 0.075 * rb, 12, 8)
            rods[base].append(inst(vc, fc, [rot_to(d)], [(p + q) / 2]))
        if spec.beads:
            bead1.append(helix_pt(i * dth, x, rb))
            bead2.append(helix_pt(i * dth + gr, x, rb))
    for base, parts in rods.items():
        if parts:
            _ = add_obj(g, "base_" + base, cat(parts), [bio_mat(bc[base], "protein")])
    return bead1, bead2


def dna_anchors(g: Group, spec: DnaSpec, n: int) -> None:
    rb, dth, gr = spec.radius, 2 * math.pi / spec.bp_per_turn, math.radians(spec.groove)
    i = n // 2
    x = i * spec.rise
    anchor(g, "start", (0, 0, 0))
    anchor(g, "end", ((n - 1) * spec.rise, 0, 0))
    anchor(g, "axis_mid", (x, 0, 0))
    anchor(g, "backbone1", helix_pt(i * dth, x, rb) * [1, 1.15, 1.15])
    anchor(g, "backbone2", helix_pt(i * dth + gr, x, rb) * [1, 1.15, 1.15])
    anchor(g, "base_pair", 0.5 * (helix_pt(i * dth, x, rb) + helix_pt(i * dth + gr, x, rb)))
    anchor(g, "minor_groove", helix_pt(i * dth + gr / 2, x, rb * 1.1))
    anchor(g, "major_groove", helix_pt(i * dth + gr / 2 + math.pi, x, rb * 1.1))


def dna_helix(**kw: Unpack[DnaKw]) -> Built:
    spec = DnaSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("dna", spec.loc, spec.rot)
    seq = spec.sequence or "".join(rng.choice("ATGC") for _ in range(spec.n_bp))
    n = len(seq)
    rb, dth, gr = spec.radius, 2 * math.pi / spec.bp_per_turn, math.radians(spec.groove)
    ts = np.linspace(-0.5, n - 0.5, n * SAMPLES_PER_BP)
    p1 = np.array([helix_pt(ts.item(i) * dth, ts.item(i) * spec.rise, rb) for i in range(len(ts))])
    p2 = np.array([helix_pt(ts.item(i) * dth + gr, ts.item(i) * spec.rise, rb) for i in range(len(ts))])
    _ = add_obj(g, "backbone1", tube(p1, 0.14 * rb, sides=14), [bio_mat(spec.strand1, "protein")], RECALC)
    _ = add_obj(g, "backbone2", tube(p2, 0.14 * rb, sides=14), [bio_mat(spec.strand2, "protein")], RECALC)
    bead1, bead2 = base_pairs(g, spec, seq)
    if spec.beads:
        vb, fb = ico(2)
        for k, (pts, cl) in enumerate(zip((bead1, bead2), (spec.strand1, spec.strand2), strict=True)):
            mesh = inst(vb, fb, [np.eye(3) * 0.2 * rb] * len(pts), pts)
            _ = add_obj(g, f"phosphate{k + 1}", mesh, [bio_mat(shade(cl, 1.15), "protein")])
    dna_anchors(g, spec, n)
    return done(g)


def protein_blob(**kw: Unpack[BlobKw]) -> Built:
    spec = BlobSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("protein", spec.loc, spec.rot)
    size = spec.size
    v, f = blob_mesh(rng, n=spec.n, r=0.3 * size, elong=spec.elong, sub=3)
    fine: list[MeshPart] = []
    vi, fi = ico(2)
    for _ in range(int(spec.n * 9)):
        c = v[rng.randrange(len(v)), :]
        fine.append((vi * 0.09 * size * rng.uniform(0.7, 1.2) + c * 0.98, fi))
    v, f = cat([(v, f), *fine])
    o = add_obj(g, "protein", (v, f), [bio_mat(spec.color, "protein", tex=10.0 / size)])
    organic(o, spec.voxel * size, spec.smooth, 6)
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", (0, 0, v[:, 2].max()))
    return done(g)
