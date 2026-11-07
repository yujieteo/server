# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_globe.py
import math
from collections.abc import Sequence
from typing import TypedDict, Unpack

from apparatus3d_core import (
    Built,
    Faces,
    Mat,
    Part,
    Vec2,
    Vec3,
    add,
    anchor,
    done,
    lathe_data,
    mesh_obj,
    mix_hex,
    new_part,
    no_shadow,
    shade,
)
from apparatus3d_materials import limb
from apparatus3d_nodes import (
    Graph,
    Sock,
    nbump,
    ncoord,
    new_graph,
    nmap,
    nmath,
    nmix,
    nnew,
    nnoise,
    nparams,
    nput,
    nramp,
    nscale,
    nxyz,
)

EPS = 1e-9
Radial = Sequence[tuple[float, str]]
DEFAULT_LAYERS: Radial = [(0.19, "#fbe27a"), (0.55, "#f5a340"), (0.78, "#e2703a"), (0.97, "#c24d33"), (1.0, "#7a5a44")]
SHALLOW = "#8fd0e6"
CUT_RINGS, CUT_ARCS = 64, 48


class GlobeOpts(TypedDict, total=False):
    seed: int
    land: float
    cutaway: bool
    layers: Radial | None
    atmosphere: str | None
    ocean: str
    deep_ocean: str
    green: str
    desert: str
    ice: str
    tilt: float
    spin: float
    seg: int


def octant_cut(v: Sequence[Vec3], f: Faces, *, cut: bool) -> Faces:
    if not cut:
        return f
    return [fc for fc in f if not all(v[i][0] >= -EPS and v[i][1] <= EPS and v[i][2] >= -EPS for i in fc)]


def globe_surface(kw: GlobeOpts) -> Mat:
    seed, land = kw.get("seed", 11), kw.get("land", 0.5)
    ocean, deep = kw.get("ocean", "#2a6fb3"), kw.get("deep_ocean", "#1b4e8c")
    g = new_graph("earth_surface")
    nv = nnew(g, "ShaderNodeVectorMath", operation="NORMALIZE")
    nput(g, nv.inputs[0], ncoord(g))
    nrm = nv.outputs[0]
    sp = nxyz(g, nrm)
    fac = nnoise(g, nrm, 1.25, 8.0, rough=0.62, w=seed * 0.618)
    lat = nmath(g, "ABSOLUTE", sp[2])
    landm = nmap(g, fac, (land - 0.002, land + 0.002))
    shore = mix_hex(ocean, SHALLOW, 0.55)
    stops = [(0.0, deep), (land - 0.09, deep), (land - 0.03, ocean), (land - 0.002, shore), (land, shore)]
    oc = nramp(g, fac, stops)
    lc = land_color(g, nrm, lat, kw)
    col = nmix(g, landm, oc, lc)
    n9 = nnoise(g, nrm, 4.0, 4.0, rough=0.5, w=seed + 9)
    wob = nmath(g, "MULTIPLY", nmath(g, "SUBTRACT", n9, 0.5), 0.12)
    icem = nmap(g, nmath(g, "ADD", lat, wob), (0.83, 0.845))
    col = nmix(g, icem, col, kw.get("ice", "#f3f6f9"))
    nput(g, g.bsdf.inputs["Base Color"], col)
    nput(g, g.bsdf.inputs["Roughness"], nmap(g, landm, (0, 1), (0.45, 0.85)))
    nput(g, g.bsdf.inputs["Coat Weight"], nmap(g, landm, (0, 1), (0.08, 0.0)))
    relief = nmath(g, "MULTIPLY", nnoise(g, nrm, 14.0, 6.0, rough=0.6, w=seed), nmath(g, "MAXIMUM", landm, icem))
    nbump(g, relief, 0.35, 0.01)
    return g.m


def land_color(g: Graph, nrm: Sock, lat: Sock, kw: GlobeOpts) -> Sock:
    seed = kw.get("seed", 11)
    dry = nnoise(g, nrm, 2.2, 4.0, rough=0.5, w=seed * 1.7 + 3)
    off = nmath(g, "ABSOLUTE", nmath(g, "SUBTRACT", lat, 0.38))
    desert_m = nmath(g, "MULTIPLY", nmap(g, dry, (0.5, 0.62)), nmap(g, off, (0.25, 0.12)))
    lc = nmix(g, desert_m, kw.get("green", "#5f8f3e"), kw.get("desert", "#cdb27a"))
    lc = nmix(g, nmap(g, lat, (0.55, 0.75)), lc, "#6b7a4c")
    patch = nmap(g, nnoise(g, nrm, 6.0, 6.0, rough=0.6, w=seed), (0.35, 0.7))
    return nmix(g, patch, nscale(g, lc, 0.85), lc)


