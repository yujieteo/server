# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_shapes.py
import base64
import io
import re
from typing import NamedTuple
from xml.sax.saxutils import quoteattr

from lxml.etree import Element as SvgElement
from svg2pptx_native_base import (
    Box,
    Ctx,
    Item,
    Node,
    Seg,
    Style,
    decompose,
    href_of,
    local,
    mat_apply,
    mat_scale,
    name_of,
    new_id,
    num,
    rot_attr,
    style_get,
)
from svg2pptx_native_geom import ellipse_segs, points_to_segs, rect_segs, rot_bbox, rrect_segs, segs_bbox
from svg2pptx_native_paint import Geo, effect_xml, fill_xml, line_xml
from svg2pptx_native_path import parse_path

IMAGE_URI = re.compile(r"data:image/(png|jpeg|jpg|gif);base64,(.*)", re.DOTALL)
LINE_SEGS = 2
MARKERS = (("marker-start", "headEnd"), ("marker-end", "tailEnd"))


class BoxSpec(NamedTuple):
    ubox: Box
    prst: str
    adj: int | None


class SegPaint(NamedTuple):
    st: Style
    scale: float
    geo: Geo
    ends: str
    eff: str


def shape_header(ctx: Ctx, name: str, *, connector: bool = False) -> str:
    sid = new_id(ctx)
    nm = quoteattr(name)
    if connector:
        return f'<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="{sid}" name={nm}/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>'
    return f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name={nm}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'


def xfrm_xml(flags: str, x: int, y: int, cx: int, cy: int) -> str:
    return f'<a:xfrm{flags}><a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'


def emit_box_shape(ctx: Ctx, node: Node, spec: BoxSpec) -> Item | None:
    el, st, m = node
    x, y, w, h = spec.ubox
    d = decompose(m)
    if not d.shear_ok or d.flip:
        return None
    cx_, cy_ = mat_apply(m, x + w / 2.0, y + h / 2.0)
    bw, bh = w * d.sx, h * d.sy
    geo = Geo(cx_ - bw / 2, cy_ - bh / 2, bw, bh, d.rot, spec.ubox, m)
    scale = mat_scale(m)
    head = shape_header(ctx, name_of(el, spec.prst))
    adj = "<a:avLst/>" if spec.adj is None else f'<a:avLst><a:gd name="adj" fmla="val {spec.adj}"/></a:avLst>'
    xfrm = xfrm_xml(rot_attr(d.rot), round(geo.x), round(geo.y), max(1, round(bw)), max(1, round(bh)))
    fill = fill_xml(ctx, st, geo)
    line = line_xml(ctx, st, scale, geo)
    eff = effect_xml(ctx, st, scale)
    xml = f'{head}<p:spPr>{xfrm}<a:prstGeom prst="{spec.prst}">{adj}</a:prstGeom>{fill}{line}{eff}</p:spPr></p:sp>'
    ctx.stats["shapes"] += 1
    return Item(xml, rot_bbox(geo.x, geo.y, bw, bh, d.rot))


def marker_ends(ctx: Ctx, st: Style) -> str:
    out = ""
    for attr, tag in MARKERS:
        v = style_get(st, attr)
        if v and v != "none":
            ctx.approx["marker -> triangle line end"] += 1
            out += f'<a:{tag} type="triangle" w="med" len="med"/>'
    return out


def connector_item(ctx: Ctx, name: str, tsegs: list[Seg], box: Box, sp: SegPaint) -> Item:
    x0, y0, x1, y1 = box
    (sx_, sy_), (ex_, ey_) = tsegs[0].pts[0], tsegs[1].pts[0]
    head = shape_header(ctx, name, connector=True)
    flip = (' flipH="1"' if ex_ < sx_ else "") + (' flipV="1"' if ey_ < sy_ else "")
    xfrm = xfrm_xml(flip, round(x0), round(y0), round(x1 - x0), round(y1 - y0))
    line = line_xml(ctx, sp.st, sp.scale, sp.geo, sp.ends)
    xml = f'{head}<p:spPr>{xfrm}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>{line}{sp.eff}</p:spPr></p:cxnSp>'
    ctx.stats["shapes"] += 1
    return Item(xml, box)


def path_commands(tsegs: list[Seg], x0: float, y0: float) -> str:
    parts: list[str] = []
    for s in tsegs:
        pts = "".join(f'<a:pt x="{round(p[0] - x0)}" y="{round(p[1] - y0)}"/>' for p in s.pts)
        if s.op == "M":
            parts.append(f"<a:moveTo>{pts}</a:moveTo>")
        elif s.op == "L":
            parts.append(f"<a:lnTo>{pts}</a:lnTo>")
        elif s.op == "C":
            parts.append(f"<a:cubicBezTo>{pts}</a:cubicBezTo>")
        else:
            parts.append("<a:close/>")
    return "".join(parts)


def freeform_item(ctx: Ctx, name: str, tsegs: list[Seg], box: Box, sp: SegPaint) -> Item:
    x0, y0, x1, y1 = box
    w, h = max(1.0, x1 - x0), max(1.0, y1 - y0)
    parts = path_commands(tsegs, x0, y0)
    fill = fill_xml(ctx, sp.st, sp.geo)
    head = shape_header(ctx, name)
    xfrm = xfrm_xml("", round(x0), round(y0), round(w), round(h))
    geom = (
        '<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/>'
        f'<a:pathLst><a:path w="{round(w)}" h="{round(h)}">{parts}</a:path></a:pathLst></a:custGeom>'
    )
    line = line_xml(ctx, sp.st, sp.scale, sp.geo, sp.ends)
    xml = f"{head}<p:spPr>{xfrm}{geom}{fill}{line}{sp.eff}</p:spPr></p:sp>"
    if style_get(sp.st, "fill-rule") == "evenodd":
        ctx.approx["fill-rule evenodd: PowerPoint decides holes"] += 1
    ctx.stats["shapes"] += 1
    return Item(xml, box)


