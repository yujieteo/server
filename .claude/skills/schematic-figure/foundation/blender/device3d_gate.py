# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_gate.py
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from device3d_lattice import lattice
from device3d_mat import material, shade
from device3d_mesh import with_prefix
from device3d_prim import prism, slab, wire_bond
from device3d_types import Anchors, ChannelSpec, Colors, Poly, PtLike, Vec3

ELECTRODE_T = 0.07
CARRIER_T = 0.08


class GateOpts(TypedDict, total=False):
    substrate: Vec3
    oxide_t: float
    channel: ChannelSpec | None
    gate: str
    electrode_color: str
    gap: float | None
    wire_bonds: bool
    carrier: bool
    loc: Vec3
    colors: Colors | None
    prefix: str


@dataclass(frozen=True)
class Chan:
    length: float
    w: float
    color: str
    kind: str
    lattice: bool
    t: float


@dataclass(frozen=True)
class Gate:
    size: Vec3
    loc: Vec3
    oxide_t: float
    ch: Chan
    cc: Colors
    gm: bpy.types.Material
    top_gate: bool
    carrier: bool
    gap: float


@dataclass
class Out:
    objs: list[bpy.types.Object]
    anchors: dict[str, PtLike]


def make_chan(spec: ChannelSpec | None) -> Chan:
    s = spec or {}
    return Chan(
        s.get("length", 1.5),
        s.get("w", 0.8),
        s.get("color", "#30343b"),
        s.get("kind", "graphene"),
        s.get("lattice", True),
        s.get("t", 0.012),
    )


def base_layers(g: Gate, out: Out, *, back_gate: bool) -> float:
    w, d, t = g.size
    x, y, z = g.loc
    if g.carrier:
        out.objs.append(
            slab(
                (w + 2.4, d + 1.5, CARRIER_T),
                (x, y + 0.2, z - CARRIER_T / 2),
                material("ceramic", g.cc["carrier"]),
                bevel=0.02,
                name="carrier",
            )
        )
        out.anchors["carrier"] = (x + w / 2 + 1.2, y + 0.2 - (d + 1.5) / 2, z - CARRIER_T / 2)
    zb = z
    if back_gate:
        out.objs.append(slab((w, d, 0.04), (x, y, z + 0.02), g.gm, bevel=0.008, name="backgate"))
        zb = z + 0.04
        out.anchors["gate"] = (x + w / 2, y - d / 2, z + 0.02)
    out.objs.append(
        slab((w, d, t), (x, y, zb + t / 2), material("semiconductor", g.cc["substrate"]), bevel=0.02, name="substrate")
    )
    zo = zb + t
    out.objs.append(
        slab((w, d, g.oxide_t), (x, y, zo + g.oxide_t / 2), material("oxide", g.cc["oxide"]), bevel=0.01, name="oxide")
    )
    out.anchors["substrate"] = (x + w / 2, y - d / 2, zb + t * 0.5)
    out.anchors["oxide"] = (x + w / 2, y - d / 2, zo + g.oxide_t / 2)
    return zo + g.oxide_t


def channel_parts(g: Gate, out: Out, zs: float) -> None:
    x, y, _ = g.loc
    ch = g.ch
    out.objs.append(
        slab((ch.length, ch.w, ch.t), (x, y, zs + ch.t / 2), material(ch.kind, ch.color), bevel=0.0, name="channel")
    )
    if ch.lattice:
        made, _ = lattice(
            "honeycomb",
            a=0.045,
            size=(ch.length - 0.04, ch.w - 0.04),
            loc=(x, y, zs + ch.t + 0.003),
            colors=[shade(ch.color, 0.28)],
            style="stick",
            bond_radius=0.0075,
        )
        out.objs += made


def electrode_poly(xi: float, xo: float, y: float, sx: int, ch: Chan) -> Poly:
    pw = max(0.62, ch.w + 0.34)
    hw = ch.w / 2 + 0.06
    pl = min(0.62, abs(xo - xi) - 0.45)
    return [
        (xi, y - hw),
        (xi + sx * 0.2, y - hw),
        (xo - sx * pl, y - pw / 2),
        (xo, y - pw / 2),
        (xo, y + pw / 2),
        (xo - sx * pl, y + pw / 2),
        (xi + sx * 0.2, y + hw),
        (xi, y + hw),
    ]


