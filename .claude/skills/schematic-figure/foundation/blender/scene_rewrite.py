# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_rewrite.py
from collections.abc import Sequence
from dataclasses import dataclass
from typing import NamedTuple

import bpy
from bpy.types import Material, Node, NodeSocket, Object
from mathutils import Vector
from scene_color import Palette, Rgb, Rgba, lin_tone, palette_map
from scene_graph import ShaderGraph, Val, g_math, g_mix, g_node, g_put, g_shader_mix, g_smooth, g_tone, shader_graph
from scene_mat import GREY, SurfInfo, flatten, rep_color, sock_rgb

METAL_CONTRAST = 1.35
METAL_LEVEL = 0.5
SKY_SPLIT = -0.12
BAND_SHIFT = 0.45
GLOSSY = 0.3
SEMI_GLOSSY = 0.5
WHITE: Rgba = (1, 1, 1, 1)
BLACK: Rgba = (0, 0, 0, 1)
BANDS_LIGHT = 3
BANDS_DEEP = 4


@dataclass
class RewriteOpts:
    lc: Vector
    hc: Vector
    bands: int
    edges: tuple[float, float]
    grade: float
    contrast: float
    ao: float
    ao_dist: float
    highlight: float
    palette: Palette | None
    snap: float
    texture: bool


@dataclass
class ToneSource:
    sg: ShaderGraph
    base: NodeSocket | Rgba
    c: float


def tone_of(ts: ToneSource, name: str) -> Val:
    if isinstance(ts.base, bpy.types.NodeSocket):
        return g_tone(ts.sg, ts.base, name, ts.c)
    return lin_tone(ts.base, name, ts.c)


class Lit(NamedTuple):
    sg: ShaderGraph
    geo: Node
    normal: Node
    d: NodeSocket
    w: float


def _base_color(col: NodeSocket | None, o: RewriteOpts, users: Sequence[Object]) -> tuple[NodeSocket | Rgba, Rgb]:
    if col is None:
        return (*GREY, 1.0), GREY
    if col.is_linked:
        return col.links[0].from_socket, rep_color(col, users)
    mapped = palette_map(sock_rgb(col), o.palette, o.snap)
    return (mapped[0], mapped[1], mapped[2], 1.0), mapped


def _with_alpha(c: Rgb) -> Rgba:
    return (c[0], c[1], c[2], 1.0)


def _tint_pair(ts: ToneSource, info: SurfInfo, rim_col: Val, black: Node) -> tuple[NodeSocket, NodeSocket]:
    sg = ts.sg
    lw = g_node(sg, "ShaderNodeLayerWeight")
    lw.inputs[0].default_value = 0.3
    f = g_math(sg, "POWER", lw.outputs["Facing"], 1.5, clamp=True)
    face, edge = info.face or 0.0, info.edge or 0.0
    alpha = g_math(sg, "ADD", g_math(sg, "MULTIPLY", f, edge - face), face, clamp=True)
    em = g_node(sg, "ShaderNodeEmission")
    g_put(sg, em.inputs[0], g_mix(sg, f, tone_of(ts, "light"), rim_col))
    em.inputs[1].default_value = 1.0
    tr = g_node(sg, "ShaderNodeBsdfTransparent")
    tr.inputs[0].default_value = WHITE
    tr2 = g_node(sg, "ShaderNodeBsdfTransparent")
    tr2.inputs[0].default_value = WHITE
    return g_shader_mix(sg, alpha, tr.outputs[0], em.outputs[0]), g_shader_mix(
        sg, alpha, tr2.outputs[0], black.outputs[0]
    )


def _dot(sg: ShaderGraph, vec: NodeSocket, direction: Vector) -> NodeSocket:
    n = g_node(sg, "ShaderNodeVectorMath", operation="DOT_PRODUCT")
    g_put(sg, n.inputs[0], vec)
    n.inputs[1].default_value = tuple(direction)
    return n.outputs["Value"]


def _step(lit: Lit, edge: float) -> NodeSocket:
    return g_smooth(lit.sg, lit.d, edge - lit.w, edge + lit.w)


def _normal_geometry(sg: ShaderGraph) -> tuple[Node, Node]:
    geo = g_node(sg, "ShaderNodeNewGeometry")
    vt = g_node(sg, "ShaderNodeVectorTransform", vector_type="NORMAL", convert_from="WORLD", convert_to="CAMERA")
    g_put(sg, vt.inputs[0], geo.outputs["Normal"])
    flip = g_math(sg, "SUBTRACT", 1.0, g_math(sg, "MULTIPLY", geo.outputs["Backfacing"], 2.0))
    nsc = g_node(sg, "ShaderNodeVectorMath", operation="SCALE")
    g_put(sg, nsc.inputs[0], vt.outputs[0])
    g_put(sg, nsc.inputs["Scale"], flip)
    return geo, nsc


