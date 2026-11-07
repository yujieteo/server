# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_geo.py
import itertools
import math
from collections.abc import Sequence

import bmesh
import numpy as np
from bio3d_types import Mesh, MeshPart, Point, Rng, Rows, Vec3

UNIT_NORMAL_TOL = 0.9
AXIS_EPS = 1e-9
QUAD = 4
_CACHE: dict[tuple[str, int, int], Mesh] = {}


def int_rows(arr: np.ndarray) -> list[list[int]]:
    return [[int(i) for i in row] for row in arr.tolist()]


def fix(verts: np.ndarray, faces: np.ndarray) -> np.ndarray:
    bm = bmesh.new()
    vs = [bm.verts.new(tuple(v)) for v in verts.tolist()]
    for f in int_rows(faces):
        _ = bm.faces.new([vs[i] for i in f])
    bm.faces.ensure_lookup_table()
    _ = bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    out = np.array([[v.index for v in f.verts] for f in bm.faces])
    bm.free()
    return out


def ico(sub: int = 3) -> Mesh:
    tag = ("ico", sub, 0)
    if tag not in _CACHE:
        bm = bmesh.new()
        _ = bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        verts = np.array([v.co[:] for v in bm.verts])
        faces = np.array([[v.index for v in f.verts] for f in bm.faces])
        bm.free()
        _CACHE[tag] = (verts, fix(verts, faces))
    return _CACHE[tag]


def uv_verts(seg: int, rings: int) -> list[Vec3]:
    verts: list[Vec3] = [(0.0, 0.0, -1.0)]
    for i in range(1, rings):
        th = -math.pi / 2 + math.pi * i / rings
        for j in range(seg):
            ph = 2 * math.pi * j / seg
            verts.append((math.cos(th) * math.cos(ph), math.cos(th) * math.sin(ph), math.sin(th)))
    verts.append((0.0, 0.0, 1.0))
    return verts


def uv_faces(seg: int, rings: int, top: int) -> list[tuple[int, int, int]]:
    faces = [(0, 1 + (j + 1) % seg, 1 + j) for j in range(seg)]
    for i in range(rings - 2):
        a, b = 1 + i * seg, 1 + (i + 1) * seg
        for j in range(seg):
            j2 = (j + 1) % seg
            faces += [(a + j, a + j2, b + j2), (a + j, b + j2, b + j)]
    a = 1 + (rings - 2) * seg
    faces += [(a + j, a + (j + 1) % seg, top) for j in range(seg)]
    return faces


def uvsphere(seg: int = 20, rings: int = 12) -> Mesh:
    tag = ("uv", seg, rings)
    if tag not in _CACHE:
        verts = np.array(uv_verts(seg, rings))
        _CACHE[tag] = (verts, fix(verts, np.array(uv_faces(seg, rings, len(verts) - 1))))
    return _CACHE[tag]


def capsule(length: float, radius: float, seg: int = 20, rings: int = 12, bend: float = 0.0) -> Mesh:
    verts, faces = uvsphere(seg, rings | 1)
    verts = verts * radius
    verts[:, 2] += np.sign(verts[:, 2]) * length / 2
    if bend:
        h = length / 2 + radius
        verts[:, 0] += bend * (verts[:, 2] / h) ** 2
    return verts, faces


def tube_frames(pts: np.ndarray, n0: Point | None) -> tuple[np.ndarray, np.ndarray]:
    n = len(pts)
    tan = np.gradient(pts, axis=0)
    tan /= np.linalg.norm(tan, axis=1)[:, None]
    t0 = tan[0, :]
    if n0 is None:
        a = np.array([0, 0, 1.0]) if abs(t0[2]) < UNIT_NORMAL_TOL else np.array([1.0, 0, 0])
        n0 = np.cross(t0, a)
    nn = np.zeros_like(pts)
    v = np.asarray(n0, float) - np.dot(n0, t0) * t0
    nn[0] = v / np.linalg.norm(v)
    for i in range(1, n):
        prev = nn[i - 1, :]
        v = prev - np.dot(prev, tan[i, :]) * tan[i, :]
        nn[i] = v / np.linalg.norm(v)
    return nn, np.cross(tan, nn)