def electrodes(g: Gate, out: Out, zs: float) -> None:
    w = g.size[0]
    x, y, _ = g.loc
    hw = g.ch.w / 2 + 0.06
    for sx, name in ((-1, "source"), (1, "drain")):
        xi = x + sx * g.gap / 2
        xo = x + sx * (w / 2 - 0.12)
        pl = min(0.62, abs(xo - xi) - 0.45)
        out.objs.append(prism(electrode_poly(xi, xo, y, sx, g.ch), zs, zs + ELECTRODE_T, g.gm, bevel=0.012, name=name))
        out.anchors[name] = (xi + sx * 0.12, y - hw, zs + ELECTRODE_T * 0.6)
        out.anchors["pad_" + name[0]] = (xo - sx * pl / 2, y, zs + ELECTRODE_T)
    out.anchors["channel"] = (x + (g.gap / 2 + g.gap * 0.36 / 2) / 2 + 0.02, y - g.ch.w * 0.25, zs + g.ch.t)


def top_gate(g: Gate, out: Out, zs: float) -> None:
    d = g.size[1]
    x, y, _ = g.loc
    ch = g.ch
    gw = g.gap * 0.36
    dm = material("polymer", g.cc["dielectric"], alpha=0.6)
    out.objs.append(slab((gw + 0.16, ch.w + 0.3, 0.04), (x, y, zs + ch.t + 0.02), dm, bevel=0.008, name="dielectric"))
    out.anchors["dielectric"] = (x + gw / 2 + 0.08, y - (ch.w + 0.3) / 2, zs + ch.t + 0.02)
    gz = zs + ch.t + 0.04
    poly = [
        (x - gw / 2, y - ch.w / 2 - 0.1),
        (x + gw / 2, y - ch.w / 2 - 0.1),
        (x + gw / 2, y + ch.w / 2 + 0.1),
        (x + 0.3, y + d / 2 - 0.5),
        (x + 0.3, y + d / 2 - 0.12),
        (x - 0.3, y + d / 2 - 0.12),
        (x - 0.3, y + d / 2 - 0.5),
        (x - gw / 2, y + ch.w / 2 + 0.1),
    ]
    out.objs.append(prism(poly, gz, gz + ELECTRODE_T, g.gm, bevel=0.012, name="gate"))
    out.anchors["gate"] = (x, y - ch.w / 2 - 0.1, gz + ELECTRODE_T)
    out.anchors["pad_g"] = (x, y + d / 2 - 0.31, gz + ELECTRODE_T)


def bonds(g: Gate, out: Out, color: str) -> None:
    w, d, _ = g.size
    x, y, z = g.loc
    ends: list[tuple[str, Vec3]] = [("s", (x - w / 2 - 0.55, y, z)), ("d", (x + w / 2 + 0.55, y, z))]
    if g.top_gate:
        ends.append(("g", (x, y + d / 2 + 0.45, z)))
    for k, e in ends:
        if g.carrier:
            fw = (0.34, 0.2) if k != "g" else (0.2, 0.34)
            out.objs.append(slab((fw[0], fw[1], 0.016), (e[0], e[1], e[2] + 0.008), g.gm, bevel=0.004, name="finger"))
            out.anchors["finger_" + k] = (e[0], e[1] - fw[1] / 2, e[2] + 0.016)
        pad = out.anchors["pad_" + k]
        out.objs += wire_bond(pad, (e[0], e[1], e[2] + 0.016), loop=0.45, radius=0.012, color=color, ball=True)


def gate_device(**opts: Unpack[GateOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    cc = {"substrate": "#6b7384", "oxide": "#d4cfe3", "dielectric": "#bcd6e6", "carrier": "#e7e3da"}
    cc.update(opts.get("colors") or {})
    ch = make_chan(opts.get("channel"))
    color = opts.get("electrode_color", "#d6a74f")
    mode = opts.get("gate", "top")
    g = Gate(
        opts.get("substrate", (3.2, 2.2, 0.35)),
        opts.get("loc", (0, 0, 0)),
        opts.get("oxide_t", 0.08),
        ch,
        cc,
        material("gold", color),
        mode == "top",
        opts.get("carrier", True),
        opts.get("gap") or ch.length * 0.7,
    )
    out = Out([], {})
    zs = base_layers(g, out, back_gate=mode == "back")
    channel_parts(g, out, zs)
    electrodes(g, out, zs)
    if g.top_gate:
        top_gate(g, out, zs)
    if opts.get("wire_bonds", True):
        bonds(g, out, color)
    return out.objs, with_prefix(opts.get("prefix", ""), out.anchors)
