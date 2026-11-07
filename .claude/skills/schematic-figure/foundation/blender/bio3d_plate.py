# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_plate.py
from collections.abc import Sequence
from dataclasses import dataclass
from typing import NamedTuple, TypedDict, Unpack

import bpy
from bio3d_geo import box, cat, fix, lathe, shift, tri
from bio3d_mat import bio_mat
from bio3d_obj import Group, add_obj, anchor, boolean, cutter, done, group_new
from bio3d_types import NO_ROT, ORIGIN, Built, Mesh, MeshOpts, Vec3

type WellColors = str | dict[str, str] | Sequence[Sequence[str | None]] | None

LP, WP, HP = 127.76, 85.48, 14.35
WALL, DECK, SKIRT = 0.9, 1.6, 1.3
ROW_NAMES = "ABCDEFGHIJKLMNOP"


class PlateDims(NamedTuple):
    rows: int
    cols: int
    pitch: float
    ox: float
    oy: float
    rw: float
    depth: float


PLATES = {
    6: PlateDims(2, 3, 39.12, 24.76, 23.16, 17.4, 17.4),
    12: PlateDims(3, 4, 26.0, 24.94, 16.79, 11.05, 17.5),
    24: PlateDims(4, 6, 19.3, 17.05, 13.67, 8.0, 17.4),
    48: PlateDims(6, 8, 13.08, 18.16, 10.08, 5.6, 17.4),
    96: PlateDims(8, 12, 9.0, 14.38, 11.24, 3.43, 10.7),
    384: PlateDims(16, 24, 4.5, 12.13, 8.99, 1.85, 11.5),
}


class PlateKw(TypedDict, total=False):
    loc: Vec3
    rot: Vec3
    wells: int
    length: float
    well_colors: WellColors
    fill: float
    plastic: str
    seed: int
    empty_color: str | None


@dataclass(frozen=True)
class PlateSpec:
    loc: Vec3 = ORIGIN
    rot: Vec3 = NO_ROT
    wells: int = 96
    length: float = 4.0
    well_colors: WellColors = "#f2a7b6"
    fill: float = 0.8
    plastic: str = "clear"
    seed: int = 0
    empty_color: str | None = None


def plate_material(plastic: str) -> bpy.types.Material:
    if plastic == "clear":
        return bio_mat("#eef2f6", "plastic_clear", rough=0.1, ior=1.15, trans=0.82)
    if plastic == "white":
        return bio_mat("#e3e6e9", "plastic_white")
    return bio_mat("#262a2e", "matte", rough=0.4)


def well_color(spec: PlateSpec, i: int, j: int) -> str | None:
    wc = spec.well_colors
    if wc is None:
        return spec.empty_color
    if isinstance(wc, str):
        return wc
    if isinstance(wc, dict):
        return wc.get(f"{ROW_NAMES[i]}{j + 1}", spec.empty_color)
    return wc[i][j]


def well_centers(dims: PlateDims) -> dict[tuple[int, int], tuple[float, float]]:
    centers: dict[tuple[int, int], tuple[float, float]] = {}
    for i in range(dims.rows):
        for j in range(dims.cols):
            centers[i, j] = (-LP / 2 + dims.ox + j * dims.pitch, WP / 2 - dims.oy - i * dims.pitch)
    return centers


def stamp(mesh: Mesh, centers: dict[tuple[int, int], tuple[float, float]]) -> Mesh:
    return cat([(shift(mesh[0], x, y, 0), mesh[1]) for (x, y) in centers.values()])


def build_deck(g: Group, dims: PlateDims, spec: PlateSpec, pmat: bpy.types.Material) -> None:
    sk = SKIRT
    vd, fd = box((-LP / 2 + sk * 0.5, -WP / 2 + sk * 0.5, HP - DECK), (LP / 2 - sk * 0.5, WP / 2 - sk * 0.5, HP))
    clear_mat = bio_mat("#dde4ea", "plastic_clear", rough=0.18, ior=1.2, trans=0.6)
    o = add_obj(g, "deck", (vd, tri(fd)), [clear_mat if spec.plastic == "clear" else pmat], MeshOpts(smooth=False))
    centers = well_centers(dims)
    vcy, fcy = lathe([(0, HP - DECK - 1), (dims.rw, HP - DECK - 1), (dims.rw, HP + 1), (0, HP + 1)], 48)
    boolean(o, cutter(g, stamp((vcy, fix(vcy, fcy)), centers), pmat, "holes"))


