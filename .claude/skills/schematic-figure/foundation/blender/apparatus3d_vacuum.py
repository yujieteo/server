# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/apparatus3d_vacuum.py
import math
from dataclasses import dataclass
from typing import Required, TypedDict, Unpack

import bpy
from apparatus3d_core import (
    TAU,
    Built,
    Part,
    Vec3,
    add,
    anchor,
    cyl,
    done,
    lathe,
    lathe_data,
    mesh_obj,
    new_part,
    sphere,
    vec3,
)
from apparatus3d_materials import brushed_metal, glass_tint, gold_plating, matte, painted
from apparatus3d_nodes import ncoord, new_graph, nmap, nmath, nparams, nput, nxyz
from mathutils import Floats, Matrix, Quaternion, Vector
from scene import cylinder

PORT_MIN_LEN = 0.03
SMALL_PORT = 0.4


class Port(TypedDict, total=False):
    dir: Required[Vec3]
    len: float
    r: float
    type: str
    start: float


class ChamberOpts(TypedDict, total=False):
    ports: list[Port]
    color: str
    inside: str
    rot: float
    seed: int


@dataclass(frozen=True)
class FlangeSpec:
    centre: Vector
    direction: Vector
    r_tube: float
    r_fl: float
    th: float
    bolts: int
    kind: str
    inside: str | None


def ring(c: Floats, d: Floats, dims: Vec3, mat: bpy.types.Material) -> bpy.types.Object:
    r0, r1, th = dims
    v, f = lathe_data([(r0, 0), (r1, 0), (r1, th), (r0, th)], 96, closed=True)
    o = mesh_obj("ring", v, f, mat, smooth=True, sharp_deg=40)
    o.matrix_world = Matrix.Translation(Vector(c)) @ Vector(d).to_track_quat("Z", "Y").to_matrix().to_4x4()
    return o


def lit_back(inside: str, r_tube: float) -> bpy.types.Material:
    g = new_graph("lit")
    nparams(g, Base_Color="#14171b", Roughness=0.9, Emission_Color=inside)
    sp = nxyz(g, ncoord(g))
    rad = nmath(g, "SQRT", nmath(g, "ADD", nmath(g, "MULTIPLY", sp[0], sp[0]), nmath(g, "MULTIPLY", sp[1], sp[1])))
    nput(g, g.bsdf.inputs["Emission Strength"], nmath(g, "POWER", nmap(g, rad, (0.0, r_tube * 0.95), (1.0, 0.0)), 1.6))
    return g.m


def flange_viewport(pt: Part, spec: FlangeSpec, face: Vector, mat: bpy.types.Material) -> None:
    d, r_tube, th = spec.direction, spec.r_tube, spec.th
    back = lit_back(spec.inside, r_tube) if spec.inside else matte("#14171b", 0.9)
    add(pt, cyl(face - d * 0.3 * th, face + d * 0.004, r_tube * 0.95, back, 64))
    add(pt, cyl(face + d * 0.002, face + d * 0.012, r_tube * 0.93, glass_tint("#cfe3ee", "#5f8497", 0.6), 64))
    add(pt, ring(face + d * 0.004, d, (r_tube * 0.93, r_tube * 1.08, th * 0.25), mat))


def flange_feedthrough(pt: Part, spec: FlangeSpec, face: Vector, q: Quaternion) -> None:
    d, r_tube, th = spec.direction, spec.r_tube, spec.th
    cer = painted("#f3efe6", 0.35, 0.3)
    pin = gold_plating()
    for k in range(4):
        a = TAU * k / 4 + 0.4
        off = q @ Vector((0.4 * r_tube * math.cos(a), 0.4 * r_tube * math.sin(a), 0))
        add(pt, cylinder(vec3(face + off), vec3(face + off + d * th * 1.2), r_tube * 0.14, cer, 32))
        add(pt, cylinder(vec3(face + off), vec3(face + off + d * th * 2.4), r_tube * 0.04, pin, 16))


def flange(pt: Part, spec: FlangeSpec, mat: bpy.types.Material) -> Vector:
    d, c, th, r_fl = spec.direction, spec.centre, spec.th, spec.r_fl
    add(pt, cyl(c, c + d * th, r_fl, mat, 96))
    c2 = c + d * (th + 0.006)
    add(pt, cyl(c2, c2 + d * th, r_fl, mat, 96))
    face = c2 + d * th
    q = d.to_track_quat("Z", "Y")
    bolt_mat = brushed_metal("#d4d7da", 0.35, "radial")
    for k in range(spec.bolts):
        a = TAU * (k + 0.5) / spec.bolts
        off = q @ Vector((0.82 * r_fl * math.cos(a), 0.82 * r_fl * math.sin(a), 0))
        add(pt, cylinder(vec3(face + off), vec3(face + off + d * th * 0.55), th * 0.42, bolt_mat, 6))
        add(pt, cylinder(vec3(c - d * th * 0.5 + off), vec3(c + off), th * 0.42, bolt_mat, 6))
    if spec.kind == "viewport":
        flange_viewport(pt, spec, face, mat)
    elif spec.kind == "feedthrough":
        flange_feedthrough(pt, spec, face, q)
    return face


