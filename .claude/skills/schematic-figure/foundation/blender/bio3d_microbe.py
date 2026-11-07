# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_microbe.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import numpy as np
from bio3d_geo import az_dir, blob_mesh, capsule, cat, fib, ico, inst, rot_to, shade, shift, tube
from bio3d_mat import bio_mat
from bio3d_obj import Group, Radial, add_obj, anchor, done, group_new, make_radial, radial_at, wobbly
from bio3d_types import NO_ROT, ORIGIN, TWIST_MAX, Built, MeshOpts, MeshPart, Rng, Vec3
from mathutils import Quaternion

RECALC = MeshOpts(recalc=True)


class VirusKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    spikes: int
    spike_len: float
    seed: int
    envelope: str
    spike: str
    mprotein: str
    n_mprot: int


@dataclass(frozen=True)
class VirusSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 1.0
    spikes: int = 48
    spike_len: float = 0.32
    seed: int = 0
    envelope: str = "#c6ccd6"
    spike: str = "#d1495b"
    mprotein: str = "#e8a33d"
    n_mprot: int = 120


class NanoKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    core: str
    core_preset: str
    seed: int
    corona: tuple[str, ...]
    n_proteins: int
    protein_size: float
    peg: int
    peg_color: str


@dataclass(frozen=True)
class NanoSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 0.6
    core: str = "#e0b24a"
    core_preset: str = "gold"
    seed: int = 0
    corona: tuple[str, ...] = ("#3a7fc0", "#d1495b", "#2f9e7e", "#e8a33d")
    n_proteins: int = 36
    protein_size: float = 0.16
    peg: int = 0
    peg_color: str = "#9aa7b4"


def spike_template(spec: VirusSpec) -> tuple[np.ndarray, np.ndarray]:
    big, sl = spec.radius, spec.spike_len
    vs, fs = capsule(0.5 * sl * big, 0.035 * big, 12, 8)
    parts: list[MeshPart] = [(shift(vs, 0, 0, 0.45 * sl * big), fs)]
    for k in range(3):
        a = 2 * math.pi * k / 3
        p = np.array([0.045 * big * math.cos(a), 0.045 * big * math.sin(a), 0.93 * sl * big])
        vc, fc = capsule(0.12 * sl * big, 0.058 * big, 14, 10)
        tl = np.array([0.35 * math.cos(a), 0.35 * math.sin(a), 1.0])
        parts.append(inst(vc, fc, [rot_to(tl)], [p]))
    return cat(parts)


def spike_poses(spec: VirusSpec, rad: Radial, rng: Rng) -> tuple[list[np.ndarray], list[np.ndarray]]:
    ms: list[np.ndarray] = []
    ts: list[np.ndarray] = []
    pts = fib(spec.spikes, rng, 0.1)
    for i in range(len(pts)):
        u = pts[i, :]
        jit = u + np.array([rng.gauss(0, 0.12) for _ in range(3)])
        twist = rng.uniform(0, TWIST_MAX)
        ms.append(rot_to(jit, twist) * rng.uniform(0.9, 1.1))
        ts.append(u * radial_at(rad, u) * spec.radius * 0.98)
    return ms, ts


def virus(**kw: Unpack[VirusKw]) -> Built:
    spec = VirusSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("virus", spec.loc, spec.rot)
    big = spec.radius
    rad = make_radial(spec.seed, 0.025, 3.0)
    v, f, _ = wobbly(5, big, (1, 1, 1), rad)
    _ = add_obj(g, "envelope", (v, f), [bio_mat(spec.envelope, "membrane", tex=14.0, bump=0.25, mottle=0.12)])
    vt, ft = spike_template(spec)
    ms, ts = spike_poses(spec, rad, rng)
    _ = add_obj(g, "spikes", inst(vt, ft, ms, ts), [bio_mat(spec.spike, "protein")])
    vb, fb = ico(2)
    ms2: list[np.ndarray] = []
    ts2: list[np.ndarray] = []
    pm = fib(spec.n_mprot, rng, 0.2)
    for i in range(len(pm)):
        u = pm[i, :]
        ms2.append(np.eye(3) * 0.045 * big * rng.uniform(0.8, 1.2))
        ts2.append(u * radial_at(rad, u) * big * 1.0)
    _ = add_obj(g, "mproteins", inst(vb, fb, ms2, ts2), [bio_mat(spec.mprotein, "protein")])
    view = az_dir(-120, 35)
    best = ts[0]
    for tp in ts[1:]:
        if np.dot(tp / big, view) > np.dot(best / big, view):
            best = tp
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", (0, 0, big * (1 + spec.spike_len)))
    anchor(g, "spike", best / np.linalg.norm(best) * big * (1 + spec.spike_len))
    anchor(g, "envelope", az_dir(-10, 20) * big)
    return done(g)