def tube_faces(n: int, sides: int) -> np.ndarray:
    i = np.arange(n - 1)[:, None] * sides
    j = np.arange(sides)[None, :]
    j2 = (j + 1) % sides
    a, b, c, d = (i + j), (i + j2), (i + sides + j2), (i + sides + j)
    return np.concatenate([np.stack([a, b, c], -1).reshape(-1, 3), np.stack([a, c, d], -1).reshape(-1, 3)])


def tube(points: Rows, radius: float | np.ndarray, sides: int = 10, flat: float = 1.0, n0: Point | None = None) -> Mesh:
    pts = np.asarray(points, float)
    n = len(pts)
    rad = np.broadcast_to(np.asarray(radius, float), (n,)).astype(float)
    nn, binorm = tube_frames(pts, n0)
    ang = 2 * np.pi * np.arange(sides) / sides
    ring = np.cos(ang)[None, :, None] * nn[:, None, :] + flat * np.sin(ang)[None, :, None] * binorm[:, None, :]
    verts = (pts[:, None, :] + rad[:, None, None] * ring).reshape(-1, 3)
    faces = tube_faces(n, sides)
    s0, s1 = len(verts), len(verts) + 1
    verts = np.vstack([verts, pts[0, :], pts[-1, :]])
    e = (n - 1) * sides
    cap0 = np.stack([np.full(sides, s0), (np.arange(sides) + 1) % sides, np.arange(sides)], -1)
    cap1 = np.stack([np.full(sides, s1), e + np.arange(sides), e + (np.arange(sides) + 1) % sides], -1)
    return verts, np.vstack([faces, cap0, cap1])


def box(lo: Point, hi: Point) -> Mesh:
    lo_a, hi_a = np.asarray(lo, float), np.asarray(hi, float)
    verts = np.array(
        [
            [lo_a[0] if i & 1 == 0 else hi_a[0], lo_a[1] if i & 2 == 0 else hi_a[1], lo_a[2] if i & 4 == 0 else hi_a[2]]
            for i in range(8)
        ],
    )
    faces = np.array([[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]])
    return verts, faces


def lathe_rings(profile: Sequence[tuple[float, float]], segs: int) -> tuple[list[Vec3], list[list[int]]]:
    ca = np.cos(2 * np.pi * np.arange(segs) / segs)
    sa = np.sin(2 * np.pi * np.arange(segs) / segs)
    verts: list[Vec3] = []
    rings: list[list[int]] = []
    for r, z in profile:
        if r < AXIS_EPS:
            rings.append([len(verts)])
            verts.append((0.0, 0.0, z))
        else:
            rings.append(list(range(len(verts), len(verts) + segs)))
            verts += [(r * ca.item(k), r * sa.item(k), z) for k in range(segs)]
    return verts, rings


def lathe(profile: Sequence[tuple[float, float]], segs: int = 72) -> Mesh:
    verts, rings = lathe_rings(profile, segs)
    faces: list[tuple[int, int, int]] = []
    pairs = [*itertools.pairwise(rings), (rings[-1], rings[0])]
    for a, b in pairs:
        if len(a) == 1 and len(b) == 1:
            continue
        for j in range(segs):
            j2 = (j + 1) % segs
            if len(a) == 1:
                faces.append((a[0], b[j], b[j2]))
            elif len(b) == 1:
                faces.append((a[j], a[j2], b[0]))
            else:
                faces += [(a[j], a[j2], b[j2]), (a[j], b[j2], b[j])]
    return np.array(verts), np.array(faces)