def sphere_ports() -> list[Port]:
    angles = [TAU * k / 6 + 0.3 for k in range(6)]
    return [
        {"dir": (math.cos(a), math.sin(a), 0), "type": "viewport" if i % 2 == 0 else "blank"}
        for i, a in enumerate(angles)
    ]


def octagon_ports(r: float, h: float) -> list[Port]:
    ap = r * math.cos(math.pi / 8)
    ports: list[Port] = []
    for k in range(8):
        kind = "viewport" if k % 2 == 1 else ("blank" if k in {0, 4} else "viewport")
        ports.append(
            {
                "dir": (math.cos(TAU * k / 8), math.sin(TAU * k / 8), 0),
                "len": 0.22 * r,
                "r": 0.2 * r,
                "type": kind,
                "start": ap,
            }
        )
    ports.append({"dir": (0, 0, 1), "len": 0.05 * r, "r": 0.62 * r, "type": "viewport", "start": h / 2})
    ports.append({"dir": (0, 0, -1), "len": 0.05 * r, "r": 0.62 * r, "type": "viewport", "start": h / 2})
    return ports


def cylinder_ports(r: float, h: float) -> list[Port]:
    spec = [(-1.9, "viewport"), (-0.7, "viewport"), (0.8, "feedthrough"), (2.4, "blank")]
    ports: list[Port] = [{"dir": (math.cos(a), math.sin(a), 0), "type": t, "r": 0.22 * r} for a, t in spec]
    ports.append({"dir": (0, 0, 1), "type": "blank", "r": 0.95 * r, "len": 0.02, "start": h / 2})
    return ports


def build_body(pt: Part, kind: str, r: float, st: bpy.types.Material) -> list[Port]:
    if kind == "sphere":
        add(pt, sphere((0, 0, 0), r, st, 96))
        return [*sphere_ports(), {"dir": (0, 0, 1), "type": "feedthrough", "r": 0.3 * r}]
    if kind == "octagon":
        h = 0.55 * r
        v, f = lathe_data([(0, -h / 2), (r, -h / 2), (r, h / 2), (0, h / 2)], 8, a0=math.pi / 8)
        add(pt, mesh_obj("octagon", v, f, st, smooth=True, sharp_deg=30))
        return octagon_ports(r, h)
    h = 1.4 * r
    add(pt, lathe([(0, -h / 2), (r, -h / 2), (r, h / 2), (0, h / 2)], st, 128, name="cyl", sharp_deg=30))
    return cylinder_ports(r, h)


def add_port(pt: Part, p: Port, r: float, st: bpy.types.Material, inside: str | None) -> Vector:
    d = Vector(p["dir"]).normalized()
    pr = p.get("r", 0.22 * r)
    length = p.get("len", 0.35 * r)
    s0 = p.get("start", r * 0.8)
    if length > PORT_MIN_LEN:
        add(pt, cylinder(vec3(d * s0 * 0.9), vec3(d * (s0 + length)), pr, st, 64))
    th = max(0.05 * r, 0.25 * pr)
    spec = FlangeSpec(
        d * (s0 + length), d, pr, pr * 1.55, th, 8 if pr < SMALL_PORT * r else 16, p.get("type", "blank"), inside
    )
    return flange(pt, spec, st)


def vacuum_chamber(
    loc: Vec3 = (0, 0, 0), radius: float = 1.0, kind: str = "octagon", **kw: Unpack[ChamberOpts]
) -> Built:
    pt = new_part(loc, kw.get("rot", 0))
    st = brushed_metal(kw.get("color", "#c6cbd1"), 0.28, "radial", 0.4)
    default_ports = build_body(pt, kind, radius, st)
    wi = 0
    for i, p in enumerate(kw.get("ports") or default_ports):
        face = add_port(pt, p, radius, st, kw.get("inside"))
        anchor(pt, f"port{i}", vec3(face))
        if p.get("type") == "viewport":
            anchor(pt, f"window{wi}", vec3(face))
            wi += 1
    anchor(pt, "centre", (0, 0, 0))
    anchor(pt, "top", (0, 0, radius))
    anchor(pt, "bottom", (0, 0, -radius))
    return done(pt)
