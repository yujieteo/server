# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_pouch.py
from dataclasses import dataclass
from typing import TypedDict, Unpack

import bpy
from device3d_mat import BATTERY, material
from device3d_mesh import with_prefix
from device3d_prim import prism, rect, rounded_rect, slab
from device3d_types import Anchors, Colors, Poly, Vec2, Vec3

FLANGE = 0.16
FOIL_T = 0.014
SEP_T = 0.012
COAT_MARGIN = 0.035
TRAY_H = 0.22


class PouchOpts(TypedDict, total=False):
    size: Vec2
    exploded: float
    n_pairs: int
    loc: Vec3
    colors: Colors | None
    coat_t: float
    tab_side: str | None
    prefix: str


@dataclass(frozen=True)
class Electrode:
    w: float
    d: float
    center: Vec2
    coat_t: float
    coat_col: str
    foil_kind: str
    foil_col: str
    tab_x: float
    side: int
    tab: Vec2 = (0.28, 0.32)


@dataclass(frozen=True)
class Pouch:
    w: float
    d: float
    loc: Vec3
    exploded: float
    side: int
    coat_t: float
    colors: Colors
    lam: bpy.types.Material


def electrode_poly(el: Electrode) -> Poly:
    x, y = el.center
    foil = rect(el.w, el.d, x, y)
    tx0 = x + el.tab_x - el.tab[0] / 2
    tx1 = tx0 + el.tab[0]
    y1 = y + el.d / 2
    poly = [
        foil[0],
        foil[1],
        (x + el.w / 2, y1),
        (tx1, y1),
        (tx1, y1 + el.tab[1]),
        (tx0, y1 + el.tab[1]),
        (tx0, y1),
        (x - el.w / 2, y1),
    ]
    if el.side < 0:
        poly = [(px, 2 * y - py) for px, py in poly]
    return poly


def electrode_sheet(el: Electrode, z: float) -> tuple[list[bpy.types.Object], float, Vec3]:
    x, y = el.center
    zc = z + el.coat_t
    foil_mat = material(el.foil_kind, el.foil_col)
    objs = [prism(electrode_poly(el), zc, zc + FOIL_T, foil_mat, bevel=FOIL_T * 0.3, name="foil")]
    cm = material("carbon" if el.coat_col == "#3b3e44" else "oxide", el.coat_col, rough=0.72, grain=0.35)
    face = rect(el.w - COAT_MARGIN, el.d - COAT_MARGIN, x, y)
    objs.append(prism(face, z, z + el.coat_t, cm, bevel=el.coat_t * 0.25, name="coat"))
    top = zc + FOIL_T
    objs.append(prism(face, top, top + el.coat_t, cm, bevel=el.coat_t * 0.25, name="coat"))
    tab_pos = (x + el.tab_x - el.tab[0] / 2 + el.tab[0], y + el.side * (el.d / 2 + el.tab[1] * 0.7), zc + FOIL_T)
    return objs, top + el.coat_t, tab_pos


def separator_sheet(p: Pouch, zc: float) -> bpy.types.Object:
    x, y, _ = p.loc
    return prism(
        rect(p.w - 0.02, p.d - 0.02, x, y),
        zc,
        zc + SEP_T,
        material("separator", p.colors["separator"]),
        bevel=0.004,
        name="separator",
    )


def sealed_cell(p: Pouch) -> tuple[list[bpy.types.Object], dict[str, Vec3]]:
    x, y, z = p.loc
    w, d, fl = p.w, p.d, FLANGE
    objs = [
        prism(rounded_rect(w + 2 * fl, d + 2 * fl, 0.1, x, y), z, z + 0.03, p.lam, bevel=0.01, name="flange"),
        prism(rounded_rect(w, d, 0.14, x, y), z, z + 0.32, p.lam, bevel=0.1, name="pillow"),
    ]
    anchors: dict[str, Vec3] = {}
    for sx, anchor_name, col in ((-1, "tab_neg", "cu"), (1, "tab_pos", "al")):
        tx = x + sx * w * 0.28
        objs.append(
            slab(
                (0.34, 0.6, 0.012),
                (tx, y + p.side * (d / 2 + fl + 0.12), z + 0.02),
                material("copper" if col == "cu" else "aluminium", p.colors[col]),
                bevel=0.004,
            )
        )
        objs.append(
            slab(
                (0.42, 0.12, 0.03),
                (tx, y + p.side * (d / 2 + fl - 0.02), z + 0.02),
                material("plastic", p.colors["sealant"], rough=0.6),
                bevel=0.008,
            )
        )
        anchors[anchor_name] = (tx, y + p.side * (d / 2 + fl + 0.35), z + 0.03)
    anchors["pouch"] = (x + w / 2, y - d / 2, z + 0.16)
    anchors["flange"] = (x + w / 2 + fl * 0.5, y - d / 2 - fl * 0.5, z + 0.03)
    return objs, anchors


