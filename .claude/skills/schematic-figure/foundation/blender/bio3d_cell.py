# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_cell.py
import math
from dataclasses import dataclass
from typing import TypedDict, Unpack

import numpy as np
from bio3d_cut import cut_box, cut_inside, cut_new, cut_world
from bio3d_geo import az_dir, capsule, cat, fib, ico, inst, rot_to, rot_y, shade, shift
from bio3d_mat import bio_mat, shell_mat
from bio3d_obj import Group, add_obj, anchor, boolean, cutter, done, group_new, make_radial, wobbly
from bio3d_organelle import CellCtx, er_stacks, place_mito, place_vesicles, surf_pt
from bio3d_types import NO_ROT, ORIGIN, TWIST_MAX, Built, MeshOpts, MeshPart, Rng, Vec3

MAT_RECALC = MeshOpts(recalc=True)


class CellKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    radius: float
    shape: Vec3
    seed: int
    wobble: float
    membrane: str
    cytoplasm: str
    nucleus: str
    nucleolus: str
    mito: str
    er: str
    vesicle: str
    receptor: str
    n_mito: int
    n_er: int
    n_vesicles: int
    receptors: int
    receptor_kind: str
    cutaway: str | None
    cut_azimuth: float
    cut_height: float
    translucent: bool
    organelles: bool
    nucleus_size: float
    nucleus_pop: float


@dataclass(frozen=True)
class CellSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    radius: float = 1.0
    shape: Vec3 = (1.0, 0.94, 0.82)
    seed: int = 0
    wobble: float = 0.06
    membrane: str = "#e07a62"
    cytoplasm: str = "#f2b9a0"
    nucleus: str = "#6a4c9c"
    nucleolus: str = "#3b2a70"
    mito: str = "#df5f3b"
    er: str = "#4f9bc6"
    vesicle: str = "#f0b43c"
    receptor: str = "#2e6fae"
    n_mito: int = 18
    n_er: int = 4
    n_vesicles: int = 26
    receptors: int = 40
    receptor_kind: str = "Y"
    cutaway: str | None = "octant"
    cut_azimuth: float = -45.0
    cut_height: float = 0.0
    translucent: bool = False
    organelles: bool = True
    nucleus_size: float = 0.42
    nucleus_pop: float = 0.10


def receptor_tpl(kind: str, r: float) -> tuple[np.ndarray, np.ndarray]:
    if kind == "ball":
        vs, fs = capsule(0.07 * r, 0.011 * r, 10, 6)
        vh, fh = ico(2)
        return cat([(shift(vs, 0, 0, 0.045 * r), fs), (shift(vh * 0.034 * r, 0, 0, 0.115 * r), fh)])
    parts: list[MeshPart] = []
    vs, fs = capsule(0.07 * r, 0.013 * r, 12, 6)
    parts.append((shift(vs, 0, 0, 0.04 * r), fs))
    for sgn in (-1, 1):
        va, fa = capsule(0.06 * r, 0.017 * r, 12, 8)
        ry = rot_y(math.radians(32 * sgn))
        parts.append((shift(shift(va, 0, 0, 0.05 * r) @ ry.T, 0, 0, 0.085 * r), fa))
    return cat(parts)


def make_ctx(spec: CellSpec) -> CellCtx:
    sh = np.asarray(spec.shape, float)
    cut = (
        cut_new(spec.cutaway, spec.cut_azimuth, spec.cut_height * spec.radius)
        if (spec.cutaway and not spec.translucent)
        else None
    )
    rn = spec.nucleus_size * spec.radius * float(np.mean(sh))
    pop = spec.nucleus_pop * spec.radius if cut else 0.0
    rng = Rng(spec.seed)
    return CellCtx(
        rng,
        spec.seed,
        spec.radius,
        sh,
        sh / sh.max(),
        cut,
        make_radial(spec.seed, spec.wobble),
        rn,
        pop,
        0.88 * spec.radius * sh.min(),
    )


def build_membrane(g: Group, ctx: CellCtx, spec: CellSpec) -> None:
    verts, faces, _ = wobbly(5, ctx.radius, ctx.sh, ctx.rad)
    if spec.translucent:
        _ = add_obj(g, "membrane", (verts, faces), [shell_mat(spec.membrane)])
        return
    nrm = np.linalg.norm(verts, axis=1)
    vin = verts * ((nrm - 0.04 * ctx.radius) / nrm)[:, None]
    mem = add_obj(g, "membrane", cat([(verts, faces), (vin, faces[:, ::-1])]), [bio_mat(spec.membrane, "membrane")])
    cyt = add_obj(g, "cytoplasm", (vin, faces), [bio_mat(spec.cytoplasm, "cell")])
    if ctx.cut is not None:
        sec_m = bio_mat(shade(spec.membrane, 0.82), "section", mottle=0.06)
        boolean(mem, cutter(g, cut_box(ctx.cut, 0.0), sec_m))
        boolean(cyt, cutter(g, cut_box(ctx.cut, 0.0), bio_mat(spec.cytoplasm, "section", mottle=0.10, tex=9.0)))


def nucleolus_centre(ctx: CellCtx) -> np.ndarray:
    rn, cut = ctx.rn, ctx.cut
    if cut is None:
        return np.array([0.25 * rn, -0.2 * rn, 0.15 * rn])
    if cut.mode == "octant":
        return cut_world(cut, np.array([0.34 * rn + ctx.pop, -0.34 * rn - ctx.pop, cut.cz + ctx.pop]))
    return np.array([0.0, 0.0, 0.1 * rn])


