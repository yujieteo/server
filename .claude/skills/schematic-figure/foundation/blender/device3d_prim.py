# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_prim.py
import math
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack, cast

import bpy
from device3d_mat import material, resolve
from device3d_mesh import TAU, Buf, MeshOpts, add_bevel, add_sphere, buf_solid, make_object
from device3d_types import Faces, MatSpec, Poly, PtLike, Vec2, Vec3
from mathutils import Vector
from scene import shadow_floor

CORNER_STEPS = 6
PROFILE_STEPS = 5
ARC_STEPS = 6
CORNER_EPS = 1e-4
PROFILE_EPS = 1e-5
FULL_TURN_EPS = 1e-9
BEVEL_FRACTION = 0.3
ORIGIN: Vec3 = (0, 0, 0)
CORNERS = ((1, -1, -90), (1, 1, 0), (-1, 1, 90), (-1, -1, 180))
LIGHT_ROWS = (("key", (-3, -4, 6), 5), ("fill", (5, -3, 2), 6), ("rim", (0, 5, 5), 4))


class PrismOpts(TypedDict, total=False):
    bevel: float
    name: str
    loc: Vec3


class SweepOpts(TypedDict, total=False):
    a0: float
    a1: float
    steps: int
    loc: Vec3
    name: str
    sharp: float


class TubeOpts(TypedDict, total=False):
    cyclic: bool
    name: str
    radii: Sequence[float]


class WireOpts(TypedDict, total=False):
    loop: float
    radius: float
    color: str
    ball: bool


class StudioOpts(TypedDict, total=False):
    key: float
    fill: float
    rim: float
    floor: float | None
    target: Vec3
    shadows: Sequence[str]


@dataclass(frozen=True)
class SpringSection:
    r1: float
    r2: float
    t: float
    h: float


@dataclass(frozen=True)
class RollSection:
    r_in: float
    pitch: float
    off: float
    t: float
    k: int
    z0: float
    z1: float


type Section = SpringSection | RollSection


def prism_verts(poly: Poly, z0: float, z1: float, loc: Vec3) -> list[Vec3]:
    bottom = [(loc[0] + x, loc[1] + y, loc[2] + z0) for x, y in poly]
    top = [(loc[0] + x, loc[1] + y, loc[2] + z1) for x, y in poly]
    return [*bottom, *top]


def prism_faces(n: int) -> Faces:
    sides: Faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return [tuple(range(n))[::-1], tuple(range(n, 2 * n)), *sides]


def prism(
    poly: Poly,
    z0: float,
    z1: float,
    mat: MatSpec,
    **opts: Unpack[PrismOpts],
) -> bpy.types.Object:
    bevel = opts.get("bevel", 0.0)
    verts = prism_verts(poly, z0, z1, opts.get("loc", ORIGIN))
    mesh_opts = MeshOpts(smooth=bool(bevel), merge=True)
    solid = make_object(opts.get("name", "prism"), verts, prism_faces(len(poly)), resolve(mat), mesh_opts)
    if bevel:
        _ = add_bevel(solid, min(bevel, BEVEL_FRACTION * abs(z1 - z0)))
    return solid


def rect(w: float, d: float, cx: float = 0.0, cy: float = 0.0) -> Poly:
    return [(cx - w / 2, cy - d / 2), (cx + w / 2, cy - d / 2), (cx + w / 2, cy + d / 2), (cx - w / 2, cy + d / 2)]


def rounded_rect(w: float, d: float, rad: float, cx: float = 0.0, cy: float = 0.0) -> Poly:
    rad = min(rad, w / 2 - CORNER_EPS, d / 2 - CORNER_EPS)
    pts: Poly = []
    for sx, sy, a0 in CORNERS:
        ccx, ccy = cx + sx * (w / 2 - rad), cy + sy * (d / 2 - rad)
        for k in range(CORNER_STEPS + 1):
            a = math.radians(a0 + 90 * k / CORNER_STEPS)
            pts.append((ccx + rad * math.cos(a), ccy + rad * math.sin(a)))
    return pts


def slab(size: Vec3, loc: Vec3, mat: MatSpec, bevel: float = 0.02, name: str = "slab") -> bpy.types.Object:
    w, d, t = size
    return prism(rect(w, d, loc[0], loc[1]), loc[2] - t / 2, loc[2] + t / 2, mat, bevel=bevel, name=name)


def loop_at(section: Poly | Section, th: float) -> Poly:
    if isinstance(section, list):
        return section
    if isinstance(section, SpringSection):
        z = section.h / 2 + (section.h / 2 - section.t) * math.sin(3 * th)
        lo, hi = z - section.h / 2, z + section.t - section.h / 2
        return [(section.r1, lo), (section.r2, lo), (section.r2, hi), (section.r1, hi)]
    r = section.r_in + section.pitch * (th + section.k * TAU) / TAU + section.off
    return [(r, section.z0), (r + section.t, section.z0), (r + section.t, section.z1), (r, section.z1)]


def ring_points(loop: Poly, th: float, loc: Vec3) -> list[Vec3]:
    c, s = math.cos(th), math.sin(th)
    return [(loc[0] + r * c, loc[1] + r * s, loc[2] + z) for r, z in loop]


def sweep_faces(n: int, m: int, *, full: bool) -> Faces:
    faces: Faces = []
    for k in range(n if full else n - 1):
        k2 = (k + 1) % n
        for i in range(m):
            faces.append((k * m + i, k * m + (i + 1) % m, k2 * m + (i + 1) % m, k2 * m + i))
    if not full:
        faces += [tuple(range(m))[::-1], tuple((n - 1) * m + i for i in range(m))]
    return faces