def emit_segments(ctx: Ctx, node: Node, segs: list[Seg], ubox_ref: Box | None = None) -> Item | None:
    if not segs:
        return None
    el, st, m = node
    scale = mat_scale(m)
    tsegs = [s if s.op == "Z" else Seg(s.op, tuple(mat_apply(m, p[0], p[1]) for p in s.pts)) for s in segs]
    bb = segs_bbox(tsegs)
    ub = segs_bbox(segs)
    if bb is None or ub is None:
        return None
    ubox = ubox_ref or (ub[0], ub[1], ub[2] - ub[0], ub[3] - ub[1])
    geo = Geo(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], 0.0, ubox, m)
    name = name_of(el, local(el.tag))
    ends = marker_ends(ctx, st)
    sp = SegPaint(st, scale, geo, ends, effect_xml(ctx, st, scale))
    if len(tsegs) == LINE_SEGS and tsegs[0].op == "M" and tsegs[1].op == "L":
        return connector_item(ctx, name, tsegs, bb, sp)
    return freeform_item(ctx, name, tsegs, bb, sp)


def emit_image(ctx: Ctx, node: Node) -> Item | None:
    el, _, m = node
    found = IMAGE_URI.match(href_of(el))
    if not found:
        ctx.warn["image: not a raster data URI, dropped"] += 1
        return None
    x, y, w, h = (num(el.get(a)) for a in ("x", "y", "width", "height"))
    d = decompose(m)
    if not d.shear_ok or d.flip:
        ctx.warn["image: sheared or mirrored, dropped"] += 1
        return None
    data = base64.b64decode(found.group(2))
    _, rid = ctx.slide_part.get_or_add_image_part(io.BytesIO(data))
    cx_, cy_ = mat_apply(m, x + w / 2.0, y + h / 2.0)
    bw, bh = w * d.sx, h * d.sy
    sid = new_id(ctx)
    nm = quoteattr(name_of(el, "image"))
    xfrm = xfrm_xml(rot_attr(d.rot), round(cx_ - bw / 2), round(cy_ - bh / 2), round(bw), round(bh))
    xml = (
        f'<p:pic><p:nvPicPr><p:cNvPr id="{sid}" name={nm}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>'
        f'<p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
        f'<p:spPr>{xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    )
    ctx.stats["pictures"] += 1
    return Item(xml, rot_bbox(cx_ - bw / 2, cy_ - bh / 2, bw, bh, d.rot))


def wrap_group(ctx: Ctx, kids: list[Item], name: str) -> Item:
    x0 = min(k.box[0] for k in kids)
    y0 = min(k.box[1] for k in kids)
    x1 = max(k.box[2] for k in kids)
    y1 = max(k.box[3] for k in kids)
    gid = new_id(ctx)
    w, h = max(1, round(x1 - x0)), max(1, round(y1 - y0))
    head = f'<p:grpSp><p:nvGrpSpPr><p:cNvPr id="{gid}" name={quoteattr(name)}/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    frame = (
        f'<a:xfrm><a:off x="{round(x0)}" y="{round(y0)}"/><a:ext cx="{w}" cy="{h}"/>'
        f'<a:chOff x="{round(x0)}" y="{round(y0)}"/><a:chExt cx="{w}" cy="{h}"/></a:xfrm>'
    )
    body = "".join(k.xml for k in kids)
    ctx.stats["groups"] += 1
    return Item(f"{head}<p:grpSpPr>{frame}</p:grpSpPr>{body}</p:grpSp>", (x0, y0, x1, y1))


def rect_box(el: SvgElement) -> Box:
    return (num(el.get("x")), num(el.get("y")), num(el.get("width")), num(el.get("height")))


def corner_radii(el: SvgElement, w: float, h: float) -> tuple[float, float]:
    rx, ry = el.get("rx"), el.get("ry")
    rxv = num(rx if rx is not None else ry)
    ryv = num(ry if ry is not None else rx)
    return min(rxv, w / 2), min(ryv, h / 2)


def shape_segs(el: SvgElement, tag: str) -> list[Seg]:
    if tag == "rect":
        x, y, w, h = rect_box(el)
        rxv, ryv = corner_radii(el, w, h)
        return rrect_segs((x, y, w, h), rxv, ryv) if rxv > 0 and ryv > 0 else rect_segs(x, y, w, h)
    if tag in ("circle", "ellipse"):
        r = num(el.get("r"))
        rx, ry = (r, r) if tag == "circle" else (num(el.get("rx")), num(el.get("ry")))
        return ellipse_segs(num(el.get("cx")), num(el.get("cy")), rx, ry)
    if tag == "line":
        p1 = (num(el.get("x1")), num(el.get("y1")))
        return [Seg("M", (p1,)), Seg("L", ((num(el.get("x2")), num(el.get("y2"))),))]
    if tag in ("polyline", "polygon"):
        return points_to_segs(el.get("points"), close=tag == "polygon")
    return parse_path(el.get("d", "")) if tag == "path" else []
