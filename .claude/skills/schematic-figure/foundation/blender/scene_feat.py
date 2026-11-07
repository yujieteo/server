# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_feat.py
import contextlib
import math
from collections.abc import Sequence

import numpy as np
from bpy.types import Depsgraph, Mesh, Object, Scene
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

MESH_ERRORS = (RuntimeError, AttributeError, ValueError, TypeError, IndexError, KeyError)
CORNERS = 8
MIN_EDGE_USE = 2
FRAME_LO = -0.5
FRAME_HI = 1.5


def _screen_area(sc: Scene, wc: Sequence[Vector]) -> float | None:
    pts = [world_to_camera_view(sc, sc.camera, c) for c in wc]
    if all(p.z <= 0 for p in pts):
        return None
    rx, ry = sc.render.resolution_x, sc.render.resolution_y
    xs = [min(max(p.x, FRAME_LO), FRAME_HI) * rx for p in pts]
    ys = [min(max(p.y, FRAME_LO), FRAME_HI) * ry for p in pts]
    return max(1.0, (max(xs) - min(xs)) * (max(ys) - min(ys)))


def _triangle_corners(o: Object, me: Mesh) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    me.calc_loop_triangles()
    tv = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", tv)
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get("co", co)
    mw = np.array(o.matrix_world)
    co = co.reshape(-1, 3) @ mw[:3, :3].T + mw[:3, 3]
    idx = tv.reshape(-1, 3)
    return co[idx[:, 0]], co[idx[:, 1]], co[idx[:, 2]]


def _pixels_per_unit(sc: Scene, wc: Sequence[Vector]) -> float:
    ctr = sum(wc, Vector()) / CORNERS
    right = sc.camera.matrix_world.to_3x3() @ Vector((1, 0, 0))
    p0 = world_to_camera_view(sc, sc.camera, ctr)
    p1 = world_to_camera_view(sc, sc.camera, ctr + right)
    return abs(p1.x - p0.x) * sc.render.resolution_x


def _thickness(o: Object, sc: Scene, me: Mesh, wc: Sequence[Vector]) -> float | None:
    nl = len(me.loops)
    if not nl or not len(me.polygons):
        return None
    ei = np.empty(nl, np.int32)
    me.loops.foreach_get("edge_index", ei)
    if np.bincount(ei, minlength=len(me.edges)).min() < MIN_EDGE_USE:
        return None
    a, b, c = _triangle_corners(o, me)
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum()
    volume = abs((a * np.cross(b, c)).sum()) / 6.0
    if area <= 0:
        return None
    return 4 * volume / area * _pixels_per_unit(sc, wc)


def _mesh_feature(o: Object, sc: Scene, dg: Depsgraph, wc: Sequence[Vector], area: float) -> float:
    oe = o.evaluated_get(dg)
    me = oe.to_mesh()
    try:
        chi = len(me.vertices) - len(me.edges) + len(me.polygons)
        feat = math.sqrt(area / max(1, abs(chi) // 2))
        thick = None
        with contextlib.suppress(*MESH_ERRORS):
            thick = _thickness(o, sc, me, wc)
    finally:
        oe.to_mesh_clear()
    return feat if thick is None else min(feat, thick)


def feature_px(o: Object, sc: Scene, dg: Depsgraph) -> float:
    wc = [o.matrix_world @ Vector(c) for c in o.bound_box]
    area = _screen_area(sc, wc)
    if area is None:
        return 0.0
    feat = math.sqrt(area)
    with contextlib.suppress(*MESH_ERRORS):
        feat = _mesh_feature(o, sc, dg, wc, area)
    return feat
