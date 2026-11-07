# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_lab.py
import math
from dataclasses import dataclass
from typing import NamedTuple, TypedDict, Unpack

import numpy as np
from bio3d_geo import box, cat, fix, ico, inst, lathe, rot_y, rot_z, shift, tri, tube
from bio3d_mat import bio_mat
from bio3d_obj import add_obj, anchor, done, group_new
from bio3d_types import NO_ROT, ORIGIN, TWIST_MAX, Built, Mesh, MeshOpts, Rng, Vec3

RECALC = MeshOpts(recalc=True)
TUBE_OUT = [
    (0, 0),
    (0.7, 0.08),
    (1.3, 0.5),
    (1.75, 1.4),
    (5.0, 17.8),
    (5.35, 19.2),
    (5.4, 37.2),
    (6.1, 37.4),
    (6.15, 39.8),
    (6.0, 40.0),
]
TUBE_IN = [(4.62, 40.0), (4.62, 19.4), (4.3, 18.3), (1.1, 2.3), (0.6, 1.25), (0, 0.9)]
RIN_Z = [0.9, 1.25, 2.3, 18.3, 19.4, 40.0]
RIN_R = [0, 0.6, 1.1, 4.3, 4.62, 4.62]
LIQUID_Z = (1.3, 2.3, 6, 10, 14, 18.3, 19.4, 25, 30, 35)
LID_PROFILE = [
    (0, 41.2),
    (6.3, 41.2),
    (6.4, 40.0),
    (6.3, 39.9),
    (4.55, 39.9),
    (4.5, 37.6),
    (4.1, 37.5),
    (4.1, 39.6),
    (0, 39.6),
]
HINGE = np.array([6.9, 0, 40.2])


class TubeKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    height: float
    liquid: str
    fill: float
    lid: str
    lid_angle: float
    plastic: str
    seed: int


@dataclass(frozen=True)
class TubeSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    height: float = 3.0
    liquid: str = "#e0607e"
    fill: float = 0.45
    lid: str = "open"
    lid_angle: float = 115.0
    plastic: str = "#f3f1ea"
    seed: int = 0


def tube_inner(z: float) -> float:
    return float(np.interp(z, RIN_Z, RIN_R))


def lid_mesh(spec: TubeSpec) -> tuple[Mesh, np.ndarray]:
    vb, fb = box((-9.2, -1.8, 40.2), (-6.0, 1.8, 41.0))
    vl, fl = cat([lathe(LID_PROFILE), (vb, tri(fb))])
    edge = np.array([6.35, 0, 40.6])
    if spec.lid == "open":
        ry = rot_y(math.radians(spec.lid_angle))
        vl = (vl - HINGE) @ ry.T + HINGE
        edge = (edge - HINGE) @ ry.T + HINGE
    return (vl, fl), edge


def hinge_path(edge: np.ndarray) -> np.ndarray:
    ts = np.linspace(0, 1, 12)
    start, ctrl = np.array([6.1, 0, 39.0]), shift(HINGE, 0.9, 0, 0.2)
    return np.array([(1 - ts[i]) ** 2 * start + 2 * ts[i] * (1 - ts[i]) * ctrl + ts[i] ** 2 * edge for i in range(12)])


def microtube(**kw: Unpack[TubeKw]) -> Built:
    spec = TubeSpec(**kw)
    g = group_new("microtube", spec.loc, spec.rot, spec.height / 40.0)
    pm = bio_mat(spec.plastic, "plastic_frosted")
    _ = add_obj(g, "tube", lathe(TUBE_OUT + TUBE_IN), [pm], RECALC)
    zf = 1.0 + spec.fill * 38.0
    zs = [z for z in LIQUID_Z if z < zf - 0.2]
    prof = [(0, 1.0)] + [(max(0.0, tube_inner(z) - 0.06), z) for z in zs]
    prof += [(tube_inner(zf) - 0.06, zf), (tube_inner(zf) * 0.7, zf - 0.25), (0, zf - 0.35)]
    _ = add_obj(g, "liquid", lathe(prof), [bio_mat(spec.liquid, "liquid")], RECALC)
    lid, edge = lid_mesh(spec)
    _ = add_obj(g, "lid", lid, [pm], RECALC)
    _ = add_obj(g, "hinge", tube(hinge_path(edge), 0.5, sides=10, flat=0.45, n0=[0, 1, 0]), [pm], RECALC)
    anchor(g, "liquid", (0, -tube_inner(zf * 0.6), zf * 0.6))
    anchor(g, "tip", (0, 0, 0))
    anchor(g, "rim", (-6.1, 0, 40))
    anchor(g, "body", (0, -5.4, 28))
    anchor(g, "lid", lid[0].mean(0))
    return done(g)


class Colony(NamedTuple):
    x: float
    y: float
    r: float


class PetriKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    agar: str
    colonies: tuple[str, ...]
    n_colonies: int
    seed: int
    lid: str | None
    plastic: str


@dataclass(frozen=True)
class PetriSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 2.0
    agar: str = "#e2c27e"
    colonies: tuple[str, ...] = ("#f4ead2",)
    n_colonies: int = 40
    seed: int = 0
    lid: str | None = None
    plastic: str = "#eef3f6"


