# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_air.py
import math
from typing import TypedDict, Unpack

import bmesh
from apparatus3d_core import (
    Anchors,
    Arc,
    Built,
    Mat,
    Part,
    Rng,
    Vec3,
    add,
    anchor,
    bm_obj,
    done,
    mesh_obj,
    new_part,
    seedvec,
    shade,
)
from apparatus3d_nodes import ncoord, new_graph, nmap, nmath, nmix, nnew, nparams, nput, nramp, nxyz
from mathutils import Matrix, Vector, noise

Band = tuple[float, str, str, str]
Blob = tuple[float, float, float, float]
Grid2 = dict[tuple[int, int], int]
DEFAULT_BANDS: list[Band] = [
    (0.9, "#cfe6f6", "#b7d8f1", "troposphere"),
    (0.8, "#a9cdef", "#8fb9e6", "stratosphere"),
    (0.7, "#86acdf", "#6f93d0", "mesosphere"),
    (0.9, "#6585c6", "#3e4f99", "thermosphere"),
]
ARC_COLS, ARC_ROWS = 160, 24


class AtmosOpts(TypedDict, total=False):
    arc_deg: float
    depth: float
    layers: list[Band] | None
    ground: tuple[float, str]
    grass: str
    rot: float


class CloudOpts(TypedDict, total=False):
    seed: int
    puffs: int
    flat_base: bool
    color: str
    shade: str
    rot: float


def arc_ground(anchors: Anchors, x: float, y: float) -> float:
    arc = anchors.arc
    if arc is None:
        msg = "anchors carry no arc"
        raise ValueError(msg)
    p = arc.inv @ Vector((x, y, 0))
    return (arc.xf @ Vector((0, 0, math.sqrt(max(arc.radius**2 - p.x**2, 0)) - arc.radius))).z


def arc_mesh(
    radius: float, rr: tuple[float, float], ang: tuple[float, float], depth: float
) -> tuple[list[Vec3], list[tuple[int, ...]]]:
    verts: list[Vec3] = []
    front: Grid2 = {}
    back: Grid2 = {}
    r0, r1 = rr
    for i in range(ARC_ROWS + 1):
        r = r0 + (r1 - r0) * i / ARC_ROWS
        for j in range(ARC_COLS + 1):
            a = ang[0] + (ang[1] - ang[0]) * j / ARC_COLS
            for y, tab in ((-depth / 2, front), (depth / 2, back)):
                tab[i, j] = len(verts)
                verts.append((r * math.cos(a), y, r * math.sin(a) - radius))
    return verts, arc_faces(front, back)


def arc_faces(f: Grid2, b: Grid2) -> list[tuple[int, ...]]:
    nr, na = ARC_ROWS, ARC_COLS
    faces: list[tuple[int, ...]] = []
    for i in range(nr):
        for j in range(na):
            faces.append((f[i, j], f[i + 1, j], f[i + 1, j + 1], f[i, j + 1]))
            faces.append((b[i, j], b[i, j + 1], b[i + 1, j + 1], b[i + 1, j]))
    for j in range(na):
        faces.append((f[nr, j], b[nr, j], b[nr, j + 1], f[nr, j + 1]))
        faces.append((f[0, j], f[0, j + 1], b[0, j + 1], b[0, j]))
    for i in range(nr):
        faces.append((f[i, 0], b[i, 0], b[i + 1, 0], f[i + 1, 0]))
        faces.append((f[i, na], f[i + 1, na], b[i + 1, na], b[i, na]))
    return faces


def atmos_mat(radius: float, rr: tuple[float, float], bands: list[Band], ground: tuple[float, str], grass: str) -> Mat:
    r0, r1 = rr
    g0, gcol = ground
    g = new_graph("atmos")
    nparams(g, Roughness=0.9)
    sp = nxyz(g, ncoord(g))
    cx = nnew(g, "ShaderNodeCombineXYZ")
    nput(g, cx.inputs[0], sp[0])
    nput(g, cx.inputs[2], nmath(g, "ADD", sp[2], radius))
    ln = nnew(g, "ShaderNodeVectorMath", operation="LENGTH")
    nput(g, ln.inputs[0], cx.outputs[0])
    t = nmap(g, ln.outputs["Value"], (r0, r1))
    span = r1 - r0
    stops = [(0.0, shade(gcol, 1.05)), ((g0 - 0.004) / span, shade(gcol, 0.85)), ((g0 - 0.003) / span, grass)]
    stops.append((g0 / span, grass))
    rb = radius
    for th, cb, ct, _ in bands:
        stops += [((rb - r0) / span + 0.0005, cb), ((rb + th - r0) / span - 0.0015, ct)]
        rb += th
    nput(g, g.bsdf.inputs["Base Color"], nramp(g, t, stops, "LINEAR"))
    return g.m


