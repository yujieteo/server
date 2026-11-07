# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_base.py
import math
from collections.abc import Sequence
from itertools import pairwise
from typing import TypedDict, Unpack

import bmesh
import bpy
from bpy.types import Material, Object
from mathutils import Vector
from scene_color import Rgba, Vec3, hex_rgb

Vec2 = Sequence[float]
Polyline = Sequence[Vec2]
TAU = 2 * math.pi


class ConeOpts(TypedDict, total=False):
    color: str
    alpha: float


class LensOpts(TypedDict, total=False):
    axis: str
    mat: Material | None


class ChipOpts(TypedDict, total=False):
    top: str
    substrate: str
    waveguides: Sequence[Polyline]
    wg_color: str
    wg_radius: float


class PixelOpts(TypedDict, total=False):
    values: Sequence[Sequence[float]] | None
    height: float
    lo: str
    hi: str


def mat(name: str, **kw: float | Rgba) -> Material:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    for k, v in kw.items():
        b.inputs[k].default_value = v
    return m


def plastic(color: str, rough: float = 0.35, coat: float = 0.6) -> Material:
    return mat("plastic", **{"Base Color": hex_rgb(color), "Roughness": rough, "Coat Weight": coat})


def metal(color: str = "#b8bec6", rough: float = 0.25) -> Material:
    return mat("metal", **{"Base Color": hex_rgb(color), "Metallic": 1.0, "Roughness": rough})


def glass(color: str = "#e6f2fa", ior: float = 1.5) -> Material:
    return mat(
        "glass",
        **{"Base Color": hex_rgb(color), "Roughness": 0.0, "Transmission Weight": 1.0, "IOR": ior},
    )


def emission(color: str = "#e8322b", strength: float = 1.0) -> Material:
    return mat(
        "emit",
        **{"Base Color": hex_rgb(color), "Emission Color": hex_rgb(color), "Emission Strength": strength},
    )


def obj() -> Object:
    o = bpy.context.object
    bpy.ops.object.shade_smooth()
    return o


def _aim(o: Object, d: Vector) -> None:
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.to_track_quat("Z", "Y")


def cylinder(p0: Vec3, p1: Vec3, radius: float, mat: Material, vertices: int = 96) -> Object:
    a, b = Vector(p0), Vector(p1)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=d.length, location=(a + b) / 2)
    o = obj()
    _aim(o, d)
    o.data.materials.append(mat)
    return o


def beam(points: Sequence[Vec3], radius: float = 0.05, color: str = "#e8322b", strength: float = 1.0) -> list[Object]:
    m = emission(color, strength)
    return [cylinder(points[i], points[i + 1], radius, m, 32) for i in range(len(points) - 1)]


def cone(p0: Vec3, p1: Vec3, r0: float, r1: float, **o: Unpack[ConeOpts]) -> Object:
    a, b = Vector(p0), Vector(p1)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    ob = obj()
    _aim(ob, d)
    color = hex_rgb(o.get("color", "#e8322b"))
    m = mat(
        "cone",
        **{"Base Color": color, "Emission Color": color, "Emission Strength": 0.6, "Alpha": o.get("alpha", 0.35)},
    )
    ob.data.materials.append(m)
    return ob


def fiber_path(
    points: Sequence[Vec3], radius: float = 0.12, mat: Material | None = None, resolution: int = 24
) -> Object:
    cu = bpy.data.curves.new("fib", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 8
    cu.resolution_u = resolution
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points, strict=False):
        bp.co = p
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    o = bpy.data.objects.new("fiber", cu)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat or plastic("#f0c36a"))
    return o


def _axis_scale(axis: str, s: float) -> Vec3:
    if axis == "x":
        return (s, 1, 1)
    return (1, s, 1) if axis == "y" else (1, 1, s)


def lens(
    x: float = 0.0,
    y: float = 0.0,
    z: float = 0.0,
    radius: float = 0.9,
    thickness: float = 0.25,
    **o: Unpack[LensOpts],
) -> Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=radius, location=(x, y, z))
    ob = obj()
    ob.scale = _axis_scale(o.get("axis", "x"), thickness / (2 * radius) * 2.2)
    ob.data.materials.append(o.get("mat") or glass())
    return ob


def box(size: Vec3, loc: Vec3, mat: Material, bevel: float = 0.02) -> Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    if bevel:
        md = o.modifiers.new("bev", "BEVEL")
        md.width = bevel
        md.segments = 3
    o.data.materials.append(mat)
    return o


def chip(size: Vec3 = (4, 2.4, 0.25), loc: Vec3 = (0, 0, 0), **o: Unpack[ChipOpts]) -> None:
    sx, sy, sz = size
    top, substrate = o.get("top", "#eef1f5"), o.get("substrate", "#d9d4c9")
    wg_radius = o.get("wg_radius", 0.025)
    _ = box((sx, sy, sz * 0.7), (loc[0], loc[1], loc[2] - sz * 0.15), plastic(substrate, 0.6, 0.1))
    _ = box((sx, sy, sz * 0.3), (loc[0], loc[1], loc[2] + sz * 0.35), plastic(top, 0.4, 0.3))
    ztop = loc[2] + sz * 0.5 + wg_radius
    m = emission(o.get("wg_color", "#0072B2"), 0.8)
    for wg in o.get("waveguides", ()):
        _ = fiber_path([(loc[0] + u, loc[1] + v, ztop) for u, v in wg], radius=wg_radius, mat=m)