def scatter_colonies(spec: PetriSpec, rng: Rng) -> tuple[list[Colony], dict[str, tuple[list[np.ndarray], list[Vec3]]]]:
    per: dict[str, tuple[list[np.ndarray], list[Vec3]]] = {c: ([], []) for c in spec.colonies}
    placed: list[Colony] = []
    for _ in range(spec.n_colonies * 30):
        if len(placed) >= spec.n_colonies:
            break
        rc = min(4.0, 0.9 + rng.lognormvariate(0, 0.5) * 1.2)
        rr = 38.0 * math.sqrt(rng.random())
        a = rng.uniform(0, 2 * math.pi)
        x, y = rr * math.cos(a), rr * math.sin(a)
        if any(math.hypot(x - c.x, y - c.y) < rc + c.r + 0.4 for c in placed):
            continue
        placed.append(Colony(x, y, rc))
        cl = spec.colonies[rng.randrange(len(spec.colonies))]
        sx, sy = rc * rng.uniform(0.93, 1.07), rc * rng.uniform(0.28, 0.42)
        per[cl][0].append(np.diag([rc, sx, sy]) @ rot_z(rng.uniform(0, TWIST_MAX)))
        per[cl][1].append((x, y, 6.0))
    return placed, per


def petri_dish(**kw: Unpack[PetriKw]) -> Built:
    spec = PetriSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("petri", spec.loc, spec.rot, spec.radius / 45.0)
    base = [(0, 0), (44.6, 0), (45.0, 0.4), (45.0, 14.0), (44.2, 14.0), (44.2, 1.0), (0, 1.0)]
    pm = bio_mat(spec.plastic, "plastic_clear")
    _ = add_obj(g, "dish", lathe(base, 120), [pm], RECALC)
    agar = lathe([(0, 1.05), (44.1, 1.05), (44.1, 7.4), (43.2, 6.4), (41.0, 6.05), (0, 6.0)], 120)
    _ = add_obj(g, "agar", agar, [bio_mat(spec.agar, "agar")], RECALC)
    vd, fd = lathe([(0, 1.0), (0.45, 0.93), (0.8, 0.7), (0.97, 0.35), (1.03, 0.05), (1.0, -0.2), (0, -0.2)], 28)
    placed, per = scatter_colonies(spec, rng)
    for k, (cl, (ms, ts)) in enumerate(per.items()):
        if ts:
            _ = add_obj(g, f"colonies{k}", inst(vd, fix(vd, fd), ms, ts), [bio_mat(cl, "colony")])
    if spec.lid == "beside":
        vl, fl = lathe([(0, 9.0), (46.4, 9.0), (46.9, 8.6), (46.9, 0.0), (46.1, 0.0), (46.1, 8.0), (0, 8.0)], 120)
        _ = add_obj(g, "lid", (shift(vl, 100.0, 18.0, 0.0), fl), [pm], RECALC)
        anchor(g, "lid", (100.0, 18.0 - 46.9, 5.0))
    anchor(g, "dish", (0, -45.0, 7.0))
    anchor(g, "agar", (-20.0, -30.0, 6.0))
    anchor(g, "rim", (0, 45.0, 14.0))
    if placed:
        best = placed[0]
        for c in placed[1:]:
            if c.y - 0.3 * c.x < best.y - 0.3 * best.x:
                best = c
        anchor(g, "colony", (best.x, best.y, 6.0 + 0.35 * best.r))
    return done(g)


class TipKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    length: float
    color: str
    liquid: str | None
    fill: float
    droplet: bool
    seed: int


@dataclass(frozen=True)
class TipSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    length: float = 3.0
    color: str = "#f1efe6"
    liquid: str | None = None
    fill: float = 0.25
    droplet: bool = False
    seed: int = 0


TIP_OUT = [
    (0.42, 0.0),
    (0.55, 2.0),
    (2.35, 33.5),
    (2.75, 35.5),
    (2.95, 39.5),
    (3.25, 40.2),
    (3.25, 41.0),
    (3.05, 41.4),
    (3.55, 44.5),
    (3.6, 50.6),
    (3.5, 51.0),
]
TIP_IN = [(3.12, 51.0), (3.1, 44.5), (2.6, 40.0), (2.35, 36.0), (1.95, 33.5), (0.25, 1.0), (0.22, 0.0)]


def tip_radius(z: float) -> float:
    return float(np.interp(z, [0, 1.0, 33.5], [0.22, 0.25, 1.95])) - 0.04


def tip_liquid(zf: float) -> Mesh:
    zs = np.linspace(0.05, zf, 8)
    prof = [(0, 0.05)] + [(tip_radius(zs.item(i)), zs.item(i)) for i in range(8)]
    prof += [(tip_radius(zf) * 0.6, zf - 0.12), (0, zf - 0.16)]
    return lathe(prof, 48)


def pipette_tip(**kw: Unpack[TipKw]) -> Built:
    spec = TipSpec(**kw)
    g = group_new("tip", spec.loc, spec.rot, spec.length / 51.0)
    _ = add_obj(g, "tip", lathe(TIP_OUT + TIP_IN, 64), [bio_mat(spec.color, "plastic_frosted", rough=0.22)], RECALC)
    if spec.liquid:
        zf = 0.5 + spec.fill * 33.0
        _ = add_obj(g, "liquid", tip_liquid(zf), [bio_mat(spec.liquid, "liquid")], RECALC)
        anchor(g, "liquid", (0, -tip_radius(zf / 2) - 0.2, zf / 2))
        if spec.droplet:
            vd, fd = ico(4)
            _ = add_obj(g, "droplet", (vd * [1.2, 1.2, 1.35] + [0, 0, -1.2], fd), [bio_mat(spec.liquid, "liquid")])
            anchor(g, "droplet", (0, 0, -2.5))
    anchor(g, "tip", (0, 0, 0))
    anchor(g, "collar", (0, -3.6, 47.0))
    anchor(g, "body", (0, -1.4, 20.0))
    return done(g)
