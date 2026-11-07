# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_strata.py
from dataclasses import dataclass

import bpy
from apparatus3d_core import TAU, Mat, Rng, shade
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

Layers = list[tuple[float, str]]


@dataclass(frozen=True)
class Strata:
    z0: float
    z1: float
    layers: Layers
    und: float
    seed: int
    offset: float = 0.0
    wt: float | None = None
    soil: str = "#6a4a32"
    soil_depth: float = 0.07
    surface: str = "#7aa352"


WT_COLOR = "#3f7fc4"
WT_TINT = 0.1


def strata_warp(g: Graph, sp: tuple[Sock, Sock, Sock], st: Strata) -> Sock:
    rr = Rng(st.seed)
    k1, k2, q1, q2 = rr.uniform(0.6, 1.0), rr.uniform(0.5, 0.9), rr.uniform(0, TAU), rr.uniform(0, TAU)
    und = st.und
    u1 = nmath(g, "MULTIPLY", nmath(g, "SINE", nmath(g, "ADD", nmath(g, "MULTIPLY", sp[0], k1), q1)), und)
    u2 = nmath(g, "MULTIPLY", nmath(g, "SINE", nmath(g, "ADD", nmath(g, "MULTIPLY", sp[1], k2), q2)), und * 0.6)
    u3 = nmath(
        g, "MULTIPLY", nmath(g, "SUBTRACT", nnoise(g, ncoord(g), 1.2, 2.0, rough=0.5, w=st.seed), 0.5), und * 0.5
    )
    return nmath(
        g, "ADD", nmath(g, "SUBTRACT", nmath(g, "SUBTRACT", nmath(g, "SUBTRACT", sp[2], u1), u2), u3), st.offset
    )


def strata_color(g: Graph, u: Sock, st: Strata) -> Sock:
    t = nmap(g, u, (st.z0, st.z1))
    stops = [(0.0, st.layers[-1][1])]
    for i in range(len(st.layers) - 1):
        zbound = st.z1 - sum(layer[0] for layer in st.layers[: i + 1])
        stops.append(((zbound - st.z0) / (st.z1 - st.z0), st.layers[i][1]))
    col = nramp(g, t, stops, "CONSTANT")
    grain = nmap(g, nnoise(g, ncoord(g), 9.0, 6.0, rough=0.6, w=st.seed * 0.3), (0.3, 0.7), (0.9, 1.08))
    lam = nmap(g, nmath(g, "SINE", nmath(g, "MULTIPLY", u, 190.0)), (-1, 1), (0.965, 1.0))
    return nscale(g, col, nmath(g, "MULTIPLY", grain, lam))


def strata_overlays(g: Graph, col: Sock, sp: tuple[Sock, Sock, Sock], st: Strata) -> Sock:
    if st.wt is not None:
        wt = st.wt
        below = nmap(g, sp[2], (wt + 0.004, wt - 0.004))
        col = nmix(g, nmath(g, "MULTIPLY", below, WT_TINT), col, WT_COLOR)
        line = nmap(g, nmath(g, "ABSOLUTE", nmath(g, "SUBTRACT", sp[2], wt)), (0.012, 0.007))
        col = nmix(g, line, col, WT_COLOR)
    at = nnew(g, "ShaderNodeAttribute", attribute_name="hsurf")
    depth = nmath(g, "SUBTRACT", at.outputs["Fac"], sp[2])
    col = nmix(g, nmap(g, depth, (st.soil_depth + 0.004, st.soil_depth - 0.004)), col, st.soil)
    return nmix(g, nmap(g, depth, (0.016, 0.01)), col, st.surface)


def strata_mat(name: str, st: Strata) -> Mat:
    g = new_graph(name)
    nparams(g, Roughness=0.92)
    sp = nxyz(g, ncoord(g))
    u = strata_warp(g, sp, st)
    col = strata_overlays(g, strata_color(g, u, st), sp, st)
    nput(g, g.bsdf.inputs["Base Color"], col)
    return g.m


def surface_mat(name: str, color: str, dry: str, seed: int) -> Mat:
    g = new_graph(name)
    nparams(g, Roughness=0.9)
    n = nnoise(g, ncoord(g), 1.6, 4.0, rough=0.55, w=seed * 0.21)
    col = nmix(g, nmap(g, n, (0.4, 0.66), (0.0, 0.45)), shade(color, 0.95), dry)
    fine = nmap(g, nnoise(g, ncoord(g), 22.0, 3.0, rough=0.6, w=seed), (0.3, 0.7), (0.9, 1.08))
    nput(g, g.bsdf.inputs["Base Color"], nscale(g, col, fine))
    nbump(g, nnoise(g, ncoord(g), 30.0, 3.0), 0.12, 0.02)
    return g.m


def hypso_mat(seed: int, relief: float, pal: list[tuple[float, str]]) -> bpy.types.Material:
    g = new_graph("hypso")
    nparams(g, Roughness=0.88)
    sp = nxyz(g, ncoord(g))
    lo, hi = pal[0][0], pal[-1][0]
    wobble = nmath(
        g, "MULTIPLY", nmath(g, "SUBTRACT", nnoise(g, ncoord(g), 2.0, 3.0, rough=0.5, w=seed), 0.5), 0.12 * relief
    )
    col = nramp(g, nmap(g, nmath(g, "ADD", sp[2], wobble), (lo, hi)), [((p - lo) / (hi - lo), c) for p, c in pal])
    geo = nnew(g, "ShaderNodeNewGeometry")
    nz = nxyz(g, geo.outputs["Normal"])[2]
    rock = nmath(g, "MULTIPLY", nmap(g, nz, (0.8, 0.6)), nmap(g, sp[2], (0.1 * relief, 0.3 * relief)))
    col = nmix(g, rock, col, "#8a8279")
    fine = nmap(g, nnoise(g, ncoord(g), 18.0, 4.0, rough=0.6, w=seed), (0.3, 0.7), (0.9, 1.07))
    nput(g, g.bsdf.inputs["Base Color"], nscale(g, col, fine))
    nbump(g, nnoise(g, ncoord(g), 25.0, 4.0), 0.15, 0.02)
    return g.m
