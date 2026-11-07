# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_mesh.py
import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field

import bmesh
import bpy
import numpy as np
from device3d_types import Anchors, Face, Faces, PtLike, Tpl, Vec3
from mathutils import Matrix, Vector

TAU = 2 * math.pi
EDGE_FACES = 2
FRAME_EPS = 1e-12
MERGE_DIST = 1e-6
MATRIX_SIZE = 3


@dataclass(frozen=True)
class MeshOpts:
    smooth: bool = True
    sharp: float | None = None
    merge: bool = False


SMOOTH = MeshOpts()


@dataclass
class Buf:
    v: list[Vec3] = field(default_factory=list)
    f: list[Face] = field(default_factory=list)


def buf_add(buf: Buf, verts: Iterable[PtLike], faces: Iterable[Face]) -> None:
    offset = len(buf.v)
    buf.v.extend([(float(p[0]), float(p[1]), float(p[2])) for p in verts])
    buf.f.extend([tuple(i + offset for i in face) for face in faces])


def buf_obj(buf: Buf, name: str, mat: bpy.types.Material | None, opts: MeshOpts = SMOOTH) -> bpy.types.Object | None:
    if not buf.f:
        return None
    return make_object(name, buf.v, buf.f, mat, opts)


def buf_solid(buf: Buf, name: str, mat: bpy.types.Material | None, opts: MeshOpts = SMOOTH) -> bpy.types.Object:
    return make_object(name, buf.v, buf.f, mat, opts)


def clean_mesh(me: bpy.types.Mesh, opts: MeshOpts) -> None:
    bm = bmesh.new()
    bm.from_mesh(me)
    if opts.merge:
        _ = bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=MERGE_DIST)
    _ = bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if opts.sharp:
        for edge in bm.edges:
            if len(edge.link_faces) == EDGE_FACES and edge.calc_face_angle(0) > math.radians(opts.sharp):
                edge.smooth = False
    bm.to_mesh(me)
    bm.free()


def make_object(
    name: str,
    verts: Iterable[PtLike],
    faces: Iterable[Face],
    mat: bpy.types.Material | None,
    opts: MeshOpts = SMOOTH,
) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    me.from_pydata([(float(v[0]), float(v[1]), float(v[2])) for v in verts], [], [tuple(f) for f in faces])
    if opts.merge or opts.sharp:
        clean_mesh(me, opts)
    me.update()
    if opts.smooth:
        me.shade_smooth()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        me.materials.append(mat)
    return obj


def add_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> bpy.types.Modifier:
    md = obj.modifiers.new("bev", "BEVEL")
    md.width = width
    md.segments = segments
    md.limit_method = "ANGLE"
    md.harden_normals = True
    md.use_clamp_overlap = True
    return md


def sphere_verts(seg: int, rings: int) -> list[Vec3]:
    verts: list[Vec3] = [(0, 0, 1)]
    for i in range(1, rings):
        t = math.pi * i / rings
        verts += [
            (math.sin(t) * math.cos(TAU * j / seg), math.sin(t) * math.sin(TAU * j / seg), math.cos(t))
            for j in range(seg)
        ]
    verts.append((0, 0, -1))
    return verts


def sphere_faces(seg: int, rings: int, last: int) -> Faces:
    faces: Faces = []
    for j in range(seg):
        faces.append((0, 1 + j, 1 + (j + 1) % seg))
    for i in range(rings - 2):
        a, b = 1 + i * seg, 1 + (i + 1) * seg
        for j in range(seg):
            faces.append((a + j, b + j, b + (j + 1) % seg, a + (j + 1) % seg))
    a = 1 + (rings - 2) * seg
    for j in range(seg):
        faces.append((a + j, last, a + (j + 1) % seg))
    return faces


def sphere_tpl(seg: int = 24, rings: int = 14) -> Tpl:
    verts = sphere_verts(seg, rings)
    return np.array(verts, float), sphere_faces(seg, rings, len(verts) - 1)


def ico_tpl(sub: int = 3) -> Tpl:
    bm = bmesh.new()
    _ = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    verts = np.array([[v.co.x, v.co.y, v.co.z] for v in bm.verts])
    faces: Faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    bm.free()
    return verts / np.linalg.norm(verts, axis=1).reshape(-1, 1), faces


def cyl_tpl(seg: int = 16, *, caps: bool = True) -> Tpl:
    verts = [(math.cos(TAU * j / seg), math.sin(TAU * j / seg), z) for z in (0.0, 1.0) for j in range(seg)]
    faces: Faces = [(j, (j + 1) % seg, seg + (j + 1) % seg, seg + j) for j in range(seg)]
    if caps:
        faces += [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))]
    return np.array(verts, float), faces


def mat3(m: Matrix) -> np.ndarray:
    return np.array([[m[r][c] for c in range(MATRIX_SIZE)] for r in range(MATRIX_SIZE)])


def frame(p0: PtLike, p1: PtLike) -> tuple[np.ndarray, float]:
    d = np.asarray(p1, float) - np.asarray(p0, float)
    length = float(np.linalg.norm(d))
    u = d / (length + FRAME_EPS)
    q = Vector((float(u[0]), float(u[1]), float(u[2]))).to_track_quat("Z", "Y")
    return mat3(q.to_matrix()), length


def add_cyl(buf: Buf, p0: PtLike, p1: PtLike, r0: float, tpl: Tpl | None = None) -> None:
    verts, faces = tpl or cyl_tpl()
    rot, length = frame(p0, p1)
    local = np.stack([verts[:, 0] * r0, verts[:, 1] * r0, verts[:, 2] * length], 1)
    buf_add(buf, local @ rot.T + np.asarray(p0, float), faces)


def add_sphere(
    buf: Buf,
    c: PtLike,
    r: float,
    tpl: Tpl | None = None,
    scale: Sequence[float] = (1, 1, 1),
) -> None:
    verts, faces = tpl or sphere_tpl()
    buf_add(buf, verts * r * np.asarray(scale) + np.asarray(c, float), faces)


def with_prefix(prefix: str, anchors: Mapping[str, PtLike]) -> Anchors:
    return {prefix + k: (float(v[0]), float(v[1]), float(v[2])) for k, v in anchors.items()}
