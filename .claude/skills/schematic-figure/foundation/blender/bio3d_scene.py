# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_scene.py
import math
from typing import NamedTuple, TypedDict, Unpack

import bpy
from bio3d_types import ORIGIN, Vec3
from mathutils import Vector
from scene import camera_look, setup

KEY_DEFAULT = 650
FILL_DEFAULT = 220
RIM_DEFAULT = 850
TOP_DEFAULT = 100
LIGHT_DIST = 10.0


class OrbitKw(TypedDict, total=False):
    target: Vec3
    dist: float
    az: float
    el: float
    lens_mm: float
    ortho: float | None


class LightsKw(TypedDict, total=False):
    target: Vec3
    az: float
    dist: float
    key: float
    fill: float
    rim: float
    top: float
    size: float


class LightSpec(NamedTuple):
    name: str
    daz: float
    el: float
    energy: float
    size: float


def bio_setup(
    width_px: int = 1600,
    height_px: int = 1200,
    samples: int = 64,
    world: float = 0.45,
    exposure: float = 0.0,
) -> bpy.types.Scene:
    sc = setup(width_px, height_px, samples, world)
    c = sc.cycles
    c.max_bounces = 12
    c.diffuse_bounces = 4
    c.glossy_bounces = 6
    c.transmission_bounces = 12
    c.transparent_max_bounces = 48
    c.volume_bounces = 0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.sample_clamp_indirect = 8.0
    c.blur_glossy = 1.0
    c.adaptive_threshold = 0.02
    sc.view_settings.exposure = exposure
    return sc


def camera_orbit(**kw: Unpack[OrbitKw]) -> bpy.types.Object:
    dist = kw.get("dist", 8.0)
    a, e = math.radians(kw.get("az", -50.0)), math.radians(kw.get("el", 28.0))
    t = Vector(kw.get("target", ORIGIN))
    loc = t + dist * Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    return camera_look(tuple(loc), tuple(t), kw.get("lens_mm", 50), kw.get("ortho"))


def place_light(t: Vector, az: float, dist: float, spec: LightSpec) -> None:
    a, ee = math.radians(az + spec.daz), math.radians(spec.el)
    loc = t + dist * Vector((math.cos(ee) * math.cos(a), math.cos(ee) * math.sin(a), math.sin(ee)))
    _ = bpy.ops.object.light_add(type="AREA", location=tuple(loc))
    light = bpy.context.object
    light.name = "bio_" + spec.name
    light.data.energy = spec.energy * (dist / LIGHT_DIST) ** 2
    light.data.size = spec.size * dist / LIGHT_DIST
    light.rotation_euler = (t - loc).to_track_quat("-Z", "Y").to_euler()
    light.data.use_shadow = spec.name in ("key", "top")


def bio_lights(**kw: Unpack[LightsKw]) -> None:
    t = Vector(kw.get("target", ORIGIN))
    size = kw.get("size", 6.0)
    specs = [
        LightSpec("key", -50, 58, kw.get("key", KEY_DEFAULT), size),
        LightSpec("fill", 70, 12, kw.get("fill", FILL_DEFAULT), size * 1.4),
        LightSpec("rim", 180, 38, kw.get("rim", RIM_DEFAULT), size * 0.9),
        LightSpec("top", 0, 85, kw.get("top", TOP_DEFAULT), size * 1.6),
    ]
    for spec in specs:
        place_light(t, kw.get("az", -50.0), kw.get("dist", LIGHT_DIST), spec)