def _mix_rgba(lo: Rgba, hi: Rgba, t: float) -> Rgba:
    return (
        lo[0] * (1 - t) + hi[0] * t,
        lo[1] * (1 - t) + hi[1] * t,
        lo[2] * (1 - t) + hi[2] * t,
        1.0,
    )


def pixel_array(n: int = 8, m: int = 8, pitch: float = 0.2, loc: Vec3 = (0, 0, 0), **o: Unpack[PixelOpts]) -> None:
    lo_c, hi_c = hex_rgb(o.get("lo", "#1b2a41")), hex_rgb(o.get("hi", "#e8eef7"))
    values, height = o.get("values"), o.get("height", 0.04)
    for i in range(n):
        for j in range(m):
            t = values[i][j] if values else 0.5 + 0.5 * math.sin(i * 1.3 + j * 0.7)
            px = mat("px", **{"Base Color": _mix_rgba(lo_c, hi_c, t), "Roughness": 0.3})
            pos = (loc[0] + (i - n / 2 + 0.5) * pitch, loc[1] + (j - m / 2 + 0.5) * pitch, loc[2])
            _ = box((pitch * 0.9, pitch * 0.9, height), pos, px, bevel=0)


def camera_look(
    loc: Vec3 = (0, -9, 5),
    target: Vec3 = (0, 0, 0),
    lens_mm: float = 50,
    ortho: float | None = None,
) -> Object:
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.object
    bpy.context.scene.camera = cam
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    if ortho:
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = ortho
    else:
        cam.data.lens = lens_mm
    return cam


def camera_oblique(
    target: Vec3 = (0, 0, 0),
    scale: float = 6.0,
    elev: float = 20.0,
    azim: float = 0.0,
    dist: float = 40.0,
) -> tuple[Object, float]:
    e, a = math.radians(elev), math.radians(azim)
    off = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    loc = Vector(target) + off
    cam = camera_look(loc=tuple(loc), target=target, ortho=scale)
    bpy.context.view_layer.update()
    rot = cam.matrix_world.to_3x3()
    x_axis = Vector((1, 0, 0))
    tilt = math.degrees(math.atan2(x_axis.dot(rot @ Vector((0, 1, 0))), x_axis.dot(rot @ Vector((1, 0, 0)))))
    return cam, tilt


def soft_lights(
    key: float = 250,
    fill: float = 80,
    rim: float = 120,
    shadows: Sequence[str] = ("key",),
) -> None:
    rig = (("key", (-3, -4, 6), key, 5), ("fill", (5, -3, 2), fill, 6), ("rim", (0, 5, 5), rim, 4))
    for name, loc, energy, size in rig:
        bpy.ops.object.light_add(type="AREA", location=loc)
        light = bpy.context.object
        light.data.energy = energy
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        light.data.use_shadow = name in shadows


def shadow_floor(z: float = 0.0, size: float = 40.0) -> Object:
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    o = bpy.context.object
    o.is_shadow_catcher = True
    o.data.materials.append(mat("catcher", **{"Base Color": (1, 1, 1, 1), "Roughness": 1.0}))
    return o


def torus(
    loc: Vec3 = (0, 0, 0),
    major: float = 2.0,
    minor: float = 0.08,
    mat: Material | None = None,
    rot: Vec3 = (0, 0, 0),
) -> Object:
    bpy.ops.mesh.primitive_torus_add(
        location=loc,
        rotation=rot,
        major_radius=major,
        minor_radius=minor,
        major_segments=192,
        minor_segments=24,
    )
    o = obj()
    o.data.materials.append(mat or plastic("#8fcbe8", 0.25, 0.6))
    return o


def _gauss_profile(height: float, sigma: float, rings: int) -> list[tuple[float, float]]:
    radii = [sigma * 3.2 * i / rings for i in range(rings + 1)]
    return [(r, height * math.exp(-(r**2) / (2 * sigma**2))) for r in radii]


def _gauss_faces(bm: bmesh.BMesh, loc: Vec3, prof: list[tuple[float, float]], segments: int) -> None:
    rings: list[list[bmesh.BMVert]] = []
    for r, h in prof:
        angles = [TAU * k / segments for k in range(segments)]
        rings.append([bm.verts.new((loc[0] + r * math.cos(t), loc[1] + r * math.sin(t), loc[2] + h)) for t in angles])
    for a, b in pairwise(rings):
        for k in range(segments):
            nxt = (k + 1) % segments
            _ = bm.faces.new((a[k], a[nxt], b[nxt], b[k]))


def gaussian_solid(
    loc: Vec3 = (0, 0, 0),
    height: float = 0.6,
    sigma: float = 0.15,
    mat: Material | None = None,
    segments: int = 64,
) -> Object:
    me = bpy.data.meshes.new("gauss")
    bm = bmesh.new()
    _gauss_faces(bm, loc, _gauss_profile(height, sigma, 24), segments)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new("gauss", me)
    bpy.context.collection.objects.link(o)
    for poly in me.polygons:
        poly.use_smooth = True
    o.data.materials.append(mat or plastic("#e8603c", 0.3, 0.5))
    return o
