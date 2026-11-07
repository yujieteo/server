# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_core.py
import colorsys
import math
import random
from collections.abc import Sequence
from dataclasses import dataclass
from itertools import pairwise
from typing import TypedDict, Unpack

import bmesh
import bpy
from mathutils import Euler, Floats, Matrix, Vector, noise
from scene import cylinder, hex_rgb

TAU = 2 * math.pi
POLE_EPS = 1e-7
FBM_GAIN = 0.5
FBM_LAC = 2.03
BEVEL_SEGMENTS = 3
BEVEL_SHARP_DEG = 35.0
Vec2 = tuple[float, float]
Vec3 = tuple[float, float, float]
Vec4 = tuple[float, float, float, float]
Pts = list[Vec2]
Faces = Sequence[tuple[int, ...]]
Obj = bpy.types.Object
Mat = bpy.types.Material
MatArg = bpy.types.Material | Sequence[bpy.types.Material]


class Rng(random.Random): ...


@dataclass(frozen=True)
class HeightSpec:
    seed: int
    sx: float
    sy: float
    relief: float
    scale: float
    river: bool
    coast: bool
    river_depth: float
    river_width: float
    valley: float
    coast_x: float
    phases: Vec3


@dataclass(frozen=True)
class Terrain:
    xf: Matrix
    inv: Matrix
    spec: HeightSpec
    base_z: float
    sea_z: float
    clamp_sea: bool


@dataclass(frozen=True)
class Grid:
    xf: Matrix
    sx: float
    sy: float
    sz: float
    pitch: float


@dataclass(frozen=True)
class Arc:
    inv: Matrix
    xf: Matrix
    radius: float


class Anchors(dict[str, Vec3]):
    terrain: Terrain | None = None
    arc: Arc | None = None
    grid: Grid | None = None


Built = tuple[list[Obj], Anchors]


@dataclass
class Part:
    xf: Matrix
    objs: list[Obj]
    anchors: Anchors


class MeshOpts(TypedDict, total=False):
    smooth: bool
    sharp_deg: float
    mat_index: Sequence[int]
    flat: Sequence[int]


class LatheOpts(TypedDict, total=False):
    closed: bool
    smooth: bool
    sharp_deg: float


def tag(anchors: dict[str, Vec3], prefix: str) -> dict[str, Vec3]:
    return {f"{prefix}.{k}": v for k, v in anchors.items()}


def vec3(v: Vector) -> Vec3:
    return (v.x, v.y, v.z)


