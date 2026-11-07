# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_materials.py
from dataclasses import dataclass

import bpy
from apparatus3d_core import Mat, Vec3, shade
from apparatus3d_nodes import (
    nbump,
    ncoord,
    new_graph,
    nmap,
    nmath,
    nmix,
    nmixshader,
    nnew,
    nnoise,
    nparams,
    nput,
    nscale,
)
from scene import hex_rgb
from scene import mat as scene_mat

STREAKS: dict[str, Vec3] = {"x": (2, 260, 260), "y": (260, 2, 260), "z": (260, 260, 2), "radial": (60, 60, 60)}


@dataclass(frozen=True)
class ObjColor:
    name: str
    rough: float
    var: float
    scale: float
    pointy: float = 0.0
    coat: float = 0.0


def matte(color: str, rough: float = 0.85) -> Mat:
    return scene_mat("matte", **{"Base Color": hex_rgb(color), "Roughness": rough})


def painted(color: str, rough: float = 0.4, coat: float = 0.25) -> Mat:
    return scene_mat(
        "painted",
        **{"Base Color": hex_rgb(color), "Roughness": rough, "Coat Weight": coat, "Coat Roughness": 0.2},
    )


def anodized(color: str = "#2a2d33", rough: float = 0.42) -> Mat:
    g = new_graph("anodized")
    nparams(g, Base_Color=color, Roughness=rough, Metallic=0.35, Coat_Weight=0.15)
    nbump(g, nnoise(g, ncoord(g), 180.0, 2.0), 0.04)
    return g.m


def brushed_metal(
    color: str = "#c3c8ce", rough: float = 0.3, streak: str = "z", aniso: float = 0.55, grain: float = 0.06
) -> Mat:
    g = new_graph("brushed")
    nparams(g, Base_Color=color, Metallic=1.0, Roughness=rough, Anisotropic=aniso)
    mp = nnew(g, "ShaderNodeMapping")
    nput(g, mp.inputs["Vector"], ncoord(g))
    mp.inputs["Scale"].default_value = STREAKS[streak]
    lines = nnoise(g, mp.outputs[0], 1.0, 3.0, rough=0.6)
    nbump(g, lines, grain, 0.01)
    nput(
        g, g.bsdf.inputs["Roughness"], nmap(g, nnoise(g, ncoord(g), 3.0, 2.0), (0.3, 0.7), (rough * 0.8, rough * 1.25))
    )
    return g.m


def gold_plating(color: str = "#e2b04a", rough: float = 0.2) -> Mat:
    g = new_graph("gold")
    nparams(g, Metallic=1.0)
    n = nnoise(g, ncoord(g), 2.5, 3.0, rough=0.5)
    nput(g, g.bsdf.inputs["Base Color"], nmix(g, nmap(g, n, (0.3, 0.7), (0, 0.6)), color, shade(color, 0.93)))
    nput(g, g.bsdf.inputs["Roughness"], nmap(g, n, (0.3, 0.7), (rough * 0.9, rough * 1.12)))
    return g.m


def copper(color: str = "#cf8a5c", rough: float = 0.28) -> Mat:
    return scene_mat("copper", **{"Base Color": hex_rgb(color), "Metallic": 1.0, "Roughness": rough})