def sweep_data(section: Poly | Section, a0: float, a1: float, steps: int, loc: Vec3) -> tuple[list[Vec3], Faces]:
    full = abs((a1 - a0) - TAU) < FULL_TURN_EPS
    n = steps if full else max(2, round(steps * abs(a1 - a0) / TAU) + 1)
    m = len(loop_at(section, a0))
    verts: list[Vec3] = []
    for k in range(n):
        th = a0 + (a1 - a0) * k / (n if full else n - 1)
        verts += ring_points(loop_at(section, th), th, loc)
    return verts, sweep_faces(n, m, full=full)


def sweep(section: Poly | Section, mat: MatSpec, **opts: Unpack[SweepOpts]) -> bpy.types.Object:
    verts, faces = sweep_data(
        section, opts.get("a0", 0.0), opts.get("a1", TAU), opts.get("steps", 160), opts.get("loc", ORIGIN)
    )
    mesh_opts = MeshOpts(smooth=True, sharp=opts.get("sharp", 40), merge=True)
    return make_object(opts.get("name", "sweep"), verts, faces, resolve(mat), mesh_opts)


def arc(c: Vec2, rad: float, a0: float, a1: float, n: int = ARC_STEPS) -> Poly:
    cx, cz = c
    return [
        (
            cx + rad * math.cos(math.radians(a0 + (a1 - a0) * k / n)),
            cz + rad * math.sin(math.radians(a0 + (a1 - a0) * k / n)),
        )
        for k in range(n + 1)
    ]


def rounded_profile(r0: float, r1: float, z0: float, z1: float, rad: float) -> Poly:
    n = PROFILE_STEPS
    rad = min(rad, (z1 - z0) / 2 - PROFILE_EPS, (r1 - r0) / 2 - PROFILE_EPS)
    pts: Poly = [(r0, z0)] if r0 == 0 else arc((r0 + rad, z0 + rad), rad, 180, 270, n)
    pts += arc((r1 - rad, z0 + rad), rad, 270, 360, n) + arc((r1 - rad, z1 - rad), rad, 0, 90, n)
    pts += [(r0, z1)] if r0 == 0 else arc((r0 + rad, z1 - rad), rad, 90, 180, n)
    return pts


def tube(
    points: Sequence[PtLike],
    radius: float,
    mat: MatSpec,
    **opts: Unpack[TubeOpts],
) -> bpy.types.Object:
    name = opts.get("name", "tube")
    radii = opts.get("radii")
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.resolution_u = 16
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    sp.use_cyclic_u = opts.get("cyclic", False)
    for k, (bp, p) in enumerate(zip(sp.bezier_points, points, strict=True)):
        bp.co = (float(p[0]), float(p[1]), float(p[2]))
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
        if radii is not None:
            bp.radius = radii[k]
    obj = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(obj)
    cu.materials.append(resolve(mat))
    return obj


def wire_balls(a: Vector, b: Vector, radius: float, m: bpy.types.Material) -> bpy.types.Object:
    buf = Buf()
    add_sphere(buf, (a.x, a.y, a.z + radius * 0.6), radius * 2.4, scale=(1, 1, 0.55))
    add_sphere(buf, (b.x, b.y, b.z + radius * 0.3), radius * 1.9, scale=(1.6, 1, 0.35))
    return buf_solid(buf, "bond_balls", m)


def wire_bond(p0: PtLike, p1: PtLike, **opts: Unpack[WireOpts]) -> list[bpy.types.Object]:
    loop = opts.get("loop", 0.5)
    radius = opts.get("radius", 0.012)
    a, b = Vector(p0), Vector(p1)
    m = material("gold", opts.get("color", "#d6a74f"))
    top = max(a.z, b.z) + loop
    pts = [
        a,
        a + Vector((0, 0, loop * 0.55)),
        a.lerp(b, 0.28) + Vector((0, 0, top - a.lerp(b, 0.28).z)),
        a.lerp(b, 0.72) + Vector((0, 0, (top - a.lerp(b, 0.72).z) * 0.6)),
        b,
    ]
    objs = [tube([(p.x, p.y, p.z) for p in pts], radius, m, name="bondwire")]
    if opts.get("ball", True):
        objs.append(wire_balls(a, b, radius, m))
    return objs


def studio(scale: float = 1.0, **opts: Unpack[StudioOpts]) -> list[bpy.types.Object]:
    energies = (opts.get("key", 260), opts.get("fill", 90), opts.get("rim", 140))
    shadows = opts.get("shadows", ("key",))
    target = Vector(opts.get("target", ORIGIN))
    objs: list[bpy.types.Object] = []
    for (name, loc, size), e in zip(LIGHT_ROWS, energies, strict=True):
        p = target + Vector(loc) * scale
        bpy.ops.object.light_add(type="AREA", location=p)
        light = bpy.context.object
        data = cast("bpy.types.Light", light.data)
        data.energy = e * scale * scale
        data.size = size * scale
        light.rotation_euler = (target - p).to_track_quat("-Z", "Y").to_euler()
        data.use_shadow = name in shadows
        objs.append(light)
    floor = opts.get("floor")
    if floor is not None:
        objs.append(shadow_floor(z=floor, size=40 * scale))
    return objs
