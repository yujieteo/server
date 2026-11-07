# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_paint.py
import math
from dataclasses import dataclass
from itertools import pairwise
from typing import NamedTuple

from lxml.etree import Element as SvgElement
from svg2pptx_native_base import (
    ANGLE_UNIT,
    EPS,
    OPAQUE,
    PCT,
    Box,
    Ctx,
    Matrix,
    MaybeElement,
    Point,
    Style,
    floats_in,
    href_of,
    local,
    mat_apply,
    num,
    parse_css,
    style_get,
    style_pick,
    url_id,
)
from svg2pptx_native_color import parse_color

RADIAL_SCALE = 0.7071
NO_FILL = "<a:noFill/>"
NO_LINE = "<a:ln><a:noFill/></a:ln>"
DASH_FLOOR = 1000
SHADOW_DEFAULT = 2.0
BLUR_SOFT = 1.5
MITER_DEFAULT = 4.0
PAINT_UNITS = "objectBoundingBox"
PATTERN_SHAPES = ("rect", "path", "circle")


class Stop(NamedTuple):
    offset: float
    rgb: str
    alpha: float


class Geo(NamedTuple):
    x: float
    y: float
    w: float
    h: float
    rot: float
    ubox: Box
    m: Matrix


@dataclass
class GradFrame:
    units: str
    ubox: Box
    m: Matrix
    ccx: float
    ccy: float
    cr: float
    sr: float
    bw: float
    bh: float


def solid_xml(rgb: str, alpha: float) -> str:
    if alpha < OPAQUE:
        return f'<a:srgbClr val="{rgb}"><a:alpha val="{round(alpha * PCT)}"/></a:srgbClr>'
    return f'<a:srgbClr val="{rgb}"/>'


def solid_fill(rgb: str, alpha: float) -> str:
    return f"<a:solidFill>{solid_xml(rgb, alpha)}</a:solidFill>"


def gs_xml(pos: float, rgb: str, alpha: float) -> str:
    return f'<a:gs pos="{round(pos * PCT)}">{solid_xml(rgb, alpha)}</a:gs>'


def stop_of(s: SvgElement) -> Stop:
    css = parse_css(s.get("style"))
    col = parse_color(css.get("stop-color", s.get("stop-color", "#000000"))) or ("000000", 1.0)
    o = num(css.get("offset", s.get("offset")), 0.0)
    op = num(css.get("stop-opacity", s.get("stop-opacity")), 1.0)
    return Stop(max(0.0, min(1.0, o)), col[0], col[1] * op)


def stops_of(ctx: Ctx, g: MaybeElement) -> list[Stop]:
    seen: set[int] = set()
    while g is not None and id(g) not in seen:
        seen.add(id(g))
        stops = [s for s in g if local(s.tag) == "stop"]
        if stops:
            return [stop_of(s) for s in stops]
        href = href_of(g)
        g = ctx.defs.get(href[1:]) if href and href.startswith("#") else None
    return []


def color_at(stops: list[Stop], t: float) -> tuple[str, float]:
    if t <= stops[0].offset:
        return stops[0].rgb, stops[0].alpha
    if t >= stops[-1].offset:
        return stops[-1].rgb, stops[-1].alpha
    for (o0, c0, a0), (o1, c1, a1) in pairwise(stops):
        if o0 <= t <= o1:
            f = 0.0 if o1 == o0 else (t - o0) / (o1 - o0)
            chans = [round(int(c0[i : i + 2], 16) * (1 - f) + int(c1[i : i + 2], 16) * f) for i in (0, 2, 4)]
            return "".join(f"{c:02X}" for c in chans), a0 * (1 - f) + a1 * f
    return stops[-1].rgb, stops[-1].alpha


def pattern_fill(ctx: Ctx, g: SvgElement, alpha_mul: float) -> str | None:
    ctx.approx["pattern fill: solid fallback"] += 1
    for ch in g:
        if local(ch.tag) in PATTERN_SHAPES:
            c = parse_color(ch.get("fill"))
            if c:
                return solid_fill(c[0], c[1] * alpha_mul)
    return None


def grad_frame(g: SvgElement, geo: Geo) -> GradFrame:
    rot = geo.rot
    ccx, ccy = geo.x + geo.w / 2.0, geo.y + geo.h / 2.0
    units = g.get("gradientUnits", PAINT_UNITS)
    return GradFrame(units, geo.ubox, geo.m, ccx, ccy, math.cos(-rot), math.sin(-rot), geo.w, geo.h)