def _metal_shade(ts: ToneSource, lit: Lit, e1: float, shade: Val) -> NodeSocket:
    sg = ts.sg
    iv = g_node(sg, "ShaderNodeVectorTransform", vector_type="VECTOR", convert_from="WORLD", convert_to="CAMERA")
    g_put(sg, iv.inputs[0], lit.geo.outputs["Incoming"])
    rf = g_node(sg, "ShaderNodeVectorMath", operation="REFLECT")
    g_put(sg, rf.inputs[0], iv.outputs[0])
    g_put(sg, rf.inputs[1], lit.normal.outputs[0])
    ry = g_node(sg, "ShaderNodeSeparateXYZ")
    g_put(sg, ry.inputs[0], rf.outputs[0])
    flipped = g_math(sg, "MULTIPLY", ry.outputs["Y"], -1.0)
    sky = g_smooth(sg, flipped, SKY_SPLIT - lit.w, SKY_SPLIT + lit.w)
    return g_mix(sg, sky, g_mix(sg, _step(lit, e1), tone_of(ts, "deep"), tone_of(ts, "dark")), shade)


def _occlusion(ts: ToneSource, o: RewriteOpts, shade: Val) -> NodeSocket:
    sg = ts.sg
    aon = g_node(sg, "ShaderNodeAmbientOcclusion", samples=8, only_local=False)
    aon.inputs["Distance"].default_value = o.ao_dist
    k = g_math(sg, "MULTIPLY", g_math(sg, "SUBTRACT", 1.0, g_smooth(sg, aon.outputs["AO"], 0.2, 0.7)), o.ao)
    return g_mix(sg, k, shade, tone_of(ts, "deep"))


def _highlight_gain(o: RewriteOpts, info: SurfInfo) -> float:
    if info.metal > METAL_LEVEL or info.rough < GLOSSY:
        return o.highlight
    return o.highlight * 0.6 if info.rough < SEMI_GLOSSY else 0.0


def _opaque_shade(ts: ToneSource, o: RewriteOpts, info: SurfInfo, lit: Lit) -> Val:
    sg = ts.sg
    e1, e2 = o.edges
    shade: Val = g_mix(sg, _step(lit, e1), tone_of(ts, "dark"), ts.base)
    if info.metal > METAL_LEVEL:
        shade = _metal_shade(ts, lit, e1, shade)
    if o.bands >= BANDS_DEEP:
        shade = g_mix(sg, _step(lit, e1 - BAND_SHIFT), tone_of(ts, "deep"), shade)
    if o.bands >= BANDS_LIGHT:
        shade = g_mix(sg, _step(lit, e2), shade, tone_of(ts, "light"))
    if o.ao > 0:
        shade = _occlusion(ts, o, shade)
    return shade


def _with_highlight(ts: ToneSource, o: RewriteOpts, info: SurfInfo, lit: Lit, shade: Val) -> Val:
    gain = _highlight_gain(o, info)
    if gain <= 0:
        return shade
    sg = ts.sg
    dh = _dot(sg, lit.normal.outputs[0], o.hc)
    th = 0.985 - 0.05 * info.rough
    return g_mix(sg, g_math(sg, "MULTIPLY", g_smooth(sg, dh, th - 0.004, th + 0.004), gain), shade, tone_of(ts, "glow"))


def _opaque_pair(ts: ToneSource, o: RewriteOpts, info: SurfInfo, black: Node) -> tuple[NodeSocket, NodeSocket]:
    sg = ts.sg
    geo, nsc = _normal_geometry(sg)
    lit = Lit(sg, geo, nsc, _dot(sg, nsc.outputs[0], o.lc), o.grade + 1e-4)
    shade = _with_highlight(ts, o, info, lit, _opaque_shade(ts, o, info, lit))
    em = g_node(sg, "ShaderNodeEmission")
    g_put(sg, em.inputs[0], shade)
    em.inputs[1].default_value = 1.0
    return em.outputs[0], black.outputs[0]


def _rim_tones(ts: ToneSource, info: SurfInfo, rep: Rgb, users: Sequence[Object]) -> tuple[Rgb, Val]:
    if info.rim is None:
        return rep, tone_of(ts, "dark")
    rim_rep = rep_color(info.rim, users)
    return rim_rep, lin_tone(_with_alpha(rim_rep), "dark", ts.c)


def il_rewrite(m: Material, out: Node, info: SurfInfo, users: Sequence[Object], o: RewriteOpts) -> None:
    sg = shader_graph(m.node_tree)
    if not o.texture:
        _ = flatten(info.col)
    base, rep = _base_color(info.col, o, users)
    c = o.contrast * (METAL_CONTRAST if info.metal > METAL_LEVEL else 1.0)
    ts = ToneSource(sg, base, c)
    lp = g_node(sg, "ShaderNodeLightPath")
    black = g_node(sg, "ShaderNodeBsdfDiffuse")
    black.inputs[0].default_value = BLACK
    if info.kind == "tint":
        rim_rep, rim_col = _rim_tones(ts, info, rep, users)
        cam, other = _tint_pair(ts, info, rim_col, black)
        m.line_color = lin_tone(_with_alpha(rim_rep), "line", c)
    else:
        cam, other = _opaque_pair(ts, o, info, black)
        m.line_color = lin_tone(_with_alpha(rep), "line", c)
    final = g_shader_mix(sg, lp.outputs["Is Camera Ray"], other, cam)
    for lk in list(out.inputs["Surface"].links):
        m.node_tree.links.remove(lk)
    _ = m.node_tree.links.new(final, out.inputs["Surface"])
