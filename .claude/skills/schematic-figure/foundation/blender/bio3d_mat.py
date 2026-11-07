# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_mat.py
import math

import bpy
from scene import hex_rgb

PRESETS: dict[str, dict[str, float]] = {
    "cell": {
        "rough": 0.55,
        "sss": 0.55,
        "sss_scale": 0.10,
        "spec": 0.22,
        "sheen": 0.25,
        "mottle": 0.10,
        "tex": 5.0,
        "bump": 0.10,
    },
    "membrane": {
        "rough": 0.45,
        "sss": 0.5,
        "sss_scale": 0.06,
        "spec": 0.35,
        "sheen": 0.4,
        "mottle": 0.10,
        "tex": 9.0,
        "bump": 0.14,
    },
    "nucleus": {
        "rough": 0.5,
        "sss": 0.4,
        "sss_scale": 0.06,
        "spec": 0.3,
        "sheen": 0.3,
        "mottle": 0.16,
        "tex": 7.0,
        "bump": 0.2,
    },
    "organelle": {
        "rough": 0.42,
        "sss": 0.45,
        "sss_scale": 0.04,
        "spec": 0.35,
        "sheen": 0.25,
        "mottle": 0.10,
        "tex": 12.0,
        "bump": 0.15,
    },
    "protein": {
        "rough": 0.55,
        "sss": 0.35,
        "sss_scale": 0.04,
        "spec": 0.25,
        "sheen": 0.45,
        "mottle": 0.08,
        "tex": 16.0,
        "bump": 0.12,
    },
    "section": {
        "rough": 0.75,
        "sss": 0.15,
        "sss_scale": 0.02,
        "spec": 0.15,
        "sheen": 0.0,
        "mottle": 0.10,
        "tex": 12.0,
        "bump": 0.04,
    },
    "lipid_head": {
        "rough": 0.4,
        "sss": 0.3,
        "sss_scale": 0.01,
        "spec": 0.35,
        "sheen": 0.2,
        "mottle": 0.0,
        "tex": 1.0,
        "bump": 0.0,
    },
    "lipid_tail": {
        "rough": 0.55,
        "sss": 0.25,
        "sss_scale": 0.01,
        "spec": 0.2,
        "sheen": 0.1,
        "mottle": 0.0,
        "tex": 1.0,
        "bump": 0.0,
    },
    "agar": {
        "rough": 0.18,
        "sss": 1.0,
        "sss_scale": 0.25,
        "spec": 0.5,
        "sheen": 0.0,
        "mottle": 0.03,
        "tex": 3.0,
        "bump": 0.0,
    },
    "colony": {
        "rough": 0.28,
        "sss": 0.5,
        "sss_scale": 0.04,
        "spec": 0.5,
        "sheen": 0.1,
        "mottle": 0.06,
        "tex": 25.0,
        "bump": 0.05,
    },
    "plastic_clear": {"rough": 0.03, "trans": 1.0, "ior": 1.55, "spec": 0.5, "mottle": 0.0, "bump": 0.0, "sss": 0.0},
    "plastic_frosted": {"rough": 0.28, "trans": 1.0, "ior": 1.49, "spec": 0.5, "mottle": 0.0, "bump": 0.0, "sss": 0.0},
    "plastic_white": {
        "rough": 0.35,
        "sss": 0.35,
        "sss_scale": 0.05,
        "spec": 0.4,
        "coat": 0.2,
        "mottle": 0.0,
        "bump": 0.0,
    },
    "liquid": {"rough": 0.02, "trans": 1.0, "ior": 1.33, "spec": 0.5, "mottle": 0.0, "bump": 0.0, "sss": 0.0},
    "gold": {"metal": 1.0, "rough": 0.22, "spec": 0.5, "mottle": 0.05, "tex": 30.0, "bump": 0.03, "sss": 0.0},
    "silica": {
        "rough": 0.35,
        "sss": 0.4,
        "sss_scale": 0.05,
        "spec": 0.4,
        "coat": 0.3,
        "mottle": 0.04,
        "tex": 20.0,
        "bump": 0.02,
    },
    "matte": {"rough": 0.7, "sss": 0.0, "spec": 0.2, "mottle": 0.06, "tex": 10.0, "bump": 0.03},
}

DEFAULTS: dict[str, float] = {
    "rough": 0.5,
    "sss": 0.0,
    "sss_scale": 0.05,
    "spec": 0.3,
    "sheen": 0.0,
    "coat": 0.0,
    "trans": 0.0,
    "ior": 1.45,
    "metal": 0.0,
    "mottle": 0.0,
    "tex": 8.0,
    "bump": 0.0,
    "alpha": 1.0,
}


def link(nt: bpy.types.NodeTree, src: bpy.types.NodeSocket, dst: bpy.types.NodeSocket) -> None:
    _ = nt.links.new(src, dst)


