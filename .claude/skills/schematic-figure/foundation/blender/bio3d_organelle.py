# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_organelle.py
import math
from dataclasses import dataclass, field

import numpy as np
from bio3d_cut import Cut, cut_depth, cut_inside, cut_world
from bio3d_geo import capsule, ico, inst, lathe, rot_to, unit_gauss
from bio3d_obj import Radial, make_radial, radial_at
from bio3d_types import TWIST_MAX, MeshPart, Point, Rng

type Sample = tuple[np.ndarray, np.ndarray] | None

MIN_AXES = 2
TRIES_FREE = 200
TRIES_FACE = 400
TRIES_SPOT = 30
MID_Z = -0.03
ER_STEPS = 22
WEDGES = {"octant": [1, -1, 1], "quadrant": [1, -1, 0], "half": [0, -1, 0]}
FACES = {"octant": 3, "quadrant": 2, "half": 1}


@dataclass(frozen=True)
class CellCtx:
    rng: Rng
    seed: int
    radius: float
    sh: np.ndarray
    shn: np.ndarray
    cut: Cut | None
    rad: Radial
    rn: float
    pop: float
    rmax: float
    placed: list[tuple[np.ndarray, float]] = field(default_factory=list)


def surf_pt(ctx: CellCtx, u: Point) -> np.ndarray:
    uu = np.asarray(u, float)
    uu = uu / np.linalg.norm(uu)
    return uu * radial_at(ctx.rad, uu) * ctx.sh * ctx.radius


def free_point(ctx: CellCtx, rlo: float, rhi: float, margin: float) -> Sample:
    for _ in range(TRIES_FREE):
        u = unit_gauss(ctx.rng)
        p = u * ctx.rng.uniform(rlo, rhi) * ctx.sh / ctx.sh.max()
        if ctx.cut is not None and cut_inside(ctx.cut, p, margin):
            continue
        return p, u
    return None


def cut_sample(ctx: CellCtx, cut: Cut, rhi: float, ro: float) -> tuple[np.ndarray, list[float]]:
    rng, cz = ctx.rng, cut.cz
    f = rng.randrange(FACES[cut.mode])
    a, b = rng.uniform(0.03, 1.0) * rhi, rng.uniform(0.03, 1.0) * rhi
    off = rng.uniform(-0.1, 0.6) * ro
    ang = rng.uniform(0, 2 * math.pi)
    ca, sa = math.cos(ang), math.sin(ang)
    if cut.mode == "half":
        return np.array([rng.uniform(-rhi, rhi), -cz + off, rng.uniform(-rhi, rhi)]), [ca, 0, sa]
    if f == 0:
        return np.array([a, off, (cz + b) if cut.mode == "octant" else rng.uniform(-rhi, rhi)]), [ca, 0, sa]
    if f == 1:
        return np.array([-off, -a, (cz + b) if cut.mode == "octant" else rng.uniform(-rhi, rhi)]), [0, ca, sa]
    return np.array([a, -b, cz - off]), [ca, sa, 0]


def face_point(ctx: CellCtx, rlo: float, rhi: float, ro: float) -> Sample:
    cut = ctx.cut
    if cut is None:
        s = free_point(ctx, rlo, rhi, 0.0)
        return None if s is None else (s[0], np.cross(s[1], [ctx.rng.gauss(0, 1) for _ in range(3)]))
    centre = np.array([0, 0, MID_Z * ctx.radius])
    for _ in range(TRIES_FACE):
        q, t = cut_sample(ctx, cut, rhi, ro)
        p = cut_world(cut, q)
        if not (rlo <= np.linalg.norm(p / ctx.shn) <= rhi):
            continue
        if np.linalg.norm(p - centre) < ctx.rn * 1.05 + 0.5 * ctx.pop + ro:
            continue
        return p, cut_world(cut, t)
    return None


def clear(ctx: CellCtx, p: np.ndarray, rad: float) -> bool:
    return all(np.linalg.norm(p - q) > 0.9 * (rad + rq) for q, rq in ctx.placed)


def find_spot(ctx: CellCtx, rlo: float, rhi: float, ro_rad: tuple[float, float]) -> Sample:
    s: Sample = None
    for _ in range(TRIES_SPOT):
        s = face_point(ctx, rlo, rhi, ro_rad[0])
        if s is None or clear(ctx, s[0], ro_rad[1]):
            break
    if s is None or not clear(ctx, s[0], ro_rad[1]):
        return None
    return s