def atmos_anchors(pt: Part, radius: float, depth: float, bands: list[Band]) -> None:
    rb = radius
    for th, _, _, nm in bands:
        anchor(pt, nm, (0, -depth / 2, rb + th / 2 - radius))
        anchor(pt, nm + "_top", (0, -depth / 2, rb + th - radius))
        rb += th


def atmosphere_layers(loc: Vec3 = (0, 0, 0), radius: float = 14.0, **kw: Unpack[AtmosOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    bands = kw.get("layers") or DEFAULT_BANDS
    ground = kw.get("ground", (0.35, "#7c5f48"))
    depth, arc_deg = kw.get("depth", 1.2), kw.get("arc_deg", 26.0)
    rr = (radius - ground[0], radius + sum(b[0] for b in bands))
    ang = (math.radians(90 - arc_deg / 2), math.radians(90 + arc_deg / 2))
    atmos_anchors(pt, radius, depth, bands)
    mat = atmos_mat(radius, rr, bands, ground, kw.get("grass", "#6f9a4a"))
    verts, faces = arc_mesh(radius, rr, ang, depth)
    add(pt, mesh_obj("atmos", verts, faces, mat, smooth=True, sharp_deg=30))
    anchor(pt, "ground", (0, -depth / 2, -ground[0] / 2))
    objs, anchors = done(pt)
    anchors.arc = Arc(inv=Matrix.inverted(pt.xf), xf=pt.xf, radius=radius)
    return objs, anchors


def cloud_blobs(rr: Rng, size: float, puffs: int) -> list[Blob]:
    blobs: list[Blob] = []
    for k in range(puffs):
        t = (k + 0.5) / puffs
        prof = math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2))
        r = size * (0.2 + 0.3 * prof) * rr.uniform(0.85, 1.15)
        y = rr.uniform(-0.2, 0.2) * size
        z = r * rr.uniform(0.3, 0.6) + 0.35 * size * prof * rr.uniform(0.5, 1.0)
        blobs.append(((t - 0.5) * 2 * size * 0.9, y, z, r))
    for _ in range(2):
        x = rr.uniform(-0.3, 0.3) * size
        y = rr.uniform(-0.1, 0.1) * size
        z = size * rr.uniform(0.45, 0.65)
        blobs.append((x, y, z, size * rr.uniform(0.3, 0.38)))
    return blobs


def puff(bm: bmesh.types.BMesh, blob: Blob, seed: int, *, flat_base: bool) -> None:
    x, y, z, r = blob
    res = bmesh.ops.create_icosphere(bm, subdivisions=4, radius=r)
    off = seedvec(seed)
    for v in res["verts"]:
        n = v.co.normalized()
        d = 1 + 0.12 * noise.noise(n * 2.5 + off) + 0.05 * noise.noise(n * 6.0 + off * 1.7)
        zz = z + n.z * r * d
        v.co = Vector((x + n.x * r * d, y + n.y * r * d, max(zz, 0.0) if flat_base else zz))


def cloud_mat(size: float, color: str, tint: str) -> Mat:
    g = new_graph("cloud")
    nparams(g, Roughness=1.0, Sheen_Weight=0.5, Sheen_Tint="#eef3f8")
    lw = nnew(g, "ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    zf = nmap(g, nxyz(g, ncoord(g))[2], (0.0, 0.5 * size), (1.0, 0.0))
    fac = nmath(g, "MAXIMUM", nmath(g, "MULTIPLY", lw.outputs["Facing"], 0.45), nmath(g, "MULTIPLY", zf, 0.5))
    nput(g, g.bsdf.inputs["Base Color"], nmix(g, fac, color, tint))
    return g.m


def cloud(loc: Vec3 = (0, 0, 0), size: float = 1.0, **kw: Unpack[CloudOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    seed = kw.get("seed", 0)
    bm = bmesh.new()
    blobs = cloud_blobs(Rng(seed * 53 + 1), size, kw.get("puffs", 7))
    for bi, blob in enumerate(blobs):
        puff(bm, blob, seed * 31 + bi, flat_base=kw.get("flat_base", True))
    mat = cloud_mat(size, kw.get("color", "#ffffff"), kw.get("shade", "#d9e3ee"))
    add(pt, bm_obj("cloud", bm, mat, smooth=True, sharp_deg=0))
    anchor(pt, "top", (0, 0, max(b[2] + b[3] for b in blobs)))
    anchor(pt, "base", (0, -0.3 * size, 0))
    anchor(pt, "centre", (0, 0, 0.4 * size))
    return done(pt)
