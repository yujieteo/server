# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_nodes.py
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import Vec3, Vec4
from scene import hex_rgb

Sock = bpy.types.NodeSocket
Val = bpy.types.NodeSocket | str | float | Vec3 | Vec4
Stop = tuple[float, str]


@dataclass
class Graph:
    m: bpy.types.Material
    nt: bpy.types.NodeTree
    bsdf: bpy.types.Node
    out: bpy.types.Node


class NoiseOpts(TypedDict, total=False):
    rough: float
    w: float


def new_graph(name: str) -> Graph:
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return Graph(m, nt, nt.nodes["Principled BSDF"], nt.nodes["Material Output"])


def nnew(g: Graph, t: str, **props: str | float | bool) -> bpy.types.Node:
    n = g.nt.nodes.new(t)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def nput(g: Graph, sock: Sock, v: Val) -> None:
    if isinstance(v, bpy.types.NodeSocket):
        _ = g.nt.links.new(v, sock)
    elif isinstance(v, str):
        sock.default_value = hex_rgb(v)
    else:
        sock.default_value = v


def nparams(g: Graph, **kw: Val) -> None:
    for k, v in kw.items():
        nput(g, g.bsdf.inputs[k.replace("_", " ")], v)


def nmath(g: Graph, op: str, a: Val, b: Val = 0.0, *, clamp: bool = False) -> Sock:
    n = nnew(g, "ShaderNodeMath", operation=op, use_clamp=clamp)
    nput(g, n.inputs[0], a)
    nput(g, n.inputs[1], b)
    return n.outputs[0]


def nmix(g: Graph, fac: Val, a: Val, b: Val) -> Sock:
    n = nnew(g, "ShaderNodeMix", data_type="RGBA", clamp_factor=True)
    nput(g, n.inputs[0], fac)
    nput(g, n.inputs[6], a)
    nput(g, n.inputs[7], b)
    return n.outputs[2]


def ncoord(g: Graph, kind: str = "Object") -> Sock:
    return nnew(g, "ShaderNodeTexCoord").outputs[kind]


def nxyz(g: Graph, vec: Val) -> tuple[Sock, Sock, Sock]:
    s = nnew(g, "ShaderNodeSeparateXYZ")
    nput(g, s.inputs[0], vec)
    return (s.outputs[0], s.outputs[1], s.outputs[2])


def nnoise(g: Graph, vec: Val, scale: float = 5.0, detail: float = 4.0, **opts: Unpack[NoiseOpts]) -> Sock:
    n = nnew(g, "ShaderNodeTexNoise", noise_dimensions="4D")
    nput(g, n.inputs["Vector"], vec)
    n.inputs["W"].default_value = opts.get("w", 0.0)
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = opts.get("rough", 0.55)
    return n.outputs["Fac"]


def sort_stops(stops: Sequence[Stop]) -> list[Stop]:
    out: list[Stop] = []
    for stop in stops:
        i = len(out)
        while i > 0 and out[i - 1][0] > stop[0]:
            i -= 1
        out.insert(i, stop)
    return out


def nramp(g: Graph, fac: Val, stops: Sequence[Stop], interp: str = "LINEAR") -> Sock:
    n = nnew(g, "ShaderNodeValToRGB")
    cr = n.color_ramp
    cr.interpolation = interp
    ordered = sort_stops(stops)
    while len(cr.elements) < len(ordered):
        _ = cr.elements.new(0.5)
    for e, (p, c) in zip(cr.elements, ordered, strict=False):
        e.position = min(max(p, 0.0), 1.0)
        e.color = hex_rgb(c)
    nput(g, n.inputs[0], fac)
    return n.outputs[0]


def nmap(g: Graph, v: Val, src: tuple[float, float], dst: tuple[float, float] = (0.0, 1.0)) -> Sock:
    n = nnew(g, "ShaderNodeMapRange", clamp=True)
    nput(g, n.inputs[0], v)
    n.inputs[1].default_value = src[0]
    n.inputs[2].default_value = src[1]
    n.inputs[3].default_value = dst[0]
    n.inputs[4].default_value = dst[1]
    return n.outputs[0]


def nbump(g: Graph, height: Val, strength: float = 0.2, dist: float = 0.02) -> None:
    n = nnew(g, "ShaderNodeBump")
    n.inputs["Strength"].default_value = strength
    n.inputs["Distance"].default_value = dist
    nput(g, n.inputs["Height"], height)
    nput(g, g.bsdf.inputs["Normal"], n.outputs["Normal"])


def nscale(g: Graph, vec: Val, k: Val) -> Sock:
    n = nnew(g, "ShaderNodeVectorMath", operation="SCALE")
    nput(g, n.inputs[0], vec)
    nput(g, n.inputs["Scale"], k)
    return n.outputs[0]


def nmixshader(g: Graph, fac: Val, a: Val, b: Val) -> Sock:
    mx = nnew(g, "ShaderNodeMixShader")
    nput(g, mx.inputs[0], fac)
    nput(g, mx.inputs[1], a)
    nput(g, mx.inputs[2], b)
    return mx.outputs[0]