def glass_tint(
    color: str = "#e4f0f4", edge: str = "#7f9bab", edge_amount: float = 0.55, ior: float = 1.47, rough: float = 0.0
) -> Mat:
    g = new_graph("glass")
    nparams(g, Base_Color=color, Roughness=rough, Transmission_Weight=1.0, IOR=ior)
    rim = nnew(g, "ShaderNodeBsdfPrincipled")
    rim.inputs["Base Color"].default_value = hex_rgb(edge)
    rim.inputs["Roughness"].default_value = 0.2
    rim.inputs["Coat Weight"].default_value = 0.6
    lw = nnew(g, "ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.3
    f = nmath(g, "MULTIPLY", nmath(g, "POWER", lw.outputs["Facing"], 2.2), edge_amount, clamp=True)
    nput(g, g.out.inputs["Surface"], nmixshader(g, f, g.bsdf.outputs[0], rim.outputs[0]))
    return g.m


def liquid(color: str = "#3a8fd0", opacity: float = 0.45, ior: float = 1.33) -> Mat:
    g = new_graph("liquid")
    nparams(g, Base_Color=color, Roughness=0.02, Transmission_Weight=1.0, IOR=ior)
    body = nnew(g, "ShaderNodeBsdfPrincipled")
    body.inputs["Base Color"].default_value = hex_rgb(color)
    body.inputs["Roughness"].default_value = 0.15
    body.inputs["Coat Weight"].default_value = 0.5
    nput(g, g.out.inputs["Surface"], nmixshader(g, opacity, g.bsdf.outputs[0], body.outputs[0]))
    return g.m


def water(color: str = "#3d8fc6", clarity: float = 0.35, rough: float = 0.05) -> Mat:
    if clarity > 0:
        return liquid(color, 1 - clarity, 1.33)
    return scene_mat("water", **{"Base Color": hex_rgb(color), "Roughness": rough, "Coat Weight": 0.8})


def earth(color: str = "#8b6a4a", var: float = 0.12, scale: float = 6.0, bump: float = 0.15, seed: int = 0) -> Mat:
    g = new_graph("earth")
    nparams(g, Roughness=0.9)
    n = nnoise(g, ncoord(g), scale, 5.0, rough=0.6, w=seed * 0.37)
    nput(g, g.bsdf.inputs["Base Color"], nmix(g, nmap(g, n, (0.3, 0.7)), shade(color, 1 - var), shade(color, 1 + var)))
    if bump:
        nbump(g, nnoise(g, ncoord(g), scale * 8, 3.0, rough=0.6, w=seed), bump, 0.02)
    return g.m


def clear_plastic(edge: str = "#9fb3bd", gloss: float = 0.6) -> Mat:
    g = new_graph("clear")
    tr = nnew(g, "ShaderNodeBsdfTransparent")
    nparams(g, Base_Color=edge, Roughness=0.1, Coat_Weight=0.8)
    lw = nnew(g, "ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.35
    f = nmath(g, "MULTIPLY", nmath(g, "POWER", lw.outputs["Facing"], 1.6), gloss, clamp=True)
    nput(g, g.out.inputs["Surface"], nmixshader(g, f, tr.outputs[0], g.bsdf.outputs[0]))
    return g.m


def glow(color: str = "#3db4f2", strength: float = 3.0) -> Mat:
    return scene_mat(
        "glow", **{"Base Color": hex_rgb(color), "Emission Color": hex_rgb(color), "Emission Strength": strength}
    )


def edge_glow(name: str, color: str, strength: float, power: float, *, inverted: bool) -> Mat:
    g = new_graph(name)
    tr = nnew(g, "ShaderNodeBsdfTransparent")
    em = nnew(g, "ShaderNodeEmission")
    em.inputs["Color"].default_value = hex_rgb(color)
    em.inputs["Strength"].default_value = strength
    lw = nnew(g, "ShaderNodeLayerWeight")
    lw.inputs["Blend"].default_value = 0.5
    facing = lw.outputs["Facing"]
    if inverted:
        facing = nmath(g, "SUBTRACT", 1.0, facing, clamp=True)
    nput(g, g.out.inputs["Surface"], nmixshader(g, nmath(g, "POWER", facing, power), tr.outputs[0], em.outputs[0]))
    return g.m


def halo(color: str = "#3db4f2", strength: float = 1.2, power: float = 2.5) -> Mat:
    return edge_glow("halo", color, strength, power, inverted=True)


def limb(color: str = "#8cc8ff", strength: float = 1.0, power: float = 3.0) -> Mat:
    return edge_glow("limb", color, strength, power, inverted=False)


def objcolor_mat(spec: ObjColor) -> Mat:
    g = new_graph(spec.name)
    oi = nnew(g, "ShaderNodeObjectInfo")
    n = nnoise(g, ncoord(g), spec.scale, 4.0, rough=0.6)
    k = nmap(g, n, (0.3, 0.7), (1 - spec.var, 1 + spec.var))
    c = nscale(g, oi.outputs["Color"], k)
    if spec.pointy:
        geo = nnew(g, "ShaderNodeNewGeometry")
        ao = nmap(g, geo.outputs["Pointiness"], (0.45, 0.56), (1 - spec.pointy, 1.0))
        c = nscale(g, c, ao)
    nput(g, g.bsdf.inputs["Base Color"], c)
    nparams(g, Roughness=spec.rough, Coat_Weight=spec.coat)
    return g.m


def shared_mat(name: str, spec: ObjColor) -> Mat:
    m = bpy.data.materials.get(name)
    if m is None:
        m = objcolor_mat(spec)
        m.name = name
    return m


def foliage_mat() -> Mat:
    return shared_mat("kit_foliage", ObjColor("foliage", 0.8, 0.18, 6.0, 0.35, 0.05))


def bark_mat() -> Mat:
    return shared_mat("kit_bark", ObjColor("bark", 0.85, 0.1, 20.0))