def build_wells(g: Group, dims: PlateDims, pmat: bpy.types.Material) -> None:
    rw, zb = dims.rw, HP - dims.depth
    prof = [
        (0, zb - WALL),
        (rw + WALL * 0.8, zb - WALL),
        (rw + WALL, zb - WALL * 0.3),
        (rw + WALL, HP - DECK - 0.01),
        (rw, HP - DECK - 0.01),
        (rw, zb + 0.3),
        (rw - 0.3, zb),
        (0, zb),
    ]
    vw, fw = lathe(prof, 48)
    _ = add_obj(g, "wells", stamp((vw, fix(vw, fw)), well_centers(dims)), [pmat])


def build_skirt(g: Group, pmat: bpy.types.Material) -> None:
    sk = SKIRT
    parts: list[Mesh] = []
    for lo, hi in [
        ((-LP / 2, -WP / 2, 0), (LP / 2, -WP / 2 + sk, HP)),
        ((-LP / 2, WP / 2 - sk, 0), (LP / 2, WP / 2, HP)),
        ((-LP / 2, -WP / 2 + sk, 0), (-LP / 2 + sk, WP / 2 - sk, HP)),
        ((LP / 2 - sk, -WP / 2 + sk, 0), (LP / 2, WP / 2 - sk, HP)),
    ]:
        v, f = box(lo, hi)
        parts.append((v, tri(f)))
    sko = add_obj(g, "skirt", cat(parts), [pmat], MeshOpts(smooth=False))
    bv = sko.modifiers.new("bev", "BEVEL")
    bv.width = 0.4
    bv.segments = 2


def build_liquids(g: Group, dims: PlateDims, spec: PlateSpec) -> None:
    zb = HP - dims.depth
    zl = zb + 0.05
    zt = zl + spec.fill * (dims.depth - DECK - 0.3)
    rl = dims.rw - 0.05
    prof = [
        (0, zl),
        (rl - 0.3, zl),
        (rl, zl + 0.3),
        (rl, zt),
        (0.85 * rl, zt - 0.08 * rl),
        (0.5 * rl, zt - 0.12 * rl),
        (0, zt - 0.13 * rl),
    ]
    vl, fl = lathe(prof, 40)
    fl = fix(vl, fl)
    per: dict[str, list[Mesh]] = {}
    for (i, j), (x, y) in well_centers(dims).items():
        cl = well_color(spec, i, j)
        if cl:
            per.setdefault(cl, []).append((shift(vl, x, y, 0), fl))
    for k, (cl, parts) in enumerate(per.items()):
        mat = bio_mat(cl, "liquid", trans=0.55, sss=0.45, sss_scale=0.8, rough=0.05)
        _ = add_obj(g, f"liquid{k}", cat(parts), [mat])


def well_plate(**kw: Unpack[PlateKw]) -> Built:
    spec = PlateSpec(**kw)
    g = group_new("plate", spec.loc, spec.rot, spec.length / LP)
    dims = PLATES[spec.wells]
    pmat = plate_material(spec.plastic)
    build_deck(g, dims, spec, pmat)
    build_wells(g, dims, pmat)
    build_skirt(g, pmat)
    build_liquids(g, dims, spec)
    corners = ((0, 0), (0, dims.cols - 1), (dims.rows - 1, 0), (dims.rows - 1, dims.cols - 1))
    for (i, j), (x, y) in well_centers(dims).items():
        if (i, j) in corners or j == 0:
            anchor(g, f"{ROW_NAMES[i]}{j + 1}", (x, y, HP))
    anchor(g, "plate", (0, -WP / 2, HP / 2))
    anchor(g, "corner", (LP / 2, -WP / 2, HP))
    return done(g)
