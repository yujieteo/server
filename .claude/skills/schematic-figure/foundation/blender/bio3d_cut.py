# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_cut.py
import math
from dataclasses import dataclass

import numpy as np
from bio3d_geo import box, rot_to, rot_z
from bio3d_types import Mesh, Point, Vec3


@dataclass(frozen=True)
class Cut:
    mode: str
    cz: float
    bound: float
    rot: np.ndarray


def cut_new(mode: str, az: float = -45.0, cz: float = 0.0, bound: float = 50.0) -> Cut:
    phi = math.radians(az + (90 if mode == "half" else 45))
    return Cut(mode, cz, bound, rot_z(phi))


def cut_lohi(cut: Cut, e: float = 0.0) -> tuple[Vec3, Vec3]:
    b = cut.bound
    if cut.mode == "octant":
        return (e, -b, cut.cz + e), (b, -e, b)
    if cut.mode == "quadrant":
        return (e, -b, -b), (b, -e, b)
    return (-b, -b, -b), (b, -e - cut.cz, b)


def cut_inside(cut: Cut, p: Point, margin: float = 0.0) -> bool:
    q = cut.rot.T @ np.asarray(p, float)
    lo, hi = cut_lohi(cut, -margin)
    return all(lo[k] <= q[k] <= hi[k] for k in range(3))


def cut_box(cut: Cut, e: float = 0.0) -> Mesh:
    verts, faces = box(*cut_lohi(cut, e))
    return verts @ cut.rot.T, faces


def cut_world(cut: Cut, q: Point) -> np.ndarray:
    return cut.rot @ np.asarray(q, float)


def cut_depth(cut: Cut, p: Point) -> float:
    q = cut.rot.T @ np.asarray(p, float)
    return min(q.item(0), -q.item(1)) + (q.item(2) - cut.cz if cut.mode == "octant" else 0)


def halfspace(co: Point, n: Point, eps: float = 0.0, bound: float = 40.0) -> Mesh:
    verts, faces = box((-bound, -bound, eps), (bound, bound, bound))
    return verts @ rot_to(n).T + np.asarray(co), faces