def hex_parts(hexc: str) -> tuple[int, int, int]:
    h = hexc.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def hex_str(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def jitter(hexc: str, rr: Rng, dh: float = 0.02, ds: float = 0.08, dv: float = 0.08) -> str:
    r8, g8, b8 = hex_parts(hexc)
    hue, sat, val = colorsys.rgb_to_hsv(r8 / 255, g8 / 255, b8 / 255)
    hue = (hue + rr.uniform(-dh, dh)) % 1
    sat = min(1, max(0, sat * (1 + rr.uniform(-ds, ds))))
    val = min(1, max(0, val * (1 + rr.uniform(-dv, dv))))
    r, g, b = colorsys.hsv_to_rgb(hue, sat, val)
    return hex_str(round(r * 255), round(g * 255), round(b * 255))


def shade(hexc: str, k: float) -> str:
    r, g, b = hex_parts(hexc)
    return hex_str(min(255, max(0, round(r * k))), min(255, max(0, round(g * k))), min(255, max(0, round(b * k))))


def mix_hex(a: str, b: str, t: float) -> str:
    ra, ga, ba = hex_parts(a)
    rb, gb, bb = hex_parts(b)
    return hex_str(round(ra + (rb - ra) * t), round(ga + (gb - ga) * t), round(ba + (bb - ba) * t))


def set_color(o: Obj, hexc: str) -> None:
    o.color = hex_rgb(hexc)


def no_shadow(objs: Obj | list[Obj]) -> None:
    for o in objs if isinstance(objs, list) else [objs]:
        o.visible_shadow = False


def seedvec(seed: int) -> Vector:
    rr = Rng(seed * 7919 + 17)
    return Vector((rr.uniform(-500, 500), rr.uniform(-500, 500), rr.uniform(-500, 500)))


def fbm(x: float, y: float, z: float, seed: int, octaves: int = 5) -> float:
    off = seedvec(seed)
    s, a, f = 0.0, 1.0, 1.0
    for i in range(octaves):
        s += a * noise.noise(Vector((x * f, y * f, z * f)) + off * (1 + 0.37 * i), noise_basis="PERLIN_ORIGINAL")
        a *= FBM_GAIN
        f *= FBM_LAC
    return s


def active() -> Obj:
    return bpy.context.object


def new_part(loc: Sequence[float] = (0, 0, 0), rot: float = 0.0, tilt: Vec2 = (0.0, 0.0)) -> Part:
    euler = Euler((math.radians(tilt[0]), math.radians(tilt[1]), math.radians(rot)), "XYZ")
    return Part(Matrix.Translation(Vector(loc)) @ euler.to_matrix().to_4x4(), [], Anchors())


def add(pt: Part, o: Obj) -> None:
    pt.objs.append(o)


def add_all(pt: Part, objs: list[Obj]) -> None:
    pt.objs.extend(objs)


def anchor(pt: Part, name: str, p: Sequence[float]) -> None:
    pt.anchors[name] = vec3(pt.xf @ Vector(p))


def done(pt: Part) -> tuple[list[Obj], Anchors]:
    bpy.context.view_layer.update()
    for o in pt.objs:
        if o.parent is None:
            o.matrix_world = pt.xf @ o.matrix_world
    return pt.objs, pt.anchors


def flat_slots(me: bpy.types.Mesh, flat: Sequence[int]) -> None:
    for p in me.polygons:
        if p.material_index in flat:
            p.use_smooth = False


def smooth_mesh(me: bpy.types.Mesh, opts: MeshOpts) -> None:
    if opts.get("smooth", True):
        me.shade_smooth()
        sharp = opts.get("sharp_deg", 40)
        if sharp:
            me.set_sharp_from_angle(angle=math.radians(sharp))
        flat_slots(me, opts.get("flat", ()))


def new_obj(name: str, me: bpy.types.Mesh, mats: MatArg) -> Obj:
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    for m in [mats] if isinstance(mats, bpy.types.Material) else mats:
        me.materials.append(m)
    return o


def mesh_obj(name: str, verts: Sequence[Vec3], faces: Faces, mats: MatArg, **opts: Unpack[MeshOpts]) -> Obj:
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    o = new_obj(name, me, mats)
    mat_index = opts.get("mat_index")
    if mat_index is not None:
        for p, i in zip(me.polygons, mat_index, strict=False):
            p.material_index = i
    smooth_mesh(me, opts)
    return o


def bm_obj(name: str, bm: bmesh.types.BMesh, mats: MatArg, **opts: Unpack[MeshOpts]) -> Obj:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    o = new_obj(name, me, mats)
    smooth_mesh(me, opts)
    return o


def lathe_rings(profile: Sequence[Vec2], seg: int, a0: float) -> tuple[list[Vec3], list[list[int]]]:
    verts: list[Vec3] = []
    rings: list[list[int]] = []
    for r, z in profile:
        if r < POLE_EPS:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
        else:
            rings.append(list(range(len(verts), len(verts) + seg)))
            verts += [(r * math.cos(a0 + TAU * k / seg), r * math.sin(a0 + TAU * k / seg), z) for k in range(seg)]
    return verts, rings


def lathe_data(
    profile: Sequence[Vec2], seg: int = 96, *, closed: bool = False, a0: float = 0.0
) -> tuple[list[Vec3], list[tuple[int, ...]]]:
    verts, rings = lathe_rings(profile, seg, a0)
    faces: list[tuple[int, ...]] = []
    pairs = list(pairwise(rings)) + ([(rings[-1], rings[0])] if closed else [])
    for ra, rb in pairs:
        if len(ra) == 1 and len(rb) == 1:
            continue
        for k in range(seg):
            k1 = (k + 1) % seg
            if len(ra) == 1:
                faces.append((ra[0], rb[k1], rb[k]))
            elif len(rb) == 1:
                faces.append((ra[k], ra[k1], rb[0]))
            else:
                faces.append((ra[k], ra[k1], rb[k1], rb[k]))
    return verts, faces


def lathe(
    profile: Sequence[Vec2],
    mat: Mat,
    seg: int = 96,
    loc: Vec3 = (0, 0, 0),
    name: str = "lathe",
    **opts: Unpack[LatheOpts],
) -> Obj:
    v, f = lathe_data(profile, seg, closed=opts.get("closed", False))
    v = [(x + loc[0], y + loc[1], z + loc[2]) for x, y, z in v]
    return mesh_obj(name, v, f, mat, smooth=opts.get("smooth", True), sharp_deg=opts.get("sharp_deg", 50))


def chaikin(pts: Pts, it: int = 3, *, keep_ends: bool = True) -> Pts:
    for _ in range(it):
        out: Pts = [pts[0]] if keep_ends else []
        for a, b in pairwise(pts):
            out.append((0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]))
            out.append((0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]))
        if keep_ends:
            out.append(pts[-1])
        pts = out
    return pts


def offset2d(pts: Pts, d: float) -> Pts:
    out: Pts = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, tz) or 1
        out.append((p[0] - tz / length * d, p[1] + tx / length * d))
    return out


def cyl(p0: Floats, p1: Floats, r: float, mat: Mat, seg: int = 48) -> Obj:
    return cylinder(vec3(Vector(p0)), vec3(Vector(p1)), r, mat, seg)


def box(size: Vec3, loc: Sequence[float], mat: Mat, bevel: float = 0.0, rot: Vec3 = (0, 0, 0)) -> Obj:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = active()
    o.name = "box"
    o.scale = size
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        md = o.modifiers.new("bev", "BEVEL")
        md.width = bevel
        md.segments = BEVEL_SEGMENTS
        md.limit_method = "ANGLE"
        md.harden_normals = False
        o.data.shade_smooth()
        o.data.set_sharp_from_angle(angle=math.radians(BEVEL_SHARP_DEG))
    o.data.materials.append(mat)
    return o


def sphere(loc: Sequence[float], r: float, mat: Mat, seg: int = 48) -> Obj:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = active()
    o.name = "sphere"
    o.data.shade_smooth()
    o.data.materials.append(mat)
    return o
