# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_cut.py
from typing import NamedTuple

from lxml.etree import Element as SvgElement
from svg2pptx_native_base import (
    Ctx,
    Item,
    Matrix,
    Node,
    Poly,
    Seg,
    Style,
    local,
    mat_apply,
    mat_inv,
    mat_mul,
    name_of,
    num,
    parse_transform,
    style_get,
    style_pick,
    url_id,
    with_prop,
)
from svg2pptx_native_clip import Sub, clip_polygon, clip_polyline, flatten, inside, is_convex
from svg2pptx_native_color import parse_color
from svg2pptx_native_geom import segs_bbox
from svg2pptx_native_shapes import emit_segments, shape_segs, wrap_group

CLIP_SHAPES = ("rect", "circle", "ellipse", "path", "polygon")
CLOSED_TAGS = ("rect", "circle", "ellipse", "polygon")
CLIP_STEPS = 16
CUT_STEPS = 12
MIN_POLY = 3


class ClipResult(NamedTuple):
    handled: bool
    item: Item | None


NOT_HANDLED = ClipResult(handled=False, item=None)


def clip_polygon_of(ctx: Ctx, cpid: str, m: Matrix) -> Poly | None:
    cp = ctx.defs.get(cpid)
    if cp is None or local(cp.tag) != "clipPath":
        return None
    kids = [c for c in cp if local(c.tag) in CLIP_SHAPES]
    if len(kids) != 1:
        return None
    k = kids[0]
    mk = mat_mul(mat_mul(m, parse_transform(cp.get("transform"))), parse_transform(k.get("transform")))
    try:
        subs = flatten(shape_segs(k, local(k.tag)), CLIP_STEPS)
    except ValueError:
        return None
    if len(subs) != 1:
        return None
    poly = [mat_apply(mk, x, y) for x, y in subs[0].pts]
    if len(poly) > 1 and poly[0] == poly[-1]:
        poly = poly[:-1]
    if len(poly) < MIN_POLY or not is_convex(poly):
        return None
    return poly


def polyline_segs(pts: Poly) -> list[Seg]:
    return [Seg("M", (pts[0],)), *[Seg("L", (q,)) for q in pts[1:]]]


def clipped_fill_segs(subs: list[Sub], clips: list[Poly]) -> list[Seg]:
    fsegs: list[Seg] = []
    for sub in subs:
        pts = sub.pts
        poly = pts[:-1] if len(pts) > 1 and pts[0] == pts[-1] else pts
        for c in clips:
            poly = clip_polygon(poly, c) if poly else []
        if len(poly) >= MIN_POLY:
            fsegs += [*polyline_segs(poly), Seg("Z", ())]
    return fsegs


def clipped_stroke_segs(subs: list[Sub], clips: list[Poly]) -> list[Seg]:
    ssegs: list[Seg] = []
    for sub in subs:
        pieces = [sub.pts]
        flags = [sub.closed]
        for c in clips:
            pieces = [q for pc, cl in zip(pieces, flags, strict=True) for q in clip_polyline(pc, closed=cl, clip=c)]
            flags = [False] * len(pieces)
        for pc in pieces:
            ssegs += polyline_segs(pc)
    return ssegs


def has_paint(st: Style, name: str, default: str) -> bool:
    return parse_color(style_pick(st, name, default)) is not None or url_id(style_pick(st, name, "")) is not None


def clipped_items(ctx: Ctx, tag: str, node: Node, subs: list[Sub], clips: list[Poly]) -> list[Item]:
    el, st, m = node
    ub = segs_bbox(shape_segs(el, tag))
    if ub is None:
        return []
    ubox = (ub[0], ub[1], ub[2] - ub[0], ub[3] - ub[1])
    has_fill = has_paint(st, "fill", "#000000")
    has_stroke = has_paint(st, "stroke", "none") and num(style_get(st, "stroke-width"), 1.0) > 0
    closed_shape = tag in CLOSED_TAGS or any(sub.closed for sub in subs)
    items: list[Item] = []
    if has_fill and closed_shape:
        fsegs = clipped_fill_segs(subs, clips)
        item = emit_segments(ctx, Node(el, with_prop(st, "stroke", "none"), m), fsegs, ubox) if fsegs else None
        if item is not None:
            items.append(item)
    if has_stroke:
        ssegs = clipped_stroke_segs(subs, clips)
        item = emit_segments(ctx, Node(el, with_prop(st, "fill", "none"), m), ssegs, ubox) if ssegs else None
        if item is not None:
            items.append(item)
    return items


def item_or_group(ctx: Ctx, el: SvgElement, tag: str, items: list[Item]) -> Item | None:
    if not items:
        return None
    if len(items) == 1:
        return items[0]
    return wrap_group(ctx, items, name_of(el, tag) + " (clipped)")


def emit_clipped(ctx: Ctx, tag: str, node: Node) -> ClipResult:
    el, st, m = node
    inv = mat_inv(m)
    if inv is None:
        return NOT_HANDLED
    clips = [[mat_apply(inv, x, y) for x, y in poly] for poly in st.clips]
    try:
        segs = shape_segs(el, tag)
    except ValueError:
        return NOT_HANDLED
    subs = flatten(segs, CUT_STEPS)
    if not subs:
        return ClipResult(handled=True, item=None)
    if all(inside(p, c) for c in clips for sub in subs for p in sub.pts):
        return NOT_HANDLED
    items = clipped_items(ctx, tag, node, subs, clips)
    ctx.stats["shapes cut by a clip path"] += 1
    return ClipResult(handled=True, item=item_or_group(ctx, el, tag, items))