def deeper(ctx: CellCtx, cur: np.ndarray | None, p: np.ndarray) -> np.ndarray:
    if cur is None or (ctx.cut is not None and cut_depth(ctx.cut, p) > cut_depth(ctx.cut, cur)):
        return p
    return cur


def place_mito(ctx: CellCtx, count: int) -> tuple[list[MeshPart], np.ndarray | None]:
    rng, big = ctx.rng, ctx.radius
    parts: list[MeshPart] = []
    found: np.ndarray | None = None
    for _ in range(count):
        length, r = rng.uniform(0.16, 0.30) * big, rng.uniform(0.050, 0.068) * big
        s = find_spot(ctx, ctx.rn * 1.1, ctx.rmax - 0.5 * length, (r, 0.5 * length + r))
        if s is None:
            continue
        p, tang = s
        ctx.placed.append((p, 0.5 * length + r))
        vc, fc = capsule(length, r, 20, 12, bend=rng.uniform(-0.6, 0.6) * r)
        parts.append(inst(vc, fc, [rot_to(tang, rng.uniform(0, TWIST_MAX))], [p]))
        found = deeper(ctx, found, p)
    return parts, found


def place_vesicles(ctx: CellCtx, count: int) -> tuple[list[MeshPart], np.ndarray | None]:
    parts: list[MeshPart] = []
    found: np.ndarray | None = None
    for _ in range(count):
        rv = ctx.rng.uniform(0.025, 0.045) * ctx.radius
        s = find_spot(ctx, ctx.rn * 1.1, ctx.rmax, (rv, rv))
        if s is None:
            continue
        p = s[0]
        ctx.placed.append((p, rv))
        vv, fv = ico(2)
        parts.append((vv * rv + p, fv))
        found = deeper(ctx, found, p)
    return parts, found


def er_axes(ctx: CellCtx) -> list[np.ndarray]:
    axes: list[np.ndarray] = []
    if ctx.cut is not None:
        wedge = np.array(WEDGES[ctx.cut.mode], float)
        axes.append(cut_world(ctx.cut, wedge / np.linalg.norm(wedge)))
    while len(axes) < MIN_AXES:
        axes.append(unit_gauss(ctx.rng))
    return axes


def er_profile(rho: float, tk: float, tm: float) -> list[tuple[float, float]]:
    th = np.linspace(0, tm, ER_STEPS)
    prof = [((rho + tk / 2) * math.sin(t), (rho + tk / 2) * math.cos(t)) for t in th]
    prof += [(rho * math.sin(tm + 0.02), rho * math.cos(tm + 0.02))]
    prof += [((rho - tk / 2) * math.sin(t), (rho - tk / 2) * math.cos(t)) for t in th[::-1]]
    return prof


def er_stacks(ctx: CellCtx, n_er: int) -> tuple[list[MeshPart], np.ndarray | None]:
    rng, big = ctx.rng, ctx.radius
    parts: list[MeshPart] = []
    found: np.ndarray | None = None
    tk, wob = 0.024 * big, make_radial(ctx.seed + 21, 0.035, 2.2)
    for si, ax0 in enumerate(er_axes(ctx)):
        ax = ax0 + np.array([rng.gauss(0, 0.15) for _ in range(3)])
        ax /= np.linalg.norm(ax)
        m = rot_to(ax, rng.uniform(0, TWIST_MAX))
        for k in range(n_er):
            rho = ctx.rn * 1.1 + 0.5 * ctx.pop + 0.055 * big * (k + 0.5)
            if rho > ctx.rmax - 0.06 * big:
                break
            tm = math.radians(rng.uniform(42, 62)) * (1.0 if si == 0 else 0.7)
            vc, fc = lathe(er_profile(rho, tk, tm), 56)
            d = vc / (np.linalg.norm(vc, axis=1)[:, None] + 1e-9)
            vc = vc * np.array([radial_at(wob, row) for row in d.tolist()])[:, None]
            parts.append(((vc @ m.T) * ctx.shn**0.5, fc))
            if si == 0 and k == n_er // 2:
                found = ax * rho
    return parts, found
