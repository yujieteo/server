# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_sea.py
import math
from typing import TypedDict, Unpack

import bmesh
from apparatus3d_core import (
    TAU,
    Built,
    Mat,
    Part,
    Rng,
    Vec3,
    add,
    anchor,
    bm_obj,
    box,
    done,
    fbm,
    mix_hex,
    new_part,
    shade,
)
from apparatus3d_height import axis_samples, perimeter
from apparatus3d_materials import earth
from apparatus3d_nodes import ncoord, new_graph, nmap, nnew, nparams, nput, nramp, nxyz

Wave = tuple[float, float, float, float]
Verts = dict[tuple[int, int], bmesh.types.BMVert]


class OceanOpts(TypedDict, total=False):
    depth: float
    seed: int
    amp: float
    wavelength: float
    res: int
    surface: str
    deep: str
    floor: str
    floor_th: float
    rot: float


def wave_set(amp: float, wavelength: float, seed: int) -> list[Wave]:
    rr = Rng(seed)
    return [
        (amp, TAU / wavelength, rr.uniform(-0.15, 0.15), rr.uniform(0, TAU)),
        (amp * 0.4, TAU / (wavelength * 0.55), rr.uniform(-0.6, 0.6), rr.uniform(0, TAU)),
        (amp * 0.18, TAU / (wavelength * 0.3), rr.uniform(-1, 1), rr.uniform(0, TAU)),
    ]


def eta(comps: list[Wave], amp: float, seed: int, x: float, y: float) -> float:
    z = 0.0
    for a, k, th, ph in comps:
        s = k * (x * math.cos(th) + y * math.sin(th)) + ph
        z += a * math.cos(s) + 0.5 * k * a * a * math.cos(2 * s)
    return z + 0.3 * amp * fbm(x * 1.5, y * 1.5, 0, seed + 1, 3)


def ocean_mesh(
    comps: list[Wave], size: tuple[float, float], res: int, zb: float, ao: tuple[float, int]
) -> tuple[bmesh.types.BMesh, list[float]]:
    sx, sy = size
    nx, ny = res, max(8, int(res * sy / sx))
    xs, ys = axis_samples(sx, nx), axis_samples(sy, ny)
    bm = bmesh.new()
    top: Verts = {}
    heights: list[float] = []
    for i in range(nx + 1):
        for j in range(ny + 1):
            z = eta(comps, ao[0], ao[1], xs[i], ys[j])
            heights.append(z)
            top[i, j] = bm.verts.new((xs[i], ys[j], z))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1])).material_index = 0
    per = perimeter(nx, ny)
    bot = {k: bm.verts.new((xs[k[0]], ys[k[1]], zb)) for k in per}
    for a, b in zip(per, per[1:] + per[:1], strict=True):
        bm.faces.new((top[a], bot[a], bot[b], top[b])).material_index = 1
    bm.faces.new([bot[k] for k in reversed(per)]).material_index = 1
    return bm, heights


def top_mat(surface: str, e0: float, e1: float) -> Mat:
    g = new_graph("sea_top")
    nparams(g, Roughness=0.22, Specular_IOR_Level=0.12)
    sp = nxyz(g, ncoord(g))
    stops = [(0, shade(surface, 0.78)), (0.6, surface), (0.9, mix_hex(surface, "#bfe0f0", 0.45)), (1.0, "#e6f2f8")]
    tcol = nramp(g, nmap(g, sp[2], (e0, e1)), stops)
    nput(g, g.bsdf.inputs["Base Color"], tcol)
    dif = nnew(g, "ShaderNodeBsdfDiffuse")
    nput(g, dif.inputs["Color"], tcol)
    mx = nnew(g, "ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.7
    nput(g, mx.inputs[1], g.bsdf.outputs[0])
    nput(g, mx.inputs[2], dif.outputs[0])
    nput(g, g.out.inputs["Surface"], mx.outputs[0])
    return g.m


def side_mat(deep: str, surface: str, zb: float) -> Mat:
    g = new_graph("sea_side")
    nparams(g, Roughness=0.3, Coat_Weight=0.4)
    sp = nxyz(g, ncoord(g))
    stops = [
        (0, deep),
        (0.55, mix_hex(deep, surface, 0.55)),
        (0.97, shade(surface, 0.86)),
        (1, shade(surface, 0.72)),
    ]
    nput(g, g.bsdf.inputs["Base Color"], nramp(g, nmap(g, sp[2], (zb, 0.0)), stops))
    return g.m


def crest_trough(comps: list[Wave], opts: OceanOpts, size: tuple[float, float]) -> tuple[int, int]:
    sx, sy = size
    amp, seed = opts.get("amp", 0.1), opts.get("seed", 5)
    xs = axis_samples(sx, opts.get("res", 160))
    vals = [eta(comps, amp, seed, x, -sy / 2) for x in xs]
    ic = it = 0
    for i, v in enumerate(vals):
        if v > vals[ic]:
            ic = i
        if v < vals[it]:
            it = i
    return ic, it


def ocean_anchors(pt: Part, comps: list[Wave], opts: OceanOpts, size: tuple[float, float]) -> None:
    sx, sy = size
    amp, seed = opts.get("amp", 0.1), opts.get("seed", 5)
    depth, th = opts.get("depth", 1.6), opts.get("floor_th", 0.22)
    zb = -depth + th
    xs = axis_samples(sx, opts.get("res", 160))
    ic, it = crest_trough(comps, opts, size)
    anchor(pt, "surface", (-0.3 * sx, -sy / 2, eta(comps, amp, seed, -0.3 * sx, -sy / 2)))
    anchor(pt, "crest", (xs[ic], -sy / 2, eta(comps, amp, seed, xs[ic], -sy / 2)))
    anchor(pt, "trough", (xs[it], -sy / 2, eta(comps, amp, seed, xs[it], -sy / 2)))
    anchor(pt, "mid_water", (0, -sy / 2, zb / 2))
    anchor(pt, "deep", (0.3 * sx, -sy / 2, zb + 0.15))
    anchor(pt, "floor", (0, -sy / 2, -depth + th / 2))


def ocean_section(loc: Vec3 = (0, 0, 0), size: tuple[float, float] = (6.0, 3.0), **kw: Unpack[OceanOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    amp, seed = kw.get("amp", 0.1), kw.get("seed", 5)
    depth, th = kw.get("depth", 1.6), kw.get("floor_th", 0.22)
    surface = kw.get("surface", "#3d8fc6")
    comps = wave_set(amp, kw.get("wavelength", 1.4), seed)
    zb = -depth + th
    bm, hs = ocean_mesh(comps, size, kw.get("res", 160), zb, (amp, seed))
    mats = [top_mat(surface, min(hs), max(hs)), side_mat(kw.get("deep", "#0e3563"), surface, zb)]
    add(pt, bm_obj("ocean", bm, mats, smooth=True, sharp_deg=50, flat=(1,)))
    fl = earth(kw.get("floor", "#c8b48a"), 0.1, 4.0, 0.2, seed)
    add(pt, box((size[0], size[1], th), (0, 0, -depth + th / 2 - 0.001), fl, 0.0))
    ocean_anchors(pt, comps, kw, size)
    return done(pt)