def tray(p: Pouch) -> tuple[list[bpy.types.Object], Vec3]:
    x, y, z = p.loc
    w, d, fl, th = p.w, p.d, FLANGE, TRAY_H
    objs = [
        prism(
            rounded_rect(w + 2 * fl, d + 2 * fl, 0.1, x, y),
            z + th - 0.025,
            z + th,
            p.lam,
            bevel=0.008,
            name="tray_flange",
        ),
        prism(rounded_rect(w + 0.06, d + 0.06, 0.12, x, y), z, z + th - 0.02, p.lam, bevel=0.06, name="tray"),
    ]
    return objs, (x + w / 2 + 0.03, y - d / 2, z + th * 0.4)


def electrode_pair(p: Pouch, zc: float, *, last: bool) -> tuple[list[bpy.types.Object], dict[str, Vec3], float]:
    x, y, _ = p.loc
    w, d, c = p.w, p.d, p.colors
    anode = Electrode(w - 0.1, d - 0.1, (x, y), p.coat_t, c["anode"], "copper", c["cu"], -w * 0.28, p.side)
    objs, ztop, tab_neg = electrode_sheet(anode, zc)
    anchors: dict[str, Vec3] = {
        "anode": (x + (w - 0.1) / 2, y - (d - 0.1) / 2 + 0.2, zc + p.coat_t * 0.5),
        "anode_foil": (x + (w - 0.1) / 2 - 0.3, y - (d - 0.1) / 2, zc + p.coat_t + 0.007),
        "tab_neg": tab_neg,
    }
    zc = ztop + p.exploded
    objs.append(separator_sheet(p, zc))
    anchors["separator"] = (x + (w - 0.02) / 2, y - (d - 0.02) / 2 + 0.2, zc + 0.006)
    zc += SEP_T + p.exploded
    cathode = Electrode(w - 0.14, d - 0.14, (x, y), p.coat_t, c["cathode"], "aluminium", c["al"], w * 0.28, p.side)
    made, ztop, tab_pos = electrode_sheet(cathode, zc)
    objs += made
    anchors["cathode"] = (x + (w - 0.14) / 2, y - (d - 0.14) / 2 + 0.2, zc + p.coat_t * 1.5 + 0.014)
    anchors["cathode_foil"] = (x + (w - 0.14) / 2 - 0.3, y - (d - 0.14) / 2, zc + p.coat_t + 0.007)
    anchors["tab_pos"] = tab_pos
    zc = ztop + p.exploded
    if not last:
        objs.append(separator_sheet(p, zc))
        zc += SEP_T + p.exploded
    return objs, anchors, zc


def exploded_cell(p: Pouch, n_pairs: int, prefix: str) -> tuple[list[bpy.types.Object], Anchors]:
    x, y, z = p.loc
    objs, pouch_anchor = tray(p)
    anchors: dict[str, Vec3] = {"pouch": pouch_anchor}
    zc = z + TRAY_H + p.exploded
    for k in range(n_pairs):
        made, found, zc = electrode_pair(p, zc, last=k + 1 >= n_pairs)
        objs += made
        anchors.update(found)
    fl = FLANGE
    lid = rounded_rect(p.w + 2 * fl, p.d + 2 * fl, 0.1, x, y)
    dome = rounded_rect(p.w - 0.1, p.d - 0.1, 0.1, x, y)
    objs.append(prism(lid, zc, zc + 0.025, p.lam, bevel=0.008, name="lid"))
    objs.append(prism(dome, zc + 0.02, zc + 0.07, p.lam, bevel=0.03, name="lid_dome"))
    anchors["lid"] = (x + p.w / 2 + fl * 0.5, y - p.d / 2 - fl * 0.5, zc + 0.025)
    return objs, with_prefix(prefix, anchors)


def pouch_cell(**opts: Unpack[PouchOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    colors = {**BATTERY, **(opts.get("colors") or {})}
    w, d = opts.get("size", (2.6, 1.8))
    exploded = opts.get("exploded", 0.28)
    loc = opts.get("loc", (0, 0, 0))
    side = -1 if (opts.get("tab_side") or ("front" if exploded > 0 else "back")) == "front" else 1
    lam = material("aluminium", colors["pouch"], rough=0.5)
    p = Pouch(w, d, loc, exploded, side, opts.get("coat_t", 0.05), colors, lam)
    prefix = opts.get("prefix", "")
    if exploded <= 0:
        objs, anchors = sealed_cell(p)
        return objs, with_prefix(prefix, anchors)
    return exploded_cell(p, opts.get("n_pairs", 1), prefix)
