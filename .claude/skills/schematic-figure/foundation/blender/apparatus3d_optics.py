# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_optics.py
from typing import TypedDict, Unpack

import bpy
from apparatus3d_core import (
    Anchors,
    Built,
    Grid,
    Part,
    Vec3,
    active,
    add,
    add_all,
    anchor,
    box,
    chaikin,
    done,
    lathe,
    new_part,
    no_shadow,
    vec3,
)
from apparatus3d_materials import anodized, brushed_metal, glass_tint, matte, painted
from apparatus3d_nodes import nbump, ncoord, new_graph, nmap, nmath, nmix, nnew, nnoise, nparams, nput, nxyz
from apparatus3d_vacuum import ring
from mathutils import Vector
from scene import beam, cylinder, fiber_path, hex_rgb
from scene import mat as scene_mat

MOUNT_SPAN = 2.5
FIN_COUNT = 7


class MountOpts(TypedDict, total=False):
    optic_radius: float
    optic_color: str
    seed: int


class LaserOpts(TypedDict, total=False):
    color: str
    front: str
    beam_color: str
    beam_length: float
    beam_radius: float
    rot: float
    label: str
    seed: int


class CameraOpts(TypedDict, total=False):
    color: str
    lens_length: float
    rot: float
    seed: int


def breadboard_shader(dims: Vec3, pitch: float, color: str) -> bpy.types.Material:
    sx, sy, sz = dims
    g = new_graph("breadboard")
    nparams(g, Base_Color=color, Metallic=1.0, Roughness=0.35)
    co = ncoord(g)
    sep = nxyz(g, co)
    fx = nmath(g, "SUBTRACT", nmath(g, "FRACT", nmath(g, "DIVIDE", nmath(g, "ADD", sep[0], sx / 2), pitch)), 0.5)
    fy = nmath(g, "SUBTRACT", nmath(g, "FRACT", nmath(g, "DIVIDE", nmath(g, "ADD", sep[1], sy / 2), pitch)), 0.5)
    rad = nmath(g, "SQRT", nmath(g, "ADD", nmath(g, "MULTIPLY", fx, fx), nmath(g, "MULTIPLY", fy, fy)))
    top = nmap(g, sep[2], (sz / 2 - 0.004, sz / 2 - 0.001))
    hole = nmath(g, "MULTIPLY", nmap(g, rad, (0.17, 0.13)), top)
    nput(g, g.bsdf.inputs["Base Color"], nmix(g, hole, nmix(g, top, "#3a3e44", color), "#2c3035"))
    metallic = nmath(g, "SUBTRACT", 1.0, nmath(g, "MAXIMUM", hole, nmath(g, "SUBTRACT", 1.0, top)))
    nput(g, g.bsdf.inputs["Metallic"], metallic)
    mp = nnew(g, "ShaderNodeMapping")
    nput(g, mp.inputs["Vector"], co)
    mp.inputs["Scale"].default_value = (2, 300, 300)
    grain = nmath(g, "MULTIPLY", nnoise(g, mp.outputs[0], 1, 3), 0.05)
    nbump(g, nmath(g, "ADD", nmath(g, "MULTIPLY", hole, -1.0), grain), 0.4, 0.01)
    return g.m


def breadboard(
    loc: Vec3 = (0, 0, 0), size: Vec3 = (5.0, 3.0, 0.14), pitch: float = 0.25, color: str = "#b9bec4", rot: float = 0
) -> Built:
    pt = new_part(loc, rot)
    sx, sy, sz = size
    add(pt, box((sx, sy, sz), (0, 0, 0), breadboard_shader(size, pitch, color), 0.012))
    anchor(pt, "top", (0, 0, sz / 2))
    corners = {"corner_fl": (-sx / 2, -sy / 2), "corner_fr": (sx / 2, -sy / 2)}
    corners.update({"corner_bl": (-sx / 2, sy / 2), "corner_br": (sx / 2, sy / 2)})
    for nm, (x, y) in corners.items():
        anchor(pt, nm, (x, y, sz / 2))
    objs, anchors = done(pt)
    anchors.grid = Grid(pt.xf, sx, sy, sz, pitch)
    return objs, anchors


def hole_point(anchors: Anchors, i: int, j: int) -> Vec3:
    gr = anchors.grid
    if gr is None:
        msg = "anchors carry no breadboard grid"
        raise ValueError(msg)
    return vec3(gr.xf @ Vector((-gr.sx / 2 + (i + 0.5) * gr.pitch, -gr.sy / 2 + (j + 0.5) * gr.pitch, gr.sz / 2)))


