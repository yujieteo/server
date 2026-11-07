# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_crop.py
import math
from collections.abc import Sequence
from typing import TypedDict, Unpack

import bmesh
from apparatus3d_core import TAU, Built, Rng, Vec3, add, anchor, bm_obj, box, done, jitter, mesh_obj, new_part, shade
from apparatus3d_materials import earth
from apparatus3d_nodes import new_graph, nnew, nparams, nput
from scene import hex_rgb

Size2 = tuple[float, float]
Pt3 = tuple[float, float, float]
LEAF_RINGS = 6


class CropOpts(TypedDict, total=False):
    rows: int
    per_row: int
    seed: int
    plant: str
    soil: str
    plant_height: float
    rot: float


def field_mesh(size: Size2, rows: int) -> tuple[list[Pt3], list[tuple[int, ...]]]:
    sx, sy = size
    nx, ny = 60, rows * 8
    pitch = sy / rows
    verts: list[Pt3] = []
    for i in range(nx + 1):
        for j in range(ny + 1):
            x, y = -sx / 2 + sx * i / nx, -sy / 2 + sy * j / ny
            verts.append((x, y, 0.025 * (0.5 + 0.5 * math.cos(TAU * (y + sy / 2) / pitch - math.pi))))
    faces: list[tuple[int, ...]] = [
        (i * (ny + 1) + j, (i + 1) * (ny + 1) + j, (i + 1) * (ny + 1) + j + 1, i * (ny + 1) + j + 1)
        for i in range(nx)
        for j in range(ny)
    ]
    base = len(verts)
    verts += [(x, y, -0.12) for x, y in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2))]
    faces.append(tuple(reversed([base, *(i * (ny + 1) for i in range(nx + 1)), base + 1])))
    return verts, faces


def leaf(bm: bmesh.types.BMesh, base: Pt3, ang: float, dims: Size2, col: Sequence[float]) -> None:
    x, y, a = base[0], base[1], ang
    length, w = dims
    ca, sa = math.cos(a), math.sin(a)
    ring: list[tuple[bmesh.types.BMVert, bmesh.types.BMVert]] = []
    for s in range(LEAF_RINGS):
        t = s / 5
        rad = length * 0.75 * t
        z = 0.02 + length * (1.1 * t - 0.75 * t * t)
        ww = w * math.sin(math.pi * min(t * 1.1, 1)) * 0.5
        left = bm.verts.new((x + rad * ca - ww * sa, y + rad * sa + ww * ca, z))
        right = bm.verts.new((x + rad * ca + ww * sa, y + rad * sa - ww * ca, z + 0.2 * ww))
        ring.append((left, right))
    cl = bm.loops.layers.float_color["Col"]
    for s in range(5):
        f = bm.faces.new((ring[s][0], ring[s][1], ring[s + 1][1], ring[s + 1][0]))
        for lp in f.loops:
            lp[cl] = col


def plant(bm: bmesh.types.BMesh, rr: Rng, at: Size2, kw: CropOpts) -> None:
    h = kw.get("plant_height", 0.14) * rr.uniform(0.7, 1.25)
    c = hex_rgb(jitter(kw.get("plant", "#6fa33c"), rr, 0.02, 0.12, 0.14))
    nl = rr.randint(4, 6)
    yaw = rr.uniform(0, TAU)
    for k in range(nl):
        a = yaw + TAU * k / nl + rr.uniform(-0.3, 0.3)
        length = h * rr.uniform(0.8, 1.2)
        leaf(bm, (at[0], at[1], 0.0), a, (length, 0.22 * length), c)


def plants_mesh(size: Size2, pitch: float, kw: CropOpts, rr: Rng) -> bmesh.types.BMesh:
    sx, sy = size
    per_row = kw.get("per_row", 26)
    bm = bmesh.new()
    _ = bm.loops.layers.float_color.new("Col")
    for r in range(kw.get("rows", 12)):
        y = -sy / 2 + (r + 0.5) * pitch
        for k in range(per_row):
            x = -sx / 2 + (k + 0.5 + rr.uniform(-0.25, 0.25)) * sx / per_row
            plant(bm, rr, (x, y), kw)
    return bm


def crop_field(loc: Vec3 = (0, 0, 0), size: Size2 = (3.0, 2.0), **kw: Unpack[CropOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    rr = Rng(kw.get("seed", 0))
    sx, sy = size
    rows, seed, soil = kw.get("rows", 12), kw.get("seed", 0), kw.get("soil", "#7a5a3e")
    ph = kw.get("plant_height", 0.14)
    pitch = sy / rows
    verts, faces = field_mesh(size, rows)
    add(pt, mesh_obj("field", verts, faces, earth(soil, 0.14, 7.0, 0.3, seed), smooth=True, sharp_deg=50))
    add(pt, box((sx, sy, 0.12), (0, 0, -0.06), earth(shade(soil, 0.85), 0.1, 7.0, 0.2, seed), 0.0))
    g = new_graph("crop")
    vc = nnew(g, "ShaderNodeVertexColor", layer_name="Col")
    nput(g, g.bsdf.inputs["Base Color"], vc.outputs["Color"])
    nparams(g, Roughness=0.6, Sheen_Weight=0.3)
    add(pt, bm_obj("plants", plants_mesh(size, pitch, kw, rr), g.m, smooth=True, sharp_deg=0))
    anchor(pt, "field", (0, 0, ph))
    anchor(pt, "row0", (0, -sy / 2 + pitch / 2, ph))
    anchor(pt, "edge", (0, -sy / 2, 0))
    return done(pt)