def rot_to(direction: Point, twist: float = 0.0) -> np.ndarray:
    d = np.asarray(direction, float)
    d = d / np.linalg.norm(d)
    a = np.array([1.0, 0, 0]) if abs(d[0]) < UNIT_NORMAL_TOL else np.array([0, 1.0, 0])
    x = np.cross(a, d)
    x /= np.linalg.norm(x)
    y = np.cross(d, x)
    c, s = math.cos(twist), math.sin(twist)
    return np.column_stack([c * x + s * y, -s * x + c * y, d])


def rot_y(angle: float) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(phi: float) -> np.ndarray:
    c, s = math.cos(phi), math.sin(phi)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1.0]])


def inst(verts: np.ndarray, faces: np.ndarray, mats: Rows, trans: Rows) -> Mesh:
    mm = np.asarray(mats, float)
    tt = np.asarray(trans, float)
    k = len(verts)
    vv = np.einsum("nij,kj->nki", mm, verts) + tt[:, None, :]
    ff = faces[None, :, :] + (np.arange(len(tt)) * k)[:, None, None]
    return vv.reshape(-1, 3), ff.reshape(-1, faces.shape[1])


def cat(parts: Sequence[MeshPart]) -> Mesh:
    vs: list[np.ndarray] = []
    fs: list[np.ndarray] = []
    off = 0
    for verts, faces in parts:
        vs.append(np.asarray(verts))
        fs.append(np.asarray(faces) + off)
        off += len(verts)
    if not vs:
        return np.zeros((0, 3)), np.zeros((0, 3), int)
    return np.vstack(vs), np.vstack(fs)


def shift(arr: np.ndarray, dx: float, dy: float, dz: float) -> np.ndarray:
    return arr + np.array([dx, dy, dz])


def tri(faces: np.ndarray) -> np.ndarray:
    if faces.shape[1] == QUAD - 1:
        return faces
    return np.vstack([faces[:, [0, 1, 2]], faces[:, [0, 2, 3]]])


def unit_gauss(rng: Rng) -> np.ndarray:
    u = np.array([rng.gauss(0, 1) for _ in range(3)])
    return u / np.linalg.norm(u)


def blob_mesh(rng: Rng, n: int = 8, r: float = 0.4, elong: Vec3 = (1, 1, 1), sub: int = 2) -> Mesh:
    centers = [np.zeros(3)]
    radii = [r]
    for _ in range(n - 1):
        j = rng.randrange(len(centers))
        u = np.array([rng.gauss(0, 1) for _ in range(3)])
        u /= np.linalg.norm(u)
        rr = r * rng.uniform(0.6, 1.0)
        centers.append(centers[j] + u * 0.75 * (radii[j] + rr) * 0.8)
        radii.append(rr)
    cen = np.array(centers)
    cen -= cen.mean(0)
    cen *= np.asarray(elong)
    vs, fs = ico(sub)
    return cat([(vs * rr + cen[k, :], fs) for k, rr in enumerate(radii)])


def fib(n: int, rng: Rng | None = None, jitter: float = 0.0) -> np.ndarray:
    i = np.arange(n) + 0.5
    phi = np.arccos(1 - 2 * i / n)
    th = np.pi * (1 + 5**0.5) * i
    pts = np.stack([np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)], -1)
    if rng is not None and jitter > 0:
        pts = pts + np.array([[rng.gauss(0, jitter) for _ in range(3)] for _ in range(n)])
        pts /= np.linalg.norm(pts, axis=1)[:, None]
    return pts


def az_dir(az: float, el: float = 0.0) -> np.ndarray:
    a, e = math.radians(az), math.radians(el)
    return np.array([math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)])


def hex_parts(h: str) -> list[int]:
    s = h.lstrip("#")
    return [int(s[i : i + 2], 16) for i in (0, 2, 4)]


def shade(h: str, f: float) -> str:
    return "#" + "".join(f"{max(0, min(255, round(v * f))):02x}" for v in hex_parts(h))


def mix(h1: str, h2: str, t: float) -> str:
    a, b = hex_parts(h1), hex_parts(h2)
    return "#" + "".join(f"{round(a[k] * (1 - t) + b[k] * t):02x}" for k in range(3))
