# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_obj.py
import math
from collections.abc import Sequence
from dataclasses import dataclass, field

import bmesh
import bpy
import numpy as np
from bio3d_geo import ico, int_rows
from bio3d_types import NO_ROT, ORIGIN, Anchors, Mesh, MeshOpts, Point, Rng, Vec3
from mathutils import Euler, Matrix, Vector, noise


@dataclass
class Group:
    root: bpy.types.Object
    matrix: Matrix
    anchors: Anchors = field(default_factory=dict)


@dataclass(frozen=True)
class Radial:
    off1: Vector
    off2: Vector
    wobble: float
    freq: float


def group_new(name: str, loc: Vec3 = ORIGIN, rot: Vec3 = NO_ROT, scale: float = 1.0) -> Group:
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    quat = Euler([math.radians(v) for v in rot]).to_quaternion()
    matrix = Matrix.LocRotScale(Vector(loc), quat, Vector((scale,) * 3))
    root.matrix_world = matrix
    return Group(root, matrix)


def vec(p: Point) -> Vector:
    a = np.asarray(p, float)
    return Vector((a.item(0), a.item(1), a.item(2)))


def anchor(g: Group, name: str, p: Point) -> None:
    w = g.matrix @ vec(p)
    g.anchors[name] = (round(w[0], 5), round(w[1], 5), round(w[2], 5))


def done(g: Group) -> tuple[bpy.types.Object, Anchors]:
    return g.root, g.anchors


def build_obj(
    g: Group,
    name: str,
    data: tuple[list[list[float]], list[list[int]]],
    mats: Sequence[bpy.types.Material],
    opts: MeshOpts,
) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata(data[0], [], data[1])
    if opts.recalc:
        bm = bmesh.new()
        bm.from_mesh(me)
        _ = bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
    if opts.face_mat is not None:
        me.polygons.foreach_set("material_index", np.asarray(opts.face_mat, np.int32))
    for nm, vals in (("rand", opts.rand), ("rand2", opts.rand2)):
        if vals is not None:
            at = me.attributes.new(nm, "FLOAT", "FACE")
            at.data.foreach_set("value", np.asarray(vals, np.float32))
    if opts.smooth:
        me.shade_smooth()
    for m in mats:
        me.materials.append(m)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.parent = g.root
    return o


def add_obj(
    g: Group,
    name: str,
    mesh: Mesh,
    mats: Sequence[bpy.types.Material],
    opts: MeshOpts | None = None,
) -> bpy.types.Object:
    data = (np.asarray(mesh[0], float).tolist(), int_rows(mesh[1]))
    return build_obj(g, name, data, mats, opts or MeshOpts())


def add_poly(
    g: Group,
    name: str,
    mesh: tuple[np.ndarray, list[list[int]]],
    mats: Sequence[bpy.types.Material],
    opts: MeshOpts | None = None,
) -> bpy.types.Object:
    return build_obj(g, name, (np.asarray(mesh[0], float).tolist(), mesh[1]), mats, opts or MeshOpts())


def cutter(g: Group, mesh: Mesh, mat: bpy.types.Material, name: str = "cutter") -> bpy.types.Object:
    o = add_obj(g, name, mesh, [mat], MeshOpts(smooth=False))
    o.hide_render = True
    o.display_type = "WIRE"
    return o


def boolean(target: bpy.types.Object, cut_obj: bpy.types.Object, op: str = "DIFFERENCE") -> None:
    md = target.modifiers.new("cut", "BOOLEAN")
    md.operation = op
    md.solver = "EXACT"
    md.object = cut_obj
    md.material_mode = "TRANSFER"


def smooth_mods(o: bpy.types.Object, bevel: float = 0.0, segs: int = 1, levels: int = 2, angle: float = 40) -> None:
    if bevel > 0:
        b = o.modifiers.new("bev", "BEVEL")
        b.width = bevel
        b.segments = segs
        b.limit_method = "ANGLE"
        b.angle_limit = math.radians(angle)
    if levels:
        s = o.modifiers.new("sub", "SUBSURF")
        s.levels = min(1, levels)
        s.render_levels = levels


def organic(o: bpy.types.Object, voxel: float, smooth: float = 0.5, iters: int = 5) -> None:
    md = o.modifiers.new("remesh", "REMESH")
    md.mode = "VOXEL"
    md.voxel_size = voxel
    md.use_smooth_shade = True
    sm = o.modifiers.new("smooth", "SMOOTH")
    sm.factor = smooth
    sm.iterations = iters


def make_radial(seed: int, wobble: float, freq: float = 1.7) -> Radial:
    rng = Rng(seed)
    o1 = Vector([rng.uniform(-60, 60) for _ in range(3)])
    o2 = Vector([rng.uniform(-60, 60) for _ in range(3)])
    return Radial(o1, o2, wobble, freq)


def radial_at(r: Radial, u: Point) -> float:
    v = vec(u)
    return 1.0 + r.wobble * (noise.noise(v * r.freq + r.off1) + 0.45 * noise.noise(v * r.freq * 2.6 + r.off2))


def wobbly(sub: int, radius: float, shape: Point, rad: Radial) -> tuple[np.ndarray, np.ndarray, Radial]:
    verts, faces = ico(sub)
    fac = np.array([radial_at(rad, v) for v in verts.tolist()])
    return verts * fac[:, None] * np.asarray(shape) * radius, faces, rad