def to_local(fr: GradFrame, ux: float, uy: float) -> Point:
    ux0, uy0, uw, uh = fr.ubox
    if fr.units == PAINT_UNITS:
        ux, uy = ux0 + ux * uw, uy0 + uy * uh
    sx, sy = mat_apply(fr.m, ux, uy)
    dx, dy = sx - fr.ccx, sy - fr.ccy
    return (fr.cr * dx - fr.sr * dy + fr.bw / 2.0, fr.sr * dx + fr.cr * dy + fr.bh / 2.0)


def linear_fill(g: SvgElement, stops: list[Stop], fr: GradFrame, alpha_mul: float) -> str:
    p1 = to_local(fr, num(g.get("x1"), 0.0), num(g.get("y1"), 0.0))
    p2 = to_local(fr, num(g.get("x2"), 1.0), num(g.get("y2"), 0.0))
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    dd = dx * dx + dy * dy
    last = stops[-1]
    if dd < EPS:
        return solid_fill(last.rgb, last.alpha * alpha_mul)
    corners = ((0, 0), (fr.bw, 0), (0, fr.bh), (fr.bw, fr.bh))
    ts = [((cx_ - p1[0]) * dx + (cy_ - p1[1]) * dy) / dd for cx_, cy_ in corners]
    tmin, tmax = min(ts), max(ts)
    span = tmax - tmin
    if span < EPS:
        return solid_fill(last.rgb, last.alpha * alpha_mul)
    pts = [Stop(0.0, *color_at(stops, tmin))]
    for o, c, a in stops:
        pos = (o - tmin) / span
        if 0.0 < pos < 1.0:
            pts.append(Stop(pos, c, a))
    pts.append(Stop(1.0, *color_at(stops, tmax)))
    angle = math.degrees(math.atan2(dy, dx)) % 360.0
    gs = "".join(gs_xml(pos, c, a * alpha_mul) for pos, c, a in pts)
    return (
        f'<a:gradFill rotWithShape="1"><a:gsLst>{gs}</a:gsLst>'
        f'<a:lin ang="{round(angle * ANGLE_UNIT)}" scaled="0"/></a:gradFill>'
    )


def frac_point(fr: GradFrame, x: float, y: float) -> Point:
    ux0, uy0, uw, uh = fr.ubox
    return ((x - ux0) / uw if uw else 0.5, (y - uy0) / uh if uh else 0.5)


def radial_fill(g: SvgElement, stops: list[Stop], fr: GradFrame, alpha_mul: float) -> str:
    cxf, cyf = num(g.get("cx"), 0.5), num(g.get("cy"), 0.5)
    rf = num(g.get("r"), 0.5)
    fxf, fyf = num(g.get("fx"), cxf), num(g.get("fy"), cyf)
    if fr.units != PAINT_UNITS:
        fxf, fyf = frac_point(fr, fxf, fyf)
        rf = rf / fr.ubox[2] if fr.ubox[2] else 0.5
    scale = rf / RADIAL_SCALE
    pts = [Stop(min(1.0, o * scale), c, a) for o, c, a in stops]
    if pts[-1].offset < 1.0:
        pts.append(Stop(1.0, pts[-1].rgb, pts[-1].alpha))
    gs = "".join(gs_xml(pos, c, a * alpha_mul) for pos, c, a in pts)
    left, top = round(max(0.0, min(1.0, fxf)) * PCT), round(max(0.0, min(1.0, fyf)) * PCT)
    return (
        f'<a:gradFill rotWithShape="1"><a:gsLst>{gs}</a:gsLst><a:path path="circle">'
        f'<a:fillToRect l="{left}" t="{top}" r="{PCT - left}" b="{PCT - top}"/></a:path></a:gradFill>'
    )


def paint_server(ctx: Ctx, g: SvgElement, kind: str, alpha_mul: float, geo: Geo) -> str | None:
    stops = stops_of(ctx, g)
    if not stops:
        return None
    if len(stops) == 1:
        return solid_fill(stops[0].rgb, stops[0].alpha * alpha_mul)
    if g.get("gradientTransform"):
        ctx.approx["gradientTransform ignored"] += 1
    fr = grad_frame(g, geo)
    if kind == "linearGradient":
        return linear_fill(g, stops, fr, alpha_mul)
    return radial_fill(g, stops, fr, alpha_mul)


def grad_xml(ctx: Ctx, gid: str, alpha_mul: float, geo: Geo) -> str | None:
    g = ctx.defs.get(gid)
    if g is None:
        ctx.warn["gradient: unknown id"] += 1
        return None
    kind = local(g.tag)
    if kind == "pattern":
        return pattern_fill(ctx, g, alpha_mul)
    if kind not in ("linearGradient", "radialGradient"):
        ctx.warn[f"fill: unsupported paint server {kind}"] += 1
        return None
    return paint_server(ctx, g, kind, alpha_mul, geo)


