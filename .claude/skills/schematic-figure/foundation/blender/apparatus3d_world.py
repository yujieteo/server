# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_world.py
from typing import NamedTuple, TypedDict, Unpack

import bpy
from apparatus3d_core import Vec3, active
from mathutils import Vector
from scene import hex_rgb

KEY_DIR: Vec3 = (-0.5, -0.75, 0.8)
GLOSSY_OFF = ("rim", "top")
LIGHT_DISTANCE = 9


class LookOpts(TypedDict, total=False):
    world_top: str
    world_horizon: str
    world_bottom: str
    strength: float
    reflect: float


class StudioOpts(TypedDict, total=False):
    key: float
    fill: float
    rim: float
    top: float
    key_dir: Vec3
    shadows: tuple[str, ...]


class LightSpec(NamedTuple):
    name: str
    direction: Vector
    energy: float
    size: float


def look_cycles(sc: bpy.types.Scene, samples: int | None) -> None:
    sc.cycles.film_transparent_glass = True
    sc.render.film_transparent = True
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.max_bounces = 10
    sc.cycles.transmission_bounces = 10
    sc.cycles.glossy_bounces = 4
    sc.cycles.diffuse_bounces = 3
    sc.cycles.transparent_max_bounces = 12
    if samples:
        sc.cycles.samples = samples


def look_world(sc: bpy.types.Scene, opts: LookOpts) -> None:
    nt = sc.world.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    _ = nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    rp = nt.nodes.new("ShaderNodeValToRGB")
    cr = rp.color_ramp
    _ = cr.elements.new(0.5)
    stops = [
        (0.3, opts.get("world_bottom", "#8a939d")),
        (0.52, opts.get("world_horizon", "#dfe4ea")),
        (0.85, opts.get("world_top", "#ffffff")),
    ]
    for e, (p, c) in zip(cr.elements, stops, strict=False):
        e.position = p
        e.color = hex_rgb(c)
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs[1].default_value = -1
    mr.inputs[2].default_value = 1
    _ = nt.links.new(sep.outputs["Z"], mr.inputs[0])
    _ = nt.links.new(mr.outputs[0], rp.inputs[0])
    _ = nt.links.new(rp.outputs[0], bg.inputs[0])
    lp = nt.nodes.new("ShaderNodeLightPath")
    m1 = nt.nodes.new("ShaderNodeMath")
    m1.operation = "MULTIPLY_ADD"
    _ = nt.links.new(lp.outputs["Is Glossy Ray"], m1.inputs[0])
    m1.inputs[1].default_value = opts.get("reflect", 0.75)
    m1.inputs[2].default_value = opts.get("strength", 0.55)
    _ = nt.links.new(m1.outputs[0], bg.inputs[1])


def look(sc: bpy.types.Scene, samples: int | None = None, **opts: Unpack[LookOpts]) -> bpy.types.Scene:
    look_cycles(sc, samples)
    look_world(sc, opts)
    return sc


def add_light(spec: LightSpec, target: Vector, scale: float, shadows: tuple[str, ...]) -> bpy.types.Object:
    loc = target + spec.direction.normalized() * LIGHT_DISTANCE * scale
    bpy.ops.object.light_add(type="AREA", location=loc)
    lamp = active()
    lamp.name = "L_" + spec.name
    lamp.data.energy = spec.energy * scale**2
    lamp.data.size = spec.size * scale
    lamp.data.use_shadow = spec.name in shadows
    lamp.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    if spec.name in GLOSSY_OFF:
        lamp.visible_glossy = False
    return lamp


def studio(target: Vec3 = (0, 0, 0), scale: float = 1.0, **opts: Unpack[StudioOpts]) -> list[bpy.types.Object]:
    t = Vector(target)
    kd = Vector(opts.get("key_dir", KEY_DIR)).normalized()
    specs = [
        LightSpec("key", kd, 650 * opts.get("key", 1.0), 3.0),
        LightSpec("fill", Vector((0.85, -0.45, 0.3)), 180 * opts.get("fill", 1.0), 5.0),
        LightSpec("rim", Vector((0.2, 0.9, 0.55)), 280 * opts.get("rim", 1.0), 3.0),
        LightSpec("top", Vector((0.1, 0.1, 1.0)), 160 * opts.get("top", 1.0), 6.0),
    ]
    shadows = opts.get("shadows", ("key",))
    return [add_light(spec, t, scale, shadows) for spec in specs]
