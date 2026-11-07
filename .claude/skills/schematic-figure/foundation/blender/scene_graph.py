# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_graph.py
from dataclasses import dataclass

import bpy
from bpy.types import Node, NodeLinks, Nodes, NodeSocket, NodeTree
from scene_color import Rgba, tone_params

Val = NodeSocket | float | Rgba
TONE_INPUTS = ("Target", "Amt", "K", "UpFrac", "UpMax", "DnFrac", "DnMax")
GROUP_NAME = "IL_tone"
GAMMA = 2.2
MIN_ROOM = 1e-4


@dataclass
class ShaderGraph:
    nt: NodeTree
    nodes: Nodes
    links: NodeLinks


def shader_graph(nt: NodeTree) -> ShaderGraph:
    return ShaderGraph(nt, nt.nodes, nt.links)


def g_node(sg: ShaderGraph, t: str, **props: object) -> Node:
    n = sg.nodes.new(t)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def g_put(sg: ShaderGraph, sock: NodeSocket, v: Val) -> None:
    if isinstance(v, bpy.types.NodeSocket):
        _ = sg.links.new(v, sock)
    else:
        sock.default_value = v


def g_math(sg: ShaderGraph, op: str, a: Val, b: Val = 0.0, *, clamp: bool = False) -> NodeSocket:
    n = g_node(sg, "ShaderNodeMath", operation=op, use_clamp=clamp)
    g_put(sg, n.inputs[0], a)
    g_put(sg, n.inputs[1], b)
    return n.outputs[0]


def g_mix(sg: ShaderGraph, fac: Val, a: Val, b: Val) -> NodeSocket:
    n = g_node(sg, "ShaderNodeMix", data_type="RGBA", clamp_factor=True)
    g_put(sg, n.inputs[0], fac)
    g_put(sg, n.inputs[6], a)
    g_put(sg, n.inputs[7], b)
    return n.outputs[2]


def g_smooth(sg: ShaderGraph, v: Val, lo: float, hi: float) -> NodeSocket:
    n = g_node(sg, "ShaderNodeMapRange", interpolation_type="SMOOTHSTEP", clamp=True)
    g_put(sg, n.inputs[0], v)
    for i, val in enumerate((lo, hi, 0.0, 1.0), start=1):
        n.inputs[i].default_value = val
    return n.outputs[0]


def g_shader_mix(sg: ShaderGraph, fac: Val, a: NodeSocket, b: NodeSocket) -> NodeSocket:
    n = g_node(sg, "ShaderNodeMixShader")
    g_put(sg, n.inputs[0], fac)
    _ = sg.links.new(a, n.inputs[1])
    _ = sg.links.new(b, n.inputs[2])
    return n.outputs[0]


def g_tone(sg: ShaderGraph, col: Val, name: str, c: float) -> NodeSocket:
    n = g_node(sg, "ShaderNodeGroup")
    n.node_tree = tone_group()
    g_put(sg, n.inputs["Color"], col)
    for k, v in zip(TONE_INPUTS, tone_params(name, c), strict=False):
        n.inputs[k].default_value = v
    return n.outputs[0]


def _room(sg: ShaderGraph, v: Val) -> NodeSocket:
    twice = g_math(sg, "SUBTRACT", g_math(sg, "MULTIPLY", v, 2.0), 1.0)
    return g_math(sg, "SUBTRACT", 1.0, g_math(sg, "ABSOLUTE", twice))


def _tone_lightness(sg: ShaderGraph, light: NodeSocket, inp: Node) -> NodeSocket:
    up = g_math(
        sg,
        "MINIMUM",
        g_math(sg, "MULTIPLY", inp.outputs["UpFrac"], g_math(sg, "SUBTRACT", 1.0, light)),
        inp.outputs["UpMax"],
    )
    dn = g_math(sg, "MINIMUM", g_math(sg, "MULTIPLY", inp.outputs["DnFrac"], light), inp.outputs["DnMax"])
    return g_math(sg, "SUBTRACT", g_math(sg, "ADD", light, up), dn, clamp=True)


def _tone_hue(sg: ShaderGraph, hue: NodeSocket, sat: NodeSocket, inp: Node) -> NodeSocket:
    hs = g_math(sg, "MINIMUM", g_math(sg, "MULTIPLY", sat, 3.0), 1.0)
    shifted = g_math(sg, "ADD", g_math(sg, "SUBTRACT", inp.outputs["Target"], hue), 540.0)
    d = g_math(sg, "SUBTRACT", g_math(sg, "FLOORED_MODULO", shifted, 360.0), 180.0)
    limit = g_math(sg, "MINIMUM", g_math(sg, "ABSOLUTE", d), g_math(sg, "MULTIPLY", inp.outputs["Amt"], hs))
    h2 = g_math(sg, "ADD", hue, g_math(sg, "MULTIPLY", g_math(sg, "SIGN", d), limit))
    return g_math(sg, "DIVIDE", g_math(sg, "FLOORED_MODULO", h2, 360.0), 360.0)


def _group_sockets(g: NodeTree) -> None:
    _ = g.interface.new_socket("Color", in_out="INPUT", socket_type="NodeSocketColor")
    for k in TONE_INPUTS:
        _ = g.interface.new_socket(k, in_out="INPUT", socket_type="NodeSocketFloat")
    _ = g.interface.new_socket("Color", in_out="OUTPUT", socket_type="NodeSocketColor")


def tone_group() -> NodeTree:
    g = bpy.data.node_groups.get(GROUP_NAME)
    if g:
        return g
    g = bpy.data.node_groups.new(GROUP_NAME, "ShaderNodeTree")
    _group_sockets(g)
    sg = shader_graph(g)
    gi, go = g_node(sg, "NodeGroupInput"), g_node(sg, "NodeGroupOutput")
    gm = g_node(sg, "ShaderNodeGamma")
    g_put(sg, gm.inputs[0], gi.outputs["Color"])
    gm.inputs[1].default_value = 1 / GAMMA
    sp = g_node(sg, "ShaderNodeSeparateColor", mode="HSL")
    g_put(sg, sp.inputs[0], gm.outputs[0])
    sat, light = sp.outputs[1], sp.outputs[2]
    chroma = g_math(sg, "MULTIPLY", sat, _room(sg, light))
    ll = _tone_lightness(sg, light, gi)
    room = g_math(sg, "MAXIMUM", _room(sg, ll), MIN_ROOM)
    s2 = g_math(sg, "MINIMUM", g_math(sg, "DIVIDE", g_math(sg, "MULTIPLY", chroma, gi.outputs["K"]), room), 1.0)
    hn = _tone_hue(sg, g_math(sg, "MULTIPLY", sp.outputs[0], 360.0), sat, gi)
    cb = g_node(sg, "ShaderNodeCombineColor", mode="HSL")
    g_put(sg, cb.inputs[0], hn)
    g_put(sg, cb.inputs[1], s2)
    g_put(sg, cb.inputs[2], ll)
    g2 = g_node(sg, "ShaderNodeGamma")
    g_put(sg, g2.inputs[0], cb.outputs[0])
    g2.inputs[1].default_value = GAMMA
    g_put(sg, go.inputs[0], g2.outputs[0])
    return g