def fill_xml(ctx: Ctx, st: Style, geo: Geo) -> str:
    v = style_pick(st, "fill", "#000000")
    am = st.opacity * num(style_get(st, "fill-opacity"), 1.0)
    gid = url_id(v)
    if gid:
        return grad_xml(ctx, gid, am, geo) or NO_FILL
    c = parse_color(v)
    if c is None:
        return NO_FILL
    return solid_fill(c[0], c[1] * am)


def stroke_paint(ctx: Ctx, v: str, am: float, geo: Geo) -> str | None:
    gid = url_id(v)
    if gid:
        return grad_xml(ctx, gid, am, geo) or NO_FILL
    c = parse_color(v)
    return None if c is None else solid_fill(c[0], c[1] * am)


def dash_xml(da: str | None, sw: float, scale: float) -> tuple[str, bool]:
    if not da or da == "none":
        return "", False
    vals = floats_in(da)
    if not vals or sum(vals) <= 0:
        return "", False
    if len(vals) % 2:
        vals = vals * 2
    sw_u = sw / scale if scale else 1.0
    ds: list[str] = []
    flat = False
    for i in range(0, len(vals), 2):
        d_ = vals[i] / sw_u * PCT
        g_ = vals[i + 1] / sw_u * PCT
        if d_ < PCT:
            g_ = max(DASH_FLOOR, d_ + g_ - PCT)
            d_ = PCT
            flat = True
        ds.append(f'<a:ds d="{max(1, round(d_))}" sp="{max(1, round(g_))}"/>')
    body = "".join(ds)
    return f"<a:custDash>{body}</a:custDash>", flat


def join_xml(st: Style) -> str:
    join = style_pick(st, "stroke-linejoin", "miter")
    if join == "round":
        return "<a:round/>"
    if join == "bevel":
        return "<a:bevel/>"
    lim = round(num(style_get(st, "stroke-miterlimit"), MITER_DEFAULT) * PCT)
    return f'<a:miter lim="{lim}"/>'


def line_xml(ctx: Ctx, st: Style, scale: float, geo: Geo, ends: str = "") -> str:
    v = style_pick(st, "stroke", "none")
    sw = num(style_get(st, "stroke-width"), 1.0) * scale
    if sw <= 0:
        return NO_LINE
    paint = stroke_paint(ctx, v, st.opacity * num(style_get(st, "stroke-opacity"), 1.0), geo)
    if paint is None:
        return NO_LINE
    cap = {"round": "rnd", "square": "sq"}.get(style_pick(st, "stroke-linecap", "butt"), "flat")
    dash, flat = dash_xml(style_get(st, "stroke-dasharray"), sw, scale)
    if flat:
        cap = "flat"
    return f'<a:ln w="{max(1, round(sw))}" cap="{cap}">{paint}{dash}{join_xml(st)}{ends}</a:ln>'


def shadow_xml(ds: SvgElement, st: Style, scale: float) -> str:
    dx, dy = num(ds.get("dx"), SHADOW_DEFAULT) * scale, num(ds.get("dy"), SHADOW_DEFAULT) * scale
    sd = num(ds.get("stdDeviation"), SHADOW_DEFAULT) * scale
    col = parse_color(ds.get("flood-color", "#000000")) or ("000000", 1.0)
    op = num(ds.get("flood-opacity"), 1.0) * col[1] * st.opacity
    direction = round((math.degrees(math.atan2(dy, dx)) % 360) * ANGLE_UNIT)
    return (
        f'<a:effectLst><a:outerShdw blurRad="{round(sd * 2)}" dist="{round(math.hypot(dx, dy))}" '
        f'dir="{direction}" algn="ctr" rotWithShape="0">{solid_xml(col[0], op)}</a:outerShdw></a:effectLst>'
    )


def effect_xml(ctx: Ctx, st: Style, scale: float) -> str:
    f = st.filter_ref
    if not f:
        return ""
    fid = url_id(f)
    flt = ctx.defs.get(fid) if fid else None
    if flt is None:
        ctx.warn["filter: unknown id"] += 1
        return ""
    children = list(flt)
    kids = [local(c.tag) for c in children]
    if "feDropShadow" in kids:
        ctx.stats["drop shadows -> outer shadow"] += 1
        return shadow_xml(children[kids.index("feDropShadow")], st, scale)
    if kids == ["feGaussianBlur"]:
        sd = num(children[0].get("stdDeviation"), 1.0) * scale
        ctx.approx["blur filter -> soft edge"] += 1
        return f'<a:effectLst><a:softEdge rad="{max(1, round(sd * BLUR_SOFT))}"/></a:effectLst>'
    if "feMerge" in kids:
        ctx.warn["glow filter (blur + merge) dropped"] += 1
    else:
        ctx.warn["filter dropped (" + "+".join(kids) + ")"] += 1
    return ""