def mirror_mount(pt: Part, r: float, zc: float, optic_color: str) -> None:
    blk = anodized("#24272c")
    steel = brushed_metal("#cfd3d7", 0.22, "z")
    s = MOUNT_SPAN * r
    add(pt, box((0.05, s, s), (0.0, 0, zc), blk, 0.01))
    add(pt, box((0.05, s, s), (-0.1, 0, zc), blk, 0.01))
    add(pt, cylinder((0.028, 0, zc), (0.05, 0, zc), r * 1.06, blk, 64))
    mir = scene_mat(
        "mirror", **{"Base Color": hex_rgb(optic_color), "Metallic": 1.0, "Roughness": 0.03, "Coat Weight": 0.3}
    )
    add(pt, cylinder((0.03, 0, zc), (0.052, 0, zc), r, mir, 64))
    for dy, dz in [(0.38 * s, 0.38 * s), (-0.38 * s, -0.38 * s)]:
        add(pt, cylinder((-0.12, dy, zc + dz), (-0.26, dy, zc + dz), 0.035, steel, 24))
        add(pt, cylinder((-0.2, dy, zc + dz), (-0.3, dy, zc + dz), 0.06, blk, 24))
    anchor(pt, "optic", (0.052, 0, zc))


def ring_mount(pt: Part, kind: str, r: float, zc: float) -> None:
    blk = anodized("#24272c")
    add(pt, ring((0, 0, zc), (1, 0, 0), (r * 1.02, r * 1.45, 0.07), blk))
    pt.objs[-1].location.x -= 0.035
    if kind == "lens":
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=r, location=(0, 0, zc))
        o = active()
        o.scale = (0.28, 1, 1)
        o.data.shade_smooth()
        o.data.materials.append(glass_tint("#e8f2f6", "#7896a8", 0.6))
        add(pt, o)
    else:
        add(pt, ring((0.0, 0, zc), (1, 0, 0), (r * 0.25, r * 1.03, 0.012), matte("#1b1d21", 0.6)))
        pt.objs[-1].location.x -= 0.006
        steel = brushed_metal("#cfd3d7", 0.22, "z")
        add(pt, cylinder((0, 0, zc + r * 1.45), (0, 0, zc + r * 1.8), 0.015, steel, 12))
    anchor(pt, "optic", (0, 0, zc))


def post_mount(
    loc: Vec3 = (0, 0, 0), height: float = 0.75, kind: str = "mirror", face: float = 0.0, **kw: Unpack[MountOpts]
) -> Built:
    pt = new_part(loc, face)
    blk = anodized("#24272c")
    steel = brushed_metal("#cfd3d7", 0.22, "z")
    hold = 0.36 * height
    prof = [*chaikin([(0, 0), (0.13, 0), (0.13, 0.03), (0.075, 0.035)], 1), (0.075, hold), (0, hold)]
    add(pt, lathe(prof, blk, 48, name="holder"))
    add(pt, cylinder((0.06, 0, hold * 0.7), (0.15, 0, hold * 0.7), 0.025, blk, 24))
    r = kw.get("optic_radius", 0.16)
    add(pt, cylinder((0, 0, hold - 0.05), (0, 0, height - r * 1.05), 0.05, steel, 48))
    if kind == "mirror":
        mirror_mount(pt, r, height, kw.get("optic_color", "#d7dde2"))
    elif kind in {"lens", "iris"}:
        ring_mount(pt, kind, r, height)
    else:
        anchor(pt, "optic", (0, 0, height))
    anchor(pt, "base", (0, 0, 0))
    anchor(pt, "top", (0, 0, height + r * 1.3))
    return done(pt)


def laser_housing(pt: Part, size: Vec3, kw: LaserOpts) -> float:
    length, w, hh = size
    body = painted(kw.get("color", "#2b2f36"), 0.38, 0.35)
    fr = painted(kw.get("front", "#d9dde1"), 0.35, 0.3)
    blk = anodized("#1d2025")
    zc = hh / 2 + 0.06
    add(pt, box((length * 1.02, w * 1.2, 0.06), (0, 0, 0.03), blk, 0.01))
    add(pt, box((length, w, hh), (0, 0, zc), body, 0.03))
    add(pt, box((0.1, w * 1.04, hh * 1.04), (length / 2 - 0.03, 0, zc), fr, 0.02))
    add(pt, box((length * 0.62, w * 0.7, 0.02), (-length * 0.1, 0, zc + hh / 2 + 0.005), blk, 0.006))
    for k in range(FIN_COUNT):
        x = -length * 0.1 - length * 0.28 + k * (length * 0.56) / 6
        add(pt, box((0.025, w * 0.62, 0.035), (x, 0, zc + hh / 2 + 0.025), blk, 0.005))
    label = matte(kw.get("label", "#f2c230"), 0.6)
    add(pt, box((0.16, 0.004, 0.08), (length * 0.18, -w / 2 - 0.002, zc + 0.06), label, 0))
    add(pt, box((0.36, 0.004, 0.025), (-length * 0.15, -w / 2 - 0.002, zc + 0.08), matte("#e9ebee", 0.6), 0))
    return zc