def interior_mat(layers: Radial, radius: float) -> Mat:
    g = new_graph("interior")
    nparams(g, Roughness=0.7)
    r = nnew(g, "ShaderNodeVectorMath", operation="LENGTH")
    nput(g, r.inputs[0], ncoord(g))
    rn = nmath(g, "DIVIDE", r.outputs["Value"], radius)
    stops: list[tuple[float, str]] = []
    prev = 0.0
    for rf, c in layers:
        stops += [(prev + 0.0005, shade(c, 1.12)), (rf - 0.0005, shade(c, 0.92))]
        prev = rf
    stops[0] = (0.0, stops[0][1])
    nput(g, g.bsdf.inputs["Base Color"], nramp(g, rn, stops, "LINEAR"))
    nput(g, g.bsdf.inputs["Emission Color"], nramp(g, rn, stops, "LINEAR"))
    nparams(g, Emission_Strength=0.12)
    return g.m


def plane_point(plane: str, s: float, c: float) -> Vec3:
    if plane == "x":
        return (0, -s, c)
    if plane == "y":
        return (s, 0, c)
    return (s, -c, 0)


def cut_plane(plane: str, radius: float) -> tuple[list[Vec3], list[tuple[int, ...]]]:
    vv: list[Vec3] = []
    ff: list[tuple[int, ...]] = []
    for i in range(CUT_RINGS + 1):
        rr = radius * i / CUT_RINGS
        for j in range(CUT_ARCS + 1):
            a = 0.5 * math.pi * j / CUT_ARCS
            vv.append(plane_point(plane, rr * math.cos(a), rr * math.sin(a)))
    for i in range(CUT_RINGS):
        for j in range(CUT_ARCS):
            a, b = i * (CUT_ARCS + 1) + j, (i + 1) * (CUT_ARCS + 1) + j
            ff.append((a, b, b + 1, a + 1) if plane != "y" else (a, a + 1, b + 1, b))
    return vv, ff


def add_interior(pt: Part, layers: Radial, radius: float) -> None:
    w = interior_mat(layers, radius)
    for plane in ("x", "y", "z"):
        vv, ff = cut_plane(plane, radius)
        add(pt, mesh_obj("cut_" + plane, vv, ff, w, smooth=False))
    prev = 0.0
    for i, (rf, _) in enumerate(layers):
        rm = radius * (prev + rf) / 2
        anchor(pt, f"layer{i}", (rm * 0.7071, 0, rm * 0.7071))
        prev = rf
    anchor(pt, "cut_centre", (0, 0, 0))


def globe(loc: Vec3 = (0, 0, 0), radius: float = 1.5, **kw: Unpack[GlobeOpts]) -> Built:
    pt = new_part(loc, kw.get("spin", 0), (0, kw.get("tilt", 23.4)))
    cut, atmo = kw.get("cutaway", True), kw.get("atmosphere", "#8cc8ff")
    prof: list[Vec2] = [(radius * math.sin(math.pi * k / 96), -radius * math.cos(math.pi * k / 96)) for k in range(97)]
    prof[0], prof[-1] = (0, -radius), (0, radius)
    v, f = lathe_data(prof, kw.get("seg", 192))
    add(pt, mesh_obj("globe", v, octant_cut(v, f, cut=cut), globe_surface(kw), smooth=True, sharp_deg=0))
    if cut:
        add_interior(pt, kw.get("layers") or DEFAULT_LAYERS, radius)
    if atmo:
        v2, f2 = lathe_data([(p[0] * 1.025, p[1] * 1.025) for p in prof], 128)
        halo = mesh_obj("atmosphere", v2, octant_cut(v2, f2, cut=cut), limb(atmo, 1.0, 2.5), smooth=True, sharp_deg=0)
        no_shadow(halo)
        add(pt, halo)
        anchor(pt, "atmosphere", (-radius * 0.72, -radius * 0.72, radius * 0.2))
    anchor(pt, "north", (0, 0, radius))
    anchor(pt, "south", (0, 0, -radius))
    anchor(pt, "surface", (-radius * 0.6, -radius * 0.6, -radius * 0.5))
    return done(pt)