def mottle_out(
    nt: bpy.types.NodeTree,
    tc: bpy.types.Node,
    c: tuple[float, ...],
    p: dict[str, float],
) -> bpy.types.NodeSocket:
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = p["tex"]
    nz.inputs["Detail"].default_value = 3.0
    nz.inputs["Roughness"].default_value = 0.55
    link(nt, tc.outputs["Object"], nz.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.3
    mr.inputs["From Max"].default_value = 0.7
    link(nt, nz.outputs["Fac"], mr.inputs["Value"])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"
    mx.clamp_factor = True
    k = p["mottle"]
    mx.inputs[6].default_value = (*(v * (1 - k) for v in c[:3]), 1)
    mx.inputs[7].default_value = (*(min(1.0, v * (1 + 0.6 * k) + 0.25 * k) for v in c[:3]), 1)
    link(nt, mr.outputs["Result"], mx.inputs[0])
    return mx.outputs[2]


def range_node(nt: bpy.types.NodeTree, lo: float, hi: float) -> bpy.types.Node:
    node = nt.nodes.new("ShaderNodeMapRange")
    node.inputs["To Min"].default_value = lo
    node.inputs["To Max"].default_value = hi
    return node


def var_out(
    nt: bpy.types.NodeTree,
    c: tuple[float, ...],
    var: float,
    col_out: bpy.types.NodeSocket | None,
) -> bpy.types.NodeSocket:
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_name = "rand"
    hs = nt.nodes.new("ShaderNodeHueSaturation")
    h1 = range_node(nt, 0.5 - 0.35 * var, 0.5 + 0.35 * var)
    v1 = range_node(nt, 1 - 1.6 * var, 1 + 1.2 * var)
    s1 = range_node(nt, 1 - var, 1 + var)
    link(nt, at.outputs["Fac"], h1.inputs["Value"])
    link(nt, at.outputs["Fac"], v1.inputs["Value"])
    at2 = nt.nodes.new("ShaderNodeAttribute")
    at2.attribute_name = "rand2"
    link(nt, at2.outputs["Fac"], s1.inputs["Value"])
    link(nt, h1.outputs["Result"], hs.inputs["Hue"])
    link(nt, v1.outputs["Result"], hs.inputs["Value"])
    link(nt, s1.outputs["Result"], hs.inputs["Saturation"])
    if col_out is not None:
        link(nt, col_out, hs.inputs["Color"])
    else:
        hs.inputs["Color"].default_value = c
    return hs.outputs["Color"]


def bump_node(nt: bpy.types.NodeTree, tc: bpy.types.Node, b: bpy.types.Node, p: dict[str, float]) -> None:
    nz2 = nt.nodes.new("ShaderNodeTexNoise")
    nz2.inputs["Scale"].default_value = p["tex"] * 2.2
    nz2.inputs["Detail"].default_value = 4.0
    link(nt, tc.outputs["Object"], nz2.inputs["Vector"])
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = p["bump"]
    bp.inputs["Distance"].default_value = 0.02
    link(nt, nz2.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])


def principled(b: bpy.types.Node, p: dict[str, float], c: tuple[float, ...]) -> None:
    rad = [0.35 + 0.65 * math.pow(v, 0.5) for v in c[:3]]
    mm = max(rad)
    b.inputs["Roughness"].default_value = p["rough"]
    b.inputs["Metallic"].default_value = p["metal"]
    b.inputs["IOR"].default_value = p["ior"]
    b.inputs["Specular IOR Level"].default_value = p["spec"]
    b.subsurface_method = "BURLEY"
    b.inputs["Subsurface Weight"].default_value = p["sss"]
    b.inputs["Subsurface Radius"].default_value = tuple(v / mm for v in rad)
    b.inputs["Subsurface Scale"].default_value = p["sss_scale"]
    b.inputs["Sheen Weight"].default_value = p["sheen"]
    b.inputs["Sheen Roughness"].default_value = 0.4
    b.inputs["Coat Weight"].default_value = p["coat"]
    b.inputs["Transmission Weight"].default_value = p["trans"]
    b.inputs["Alpha"].default_value = p["alpha"]


def bio_mat(
    color: str, preset: str = "cell", name: str | None = None, var: float = 0.0, **kw: float
) -> bpy.types.Material:
    p = {**DEFAULTS, **PRESETS[preset], **kw}
    m = bpy.data.materials.new(name or preset)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    c = tuple(hex_rgb(color))
    if p["trans"] > 0 and preset.startswith("plastic"):
        c = (*(v**0.5 for v in c[:3]), 1.0)
    col_out = None
    tc = nt.nodes.new("ShaderNodeTexCoord") if (p["mottle"] > 0 or p["bump"] > 0 or var > 0) else None
    if tc is not None and p["mottle"] > 0:
        col_out = mottle_out(nt, tc, c, p)
    if var > 0:
        col_out = var_out(nt, c, var, col_out)
    if col_out is not None:
        link(nt, col_out, b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = c
    if tc is not None and p["bump"] > 0:
        bump_node(nt, tc, b, p)
    principled(b, p, c)
    return m


def shell_mat(
    color: str, face: float = 0.10, edge: float = 0.92, power: float = 1.6, preset: str = "membrane"
) -> bpy.types.Material:
    m = bio_mat(color, preset)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    lw = nt.nodes.new("ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = power
    mr = range_node(nt, face, edge)
    link(nt, lw.outputs["Facing"], pw.inputs[0])
    link(nt, pw.outputs[0], mr.inputs["Value"])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    c = hex_rgb(color)
    tr.inputs["Color"].default_value = (*(0.8 + 0.2 * v for v in c[:3]), 1)
    mx = nt.nodes.new("ShaderNodeMixShader")
    link(nt, mr.outputs["Result"], mx.inputs[0])
    link(nt, tr.outputs[0], mx.inputs[1])
    link(nt, b.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs["Surface"])
    return m