def corona_proteins(g: Group, spec: NanoSpec, rng: Rng) -> np.ndarray | None:
    ps = spec.protein_size
    tpls = [blob_mesh(Rng(spec.seed * 13 + k), n=rng.randint(4, 8), r=0.5 * ps) for k in range(6)]
    per: dict[str, list[MeshPart]] = {c: [] for c in spec.corona}
    found: np.ndarray | None = None
    view = az_dir(-130, 30)
    pts = fib(spec.n_proteins, rng, 0.15)
    for k in range(len(pts)):
        u = pts[k, :]
        vt, ft = tpls[k % 6]
        cl = spec.corona[rng.randrange(len(spec.corona))]
        quat = Quaternion([rng.gauss(0, 1) for _ in range(4)])
        mat = np.array(quat.normalized().to_matrix()) * rng.uniform(0.8, 1.25)
        per[cl].append(inst(vt, ft, [mat], [u * (spec.radius + 0.35 * ps)]))
        if found is None or np.dot(u, view) > np.dot(found, view):
            found = u
    for k, (cl, parts) in enumerate(per.items()):
        if parts:
            _ = add_obj(g, f"corona{k}", cat(parts), [bio_mat(cl, "protein")])
    return found


def peg_chains(g: Group, spec: NanoSpec, rng: Rng) -> None:
    big = spec.radius
    parts: list[MeshPart] = []
    pts = fib(spec.peg, rng, 0.2)
    for i in range(len(pts)):
        u = pts[i, :]
        t = np.linspace(0, 1, 18)
        length = rng.uniform(0.35, 0.55) * big
        side = np.cross(u, [rng.gauss(0, 1) for _ in range(3)])
        side /= np.linalg.norm(side)
        wiggle = (0.04 * big * np.sin(t * 14 + rng.uniform(0, 6)))[:, None]
        path = u[None] * (big + length * t[:, None]) + side[None] * wiggle
        parts.append(tube(path, 0.012 * big, sides=6))
    _ = add_obj(g, "peg", cat(parts), [bio_mat(spec.peg_color, "protein")], RECALC)
    anchor(g, "peg", az_dir(-10, 40) * (big * 1.45))


def nanoparticle(**kw: Unpack[NanoKw]) -> Built:
    spec = NanoSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("nanoparticle", spec.loc, spec.rot)
    big, ps = spec.radius, spec.protein_size
    vc, fc = ico(5)
    _ = add_obj(g, "core", (vc * big, fc), [bio_mat(spec.core, spec.core_preset)])
    a_c = corona_proteins(g, spec, rng)
    if spec.peg:
        peg_chains(g, spec, rng)
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", (0, 0, big + ps))
    anchor(g, "core", az_dir(-90, 5) * big)
    if a_c is not None:
        anchor(g, "corona", a_c * (big + ps))
    return done(g)


class BacteriumKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    length: float
    radius: float
    bend: float
    seed: int
    color: str
    pili: int
    pilus_color: str | None
    flagella: int
    flagellum_color: str
    flagellum_len: float


@dataclass(frozen=True)
class BacteriumSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    length: float = 1.6
    radius: float = 0.34
    bend: float = 0.08
    seed: int = 0
    color: str = "#7cb36a"
    pili: int = 70
    pilus_color: str | None = None
    flagella: int = 1
    flagellum_color: str = "#4e6b3a"
    flagellum_len: float = 2.6