def laser_front(pt: Part, size: Vec3, zc: float, kw: LaserOpts) -> None:
    length, w, hh = size
    ax = length / 2 + 0.07
    add(pt, cylinder((ax - 0.05, 0, zc), (ax + 0.07, 0, zc), 0.085, brushed_metal("#c7ccd1", 0.25, "radial"), 48))
    add(pt, cylinder((ax + 0.066, 0, zc), (ax + 0.072, 0, zc), 0.045, matte("#0f1114", 0.9), 32))
    tail = [(-length / 2 - 0.02, 0.05, zc - 0.05), (-length / 2 - 0.35, 0.1, zc - 0.1), (-length / 2 - 0.6, 0.35, 0.03)]
    add(pt, fiber_path(tail, 0.03, painted("#1f2227", 0.5), 16))
    blen = kw.get("beam_length", 2.0)
    if blen > 0:
        bp = [(ax + 0.07, 0, zc), (ax + 0.07 + blen, 0, zc)]
        rays = beam(bp, kw.get("beam_radius", 0.03), kw.get("beam_color", "#e8322b"), 1.0)
        no_shadow(rays)
        add_all(pt, rays)
    anchor(pt, "aperture", (ax + 0.07, 0, zc))
    anchor(pt, "beam_end", (ax + 0.07 + blen, 0, zc))
    anchor(pt, "body", (0, -w / 2, zc))
    anchor(pt, "top", (0, 0, zc + hh / 2 + 0.08))


def laser_head(loc: Vec3 = (0, 0, 0), size: Vec3 = (1.5, 0.5, 0.42), **kw: Unpack[LaserOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    zc = laser_housing(pt, size, kw)
    laser_front(pt, size, zc, kw)
    return done(pt)


def camera_body(pt: Part, size: Vec3, color: str) -> float:
    length, w, hh = size
    body = anodized(color, 0.45)
    blk = anodized("#16181c", 0.5)
    zc = hh / 2 + 0.05
    add(pt, box((length * 0.9, w * 0.9, 0.05), (0, 0, 0.025), blk, 0.008))
    add(pt, box((length, w, hh), (0, 0, zc), body, 0.035))
    for k in range(6):
        x = -length / 2 + 0.08 + k * (length - 0.16) / 5
        for s in (-1, 1):
            add(pt, box((0.025, 0.05, hh * 0.8), (x, s * (w / 2 + 0.02), zc), body, 0.006))
    return zc


def camera_lens(pt: Part, size: Vec3, zc: float, lens_length: float) -> float:
    length, _, _ = size
    steel = brushed_metal("#c5cad0", 0.25, "radial")
    blk = anodized("#16181c", 0.5)
    x0 = -length / 2
    add(pt, cylinder((x0 + 0.01, 0, zc), (x0 - 0.06, 0, zc), 0.15, steel, 64))
    add(pt, cylinder((x0 - 0.06, 0, zc), (x0 - 0.06 - lens_length, 0, zc), 0.13, blk, 64))
    for k in range(3):
        xx = x0 - 0.12 - k * lens_length * 0.3
        add(pt, cylinder((xx, 0, zc), (xx - 0.07, 0, zc), 0.138, anodized("#2d3036", 0.6), 64))
    xf = x0 - 0.06 - lens_length
    coat = scene_mat(
        "coat",
        **{
            "Base Color": hex_rgb("#3b3f7a"),
            "Metallic": 0.2,
            "Roughness": 0.05,
            "Coat Weight": 1.0,
            "Thin Film Thickness": 350.0,
        },
    )
    add(pt, cylinder((xf + 0.02, 0, zc), (xf - 0.004, 0, zc), 0.1, coat, 64))
    return xf


def camera_box(loc: Vec3 = (0, 0, 0), size: Vec3 = (0.6, 0.55, 0.55), **kw: Unpack[CameraOpts]) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    length, w, hh = size
    zc = camera_body(pt, size, kw.get("color", "#22252a"))
    xf = camera_lens(pt, size, zc, kw.get("lens_length", 0.45))
    tail = [(length / 2, 0.08, zc), (length / 2 + 0.3, 0.12, zc - 0.05), (length / 2 + 0.55, 0.4, 0.03)]
    add(pt, fiber_path(tail, 0.03, painted("#1f2227", 0.5), 16))
    anchor(pt, "lens", (xf - 0.004, 0, zc))
    anchor(pt, "body", (0, -w / 2, zc))
    anchor(pt, "sensor", (-length / 2, 0, zc))
    anchor(pt, "top", (0, 0, hh + 0.05))
    return done(pt)
