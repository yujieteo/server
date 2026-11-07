# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_tree.py
import math
from typing import TypedDict, Unpack

import bmesh
from apparatus3d_core import (
    TAU,
    Built,
    Part,
    Rng,
    Vec3,
    add,
    anchor,
    bm_obj,
    done,
    jitter,
    lathe,
    lathe_data,
    mesh_obj,
    new_part,
    seedvec,
    set_color,
)
from apparatus3d_materials import bark_mat, foliage_mat
from mathutils import Vector, noise

Blob5 = tuple[float, float, float, float, float]
TRUNK_FRAC = {"broadleaf": 0.42, "round": 0.38, "poplar": 0.2}
RING_SEG = 28


class TreeOpts(TypedDict, total=False):
    kind: str
    height: float
    crown: str
    trunk: str
    lean: float


def conifer_tier(bm: bmesh.types.BMesh, rr: Rng, dims: tuple[float, float], k: int, tiers: int) -> None:
    height, th = dims
    t = k / tiers
    zb = th * 0.6 + (height - th * 0.6) * t * 0.92
    ht = (height - th) * rr.uniform(0.3, 0.38)
    rb = 0.3 * height * math.pow(1 - t, 0.9) * rr.uniform(0.9, 1.1) + 0.04 * height
    ring: list[bmesh.types.BMVert] = []
    for s in range(RING_SEG):
        a = TAU * s / RING_SEG
        jr = rb * (1 + 0.14 * math.sin(a * rr.randint(5, 8) + rr.uniform(0, TAU)) + rr.uniform(-0.06, 0.06))
        ring.append(bm.verts.new((jr * math.cos(a), jr * math.sin(a), zb + rr.uniform(-0.02, 0.02) * height)))
    mid = [bm.verts.new((0.55 * v.co.x, 0.55 * v.co.y, zb + ht * 0.45)) for v in ring]
    apex = bm.verts.new((rr.uniform(-0.01, 0.01), 0, zb + ht))
    bot = bm.verts.new((0, 0, zb + 0.08 * ht))
    for s in range(RING_SEG):
        s1 = (s + 1) % RING_SEG
        _ = bm.faces.new((ring[s], ring[s1], mid[s1], mid[s]))
        _ = bm.faces.new((mid[s], mid[s1], apex))
        _ = bm.faces.new((ring[s1], ring[s], bot))


def conifer(pt: Part, rr: Rng, height: float, kw: TreeOpts, col: str) -> None:
    bark = bark_mat()
    th = 0.25 * height
    trunk = lathe([(0.035 * height, -0.02), (0.03 * height, th), (0.0, th + 0.05)], bark, 12, name="trunk")
    set_color(trunk, jitter(kw.get("trunk", "#6b4f3a"), rr))
    add(pt, trunk)
    bm = bmesh.new()
    tiers = rr.randint(5, 7)
    for k in range(tiers):
        conifer_tier(bm, rr, (height, th), k, tiers)
    o = bm_obj("crown", bm, foliage_mat(), smooth=True, sharp_deg=0)
    set_color(o, col)
    add(pt, o)
    anchor(pt, "crown", (0, 0, 0.55 * height))


def crown_blobs(rr: Rng, kind: str, height: float, th: float, bend: float) -> list[Blob5]:
    if kind == "poplar":
        blobs: list[Blob5] = [(0, 0, th + 0.38 * height, 0.2 * height, 2.6)]
    elif kind == "round":
        blobs = [(bend, 0, th + 0.28 * height, 0.33 * height, 0.95)]
    else:
        blobs = [(bend, 0, th + 0.3 * height, 0.3 * height, 0.85)]
    nb = rr.randint(3, 6)
    _, _, z0, r0, sq = blobs[0]
    for k in range(nb):
        a = TAU * k / nb + rr.uniform(-0.4, 0.4)
        z = z0 + rr.uniform(-0.25, 0.3) * r0
        blobs.append((bend + 0.6 * r0 * math.cos(a), 0.6 * r0 * math.sin(a), z, r0 * rr.uniform(0.5, 0.75), sq))
    return blobs


def blob_mesh(bm: bmesh.types.BMesh, blob: Blob5, seed: int) -> None:
    x, y, z, r, sq = blob
    res = bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
    off = seedvec(seed)
    for v in res["verts"]:
        n = v.co.normalized()
        d = 1 + 0.2 * noise.noise(n * 2.2 + off) + 0.1 * noise.noise(n * 5.5 + off * 1.3)
        v.co = Vector((x + n.x * r * d, y + n.y * r * d, z + n.z * r * d * sq))


def broadleaf(pt: Part, rr: Rng, dims: tuple[float, int], kw: TreeOpts, col: str) -> None:
    height, seed = dims
    kind = kw.get("kind", "broadleaf")
    th = TRUNK_FRAC[kind] * height
    bend = rr.uniform(-0.04, 0.04) * height
    prof = [
        (0.06 * height, -0.02),
        (0.05 * height, th * 0.3),
        (0.035 * height, th),
        (0.02 * height, th * 1.35),
        (0, th * 1.4),
    ]
    tv, tf = lathe_data(prof, 12)
    tv = [(x + bend * (z / th) ** 2, y, z) for x, y, z in tv]
    tr = mesh_obj("trunk", tv, tf, bark_mat(), smooth=True, sharp_deg=0)
    set_color(tr, jitter(kw.get("trunk", "#6b4f3a"), rr))
    add(pt, tr)
    bm = bmesh.new()
    blobs = crown_blobs(rr, kind, height, th, bend)
    for bi, blob in enumerate(blobs):
        blob_mesh(bm, blob, seed * 17 + bi)
    o = bm_obj("crown", bm, foliage_mat(), smooth=True, sharp_deg=0)
    set_color(o, col)
    add(pt, o)
    anchor(pt, "crown", (0, -blobs[0][3], blobs[0][2]))


def tree(loc: Vec3 = (0, 0, 0), seed: int = 0, **kw: Unpack[TreeOpts]) -> Built:
    rr = Rng(seed * 131 + 7)
    height = kw.get("height", 1.0) * rr.uniform(0.85, 1.15)
    lean = kw.get("lean", 4.0)
    yaw = rr.uniform(0, 360)
    pt = new_part(loc, yaw, (rr.uniform(-lean, lean), rr.uniform(-lean, lean)))
    col = jitter(kw.get("crown", "#4f8a3c"), rr, 0.025, 0.12, 0.12)
    if kw.get("kind", "broadleaf") == "conifer":
        conifer(pt, rr, height, kw, col)
    else:
        broadleaf(pt, rr, (height, seed), kw, col)
    anchor(pt, "top", (0, 0, height))
    anchor(pt, "base", (0, 0, 0))
    return done(pt)