def body_surface(spec: BacteriumSpec, s: float, a: float) -> tuple[np.ndarray, np.ndarray]:
    length, r = spec.length, spec.radius
    x = s * (length / 2)
    nrm = np.array([0, math.cos(a), math.sin(a)])
    z_off = spec.bend * (1 - (x / (length / 2 + r)) ** 2) * r * 2
    return np.array([x, 0, z_off]) + nrm * r, nrm


def bacterium_body(g: Group, spec: BacteriumSpec) -> None:
    length, r = spec.length, spec.radius
    v, f = capsule(length, r, 64, 36, bend=0.0)
    rad = make_radial(spec.seed, 0.02, 3.0)
    unit = v / (np.linalg.norm(v, axis=1)[:, None] + 1e-9)
    v = v * np.array([radial_at(rad, row) for row in unit.tolist()])[:, None]
    v = v[:, [2, 1, 0]] * [1, 1, 1]
    v[:, 2] += spec.bend * (1 - (v[:, 0] / (length / 2 + r)) ** 2) * r * 2
    _ = add_obj(g, "body", (v, f[:, ::-1]), [bio_mat(spec.color, "cell", tex=6.0)])


def bacterium_pili(g: Group, spec: BacteriumSpec, rng: Rng) -> None:
    length = spec.length
    parts: list[MeshPart] = []
    for _ in range(spec.pili):
        p, nrm = body_surface(spec, rng.uniform(-1, 1), rng.uniform(0, 2 * math.pi))
        ln = rng.uniform(0.07, 0.16) * length
        bendv = np.array([rng.gauss(0, 1) for _ in range(3)]) * 0.5
        t = np.linspace(0, 1, 10)[:, None]
        path = p - nrm * 0.01 * length + nrm * ln * t + bendv * ln * t**2
        parts.append(tube(path, 0.0055 * length, sides=6))
    if parts:
        _ = add_obj(g, "pili", cat(parts), [bio_mat(spec.pilus_color or shade(spec.color, 0.8), "protein")], RECALC)


def bacterium_flagella(g: Group, spec: BacteriumSpec, rng: Rng) -> np.ndarray | None:
    length, r = spec.length, spec.radius
    parts: list[MeshPart] = []
    tip: np.ndarray | None = None
    for _ in range(spec.flagella):
        p0 = np.array([-(length / 2 + r * 0.95), 0, 0]) + np.array([0, rng.gauss(0, 0.08), rng.gauss(0, 0.08)]) * r
        t = np.linspace(0, 1, 260)
        amp = 0.16 * r * 2 * np.clip(t * 8, 0, 1)
        w = 2 * math.pi * 5.5
        dirv = np.array([-1.0, rng.gauss(0, 0.15), rng.gauss(0, 0.15)])
        dirv /= np.linalg.norm(dirv)
        helix = np.stack([amp * np.cos(w * t), amp * np.sin(w * t), t * spec.flagellum_len * length], -1)
        path = p0 + (helix @ rot_to(dirv).T)
        parts.append(tube(path, 0.014 * length, sides=8))
        tip = tip if tip is not None else path[-1, :]
    if parts:
        _ = add_obj(g, "flagella", cat(parts), [bio_mat(spec.flagellum_color, "protein")], RECALC)
    return tip


def bacterium(**kw: Unpack[BacteriumKw]) -> Built:
    spec = BacteriumSpec(**kw)
    rng = Rng(spec.seed)
    g = group_new("bacterium", spec.loc, spec.rot)
    length, r = spec.length, spec.radius
    bacterium_body(g, spec)
    bacterium_pili(g, spec, rng)
    tip = bacterium_flagella(g, spec, rng)
    anchor(g, "body", body_surface(spec, 0.1, -math.pi / 2 - 0.3)[0])
    anchor(g, "pole", (length / 2 + r, 0, 0))
    anchor(g, "pole_back", (-(length / 2 + r), 0, 0))
    anchor(g, "top", (0, 0, r + 2 * spec.bend * r))
    anchor(g, "pilus", body_surface(spec, 0.5, math.pi / 2 - 0.2)[0] + np.array([0, 0, 0.12 * length]))
    if tip is not None:
        anchor(g, "flagellum_tip", tip)
    return done(g)
