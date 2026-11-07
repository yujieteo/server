# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_height.py
import math

from apparatus3d_core import TAU, Anchors, HeightSpec, Mat, Obj, Rng, Vec3, fbm, mesh_obj
from mathutils import Matrix, Vector

POLE = 1e-3
SOFT_K = 12.0


def phases(seed: int) -> Vec3:
    rr = Rng(seed)
    return rr.uniform(0, TAU), rr.uniform(0, TAU), rr.uniform(0, TAU)


def river_at(sp: HeightSpec, x: float) -> float:
    return 0.16 * sp.sy * math.sin(TAU * 0.8 * x / sp.sx + sp.phases[0]) + 0.06 * sp.sy * math.sin(
        TAU * 1.9 * x / sp.sx + sp.phases[1]
    )


def floor_level(sp: HeightSpec) -> float:
    return -0.35 * sp.relief


def water_level(sp: HeightSpec) -> float:
    return floor_level(sp) - 0.45 * sp.river_depth


def height_at(sp: HeightSpec, x: float, y: float) -> float:
    z = sp.relief * fbm(x * sp.scale, y * sp.scale, 0.0, sp.seed)
    if sp.river:
        floor = floor_level(sp)
        d = y - river_at(sp, x)
        gv = math.exp(-((d / sp.valley) ** 2))
        k = SOFT_K / max(sp.relief, POLE)
        z = floor + math.log1p(math.exp(k * (z - floor))) / k
        z = z * (1 - gv) + floor * gv - sp.river_depth * math.exp(-((d / sp.river_width) ** 4))
    if sp.coast:
        xc = sp.coast_x * sp.sx / 2 + 0.1 * sp.sx * math.sin(TAU * 0.7 * y / sp.sy + sp.phases[2])
        z += 1.1 * sp.relief * math.tanh((xc - x) / (0.12 * sp.sx)) - 0.2 * sp.relief
    return z


def axis_samples(extent: float, n: int) -> list[float]:
    return [-extent / 2 + extent * i / n for i in range(n + 1)]


def perimeter(nx: int, ny: int) -> list[tuple[int, int]]:
    return (
        [(i, 0) for i in range(nx)]
        + [(nx, j) for j in range(ny)]
        + [(i, ny) for i in range(nx, 0, -1)]
        + [(0, j) for j in range(ny, 0, -1)]
    )


def river_strip(sp: HeightSpec, zw: float, half: float, mat: Mat) -> Obj:
    vv: list[Vec3] = []
    sy = sp.sy
    for i in range(241):
        x = -sp.sx / 2 + sp.sx * i / 240
        yc = river_at(sp, x)
        vv.extend((x, max(-sy / 2, min(sy / 2, yc + t * half)), zw) for t in (-1, 1))
    return mesh_obj("river", vv, [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(240)], mat, smooth=False)


def terrain_of(anchors: Anchors) -> tuple[HeightSpec, Matrix, Matrix, float, float, bool]:
    t = anchors.terrain
    if t is None:
        msg = "anchors carry no terrain"
        raise ValueError(msg)
    return t.spec, t.xf, t.inv, t.base_z, t.sea_z, t.clamp_sea


def ground_z(anchors: Anchors, x: float, y: float) -> float:
    spec, xf, inv, base_z, sea_z, clamp_sea = terrain_of(anchors)
    p = inv @ Vector((x, y, 0))
    h = height_at(spec, p.x, p.y)
    return (xf @ Vector((p.x, p.y, max(h, sea_z) if clamp_sea else base_z + h))).z


def river_y(anchors: Anchors, x: float) -> float:
    return river_at(terrain_of(anchors)[0], x)


def inside_block(anchors: Anchors, x: float, y: float) -> bool:
    spec, _, inv, _, _, _ = terrain_of(anchors)
    p = inv @ Vector((x, y, 0))
    return abs(p.x) < spec.sx / 2 and abs(p.y) < spec.sy / 2
