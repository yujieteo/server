# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_arc.py
import math
from typing import NamedTuple

from svg2pptx_native_base import Point, Seg

QUARTER = math.pi / 2
RAD_EPS = 1e-9


class Arc(NamedTuple):
    rx: float
    ry: float
    rot: float
    large: int
    sweep: int


class ArcGeom(NamedTuple):
    cx: float
    cy: float
    rx: float
    ry: float
    cp: float
    sp: float
    th1: float
    dth: float


def quad_to_cubic(p0: Point, q: Point, p1: Point) -> Seg:
    return Seg(
        "C",
        (
            (p0[0] + 2.0 / 3 * (q[0] - p0[0]), p0[1] + 2.0 / 3 * (q[1] - p0[1])),
            (p1[0] + 2.0 / 3 * (q[0] - p1[0]), p1[1] + 2.0 / 3 * (q[1] - p1[1])),
            p1,
        ),
    )


def arc_angle(ux: float, uy: float, vx: float, vy: float) -> float:
    return math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)


def arc_geom(p0: Point, p1: Point, arc: Arc) -> ArcGeom:
    x1, y1 = p0
    x2, y2 = p1
    rx, ry = abs(arc.rx), abs(arc.ry)
    phi = math.radians(arc.rot)
    cp, sp = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = x1p**2 / rx**2 + y1p**2 / ry**2
    if lam > 1:
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s
    num_ = rx**2 * ry**2 - rx**2 * y1p**2 - ry**2 * x1p**2
    den = rx**2 * y1p**2 + ry**2 * x1p**2
    co = math.sqrt(max(0.0, num_ / den)) if den else 0.0
    if arc.large == arc.sweep:
        co = -co
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx = cp * cxp - sp * cyp + (x1 + x2) / 2
    cy = sp * cxp + cp * cyp + (y1 + y2) / 2
    th1 = arc_angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    dth = arc_angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if not arc.sweep and dth > 0:
        dth -= 2 * math.pi
    elif arc.sweep and dth < 0:
        dth += 2 * math.pi
    return ArcGeom(cx, cy, rx, ry, cp, sp, th1, dth)


def arc_point(g: ArcGeom, ex: float, ey: float) -> Point:
    return (g.cx + g.cp * g.rx * ex - g.sp * g.ry * ey, g.cy + g.sp * g.rx * ex + g.cp * g.ry * ey)


def arc_piece(g: ArcGeom, a: float, b: float, t: float, end: Point | None) -> Seg:
    ca, sa, cb, sb = math.cos(a), math.sin(a), math.cos(b), math.sin(b)
    c1 = arc_point(g, ca - t * sa, sa + t * ca)
    c2 = arc_point(g, cb + t * sb, sb - t * cb)
    return Seg("C", (c1, c2, end if end is not None else arc_point(g, cb, sb)))


def arc_to_cubics(p0: Point, p1: Point, arc: Arc) -> list[Seg]:
    if p0 == p1:
        return []
    if arc.rx == 0 or arc.ry == 0:
        return [Seg("L", (p1,))]
    g = arc_geom(p0, p1, arc)
    nseg = max(1, math.ceil(abs(g.dth) / QUARTER - RAD_EPS))
    delta = g.dth / nseg
    t = 4.0 / 3 * math.tan(delta / 4)
    out: list[Seg] = []
    a = g.th1
    for k in range(nseg):
        b = a + delta
        out.append(arc_piece(g, a, b, t, p1 if k == nseg - 1 else None))
        a = b
    return out