def build_nucleus(g: Group, ctx: CellCtx, spec: CellSpec) -> np.ndarray:
    rn, r, eps = ctx.rn, ctx.radius, 0.006 * ctx.radius
    vn, fn, _ = wobbly(4, rn, (1.05, 1.0, 0.9), make_radial(spec.seed + 11, 0.05))
    nuc = add_obj(g, "nucleus", (shift(vn, 0, 0, -0.03 * r), fn), [bio_mat(spec.nucleus, "nucleus")])
    cno = nucleolus_centre(ctx)
    vo, fo, _ = wobbly(3, 0.30 * rn, (1, 1, 1), make_radial(spec.seed + 12, 0.08))
    nucl = add_obj(g, "nucleolus", (vo + cno, fo), [bio_mat(spec.nucleolus, "nucleus")])
    if ctx.cut is not None:
        sec_n = bio_mat(spec.nucleus, "section", mottle=0.35, tex=18.0)
        boolean(nuc, cutter(g, cut_box(ctx.cut, ctx.pop + eps), sec_n))
        sec_o = bio_mat(spec.nucleolus, "section", mottle=0.2, tex=25.0)
        boolean(nucl, cutter(g, cut_box(ctx.cut, ctx.pop + 2 * eps), sec_o))
    return cno


def build_organelles(g: Group, ctx: CellCtx, spec: CellSpec) -> dict[str, np.ndarray]:
    parts, a_mito = place_mito(ctx, spec.n_mito)
    if parts:
        _ = add_obj(g, "mitochondria", cat(parts), [bio_mat(spec.mito, "organelle")])
    parts, a_ves = place_vesicles(ctx, spec.n_vesicles)
    if parts:
        _ = add_obj(g, "vesicles", cat(parts), [bio_mat(spec.vesicle, "organelle")])
    parts, a_er = er_stacks(ctx, spec.n_er)
    ero = add_obj(g, "er", cat(parts), [bio_mat(spec.er, "organelle")], MAT_RECALC)
    if ctx.cut is not None:
        boolean(ero, cutter(g, cut_box(ctx.cut, 0.006 * ctx.radius), bio_mat(spec.er, "section", mottle=0.05)))
    named = (("mito", a_mito), ("vesicle", a_ves), ("er", a_er))
    return {name: pt for name, pt in named if pt is not None}


def build_receptors(g: Group, ctx: CellCtx, spec: CellSpec) -> np.ndarray | None:
    if not spec.receptors:
        return None
    r, rng = ctx.radius, ctx.rng
    vt, ft = receptor_tpl(spec.receptor_kind, r)
    ms: list[np.ndarray] = []
    ts: list[np.ndarray] = []
    pts = fib(spec.receptors, rng, 0.08)
    for i in range(len(pts)):
        u = pts[i, :]
        p = surf_pt(ctx, u)
        if ctx.cut is not None and cut_inside(ctx.cut, p, 0.10 * r):
            continue
        nrm = u / ctx.sh
        nrm /= np.linalg.norm(nrm)
        ms.append(rot_to(nrm, rng.uniform(0, TWIST_MAX)) * rng.uniform(0.85, 1.15))
        ts.append(p - 0.01 * r * nrm)
    if not ts:
        return None
    _ = add_obj(g, "receptors", inst(vt, ft, ms, ts), [bio_mat(spec.receptor, "protein")])
    view = az_dir(spec.cut_azimuth - 70, 40)
    best = ts[0]
    for p in ts[1:]:
        if np.dot(p / np.linalg.norm(p), view) > np.dot(best / np.linalg.norm(best), view):
            best = p
    return best


def cell_anchors(g: Group, ctx: CellCtx, spec: CellSpec, cno: np.ndarray) -> None:
    r, rn, cut = ctx.radius, ctx.rn, ctx.cut
    anchor(g, "center", (0, 0, 0))
    anchor(g, "top", surf_pt(ctx, (0, 0, 1)))
    anchor(g, "membrane", surf_pt(ctx, az_dir(spec.cut_azimuth - 60, 25)))
    anchor(g, "membrane_left", surf_pt(ctx, az_dir(spec.cut_azimuth - 90, 5)))
    anchor(g, "membrane_right", surf_pt(ctx, az_dir(spec.cut_azimuth + 90, 5)))
    if cut is None:
        anchor(g, "nucleus", (0, 0, 0))
        anchor(g, "nucleolus", cno)
        anchor(g, "nuclear_envelope", (0, 0, 0.9 * rn * 0.9))
        return
    if cut.mode == "octant":
        anchor(g, "cytoplasm", cut_world(cut, [0.62 * r, -0.62 * r, cut.cz]))
        anchor(g, "cut_wall", cut_world(cut, [0.55 * r, 0, cut.cz + 0.45 * r]))
        anchor(g, "nucleus", cut_world(cut, [0.12 * rn, -0.62 * rn, cut.cz]))
    else:
        anchor(g, "cytoplasm", cut_world(cut, [0.6 * r, -0.02, 0]))
        anchor(g, "cut_wall", cut_world(cut, [0.6 * r, 0, 0.3 * r]))
        anchor(g, "nucleus", cut_world(cut, [0.3 * rn, -0.01, 0]))
    anchor(g, "nucleolus", cno)
    anchor(g, "nuclear_envelope", (0, 0, rn * 0.88))


def cell(**kw: Unpack[CellKw]) -> Built:
    spec = CellSpec(**kw)
    g = group_new("cell", spec.loc, spec.rot)
    ctx = make_ctx(spec)
    build_membrane(g, ctx, spec)
    cno = build_nucleus(g, ctx, spec)
    found = build_organelles(g, ctx, spec) if spec.organelles else {}
    rec = build_receptors(g, ctx, spec)
    if rec is not None:
        found["receptor"] = rec
    cell_anchors(g, ctx, spec, cno)
    for name, pt in found.items():
        anchor(g, name, pt)
    return done(g)
