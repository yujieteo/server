# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_leaf.py
from svg2pptx_native_base import Ctx, Item, Node, Seg, num, url_id
from svg2pptx_native_cut import emit_clipped
from svg2pptx_native_geom import ellipse_segs, points_to_segs, rect_segs
from svg2pptx_native_path import parse_path
from svg2pptx_native_shapes import BoxSpec, corner_radii, emit_box_shape, emit_image, emit_segments, rect_box
from svg2pptx_native_text import emit_text

CUT_TAGS = ("rect", "circle", "ellipse", "line", "polyline", "polygon", "path")
CORNER_TOL = 0.02
ADJ_MAX = 50000
ADJ_UNIT = 100000
MIN_POLY_SEGS = 2


def box_or_freeform(ctx: Ctx, node: Node, spec: BoxSpec, fallback: list[Seg]) -> Item | None:
    item = emit_box_shape(ctx, node, spec)
    return item if item is not None else emit_segments(ctx, node, fallback)


def leaf_rect(ctx: Ctx, node: Node) -> Item | None:
    x, y, w, h = rect_box(node.el)
    if w <= 0 or h <= 0:
        return None
    rxv, ryv = corner_radii(node.el, w, h)
    fallback = rect_segs(x, y, w, h)
    if rxv <= 0 or ryv <= 0:
        return box_or_freeform(ctx, node, BoxSpec((x, y, w, h), "rect", None), fallback)
    if abs(rxv - ryv) > CORNER_TOL * max(rxv, ryv):
        ctx.approx["rounded rect with elliptic corners: circular corners used"] += 1
    adj = round(min(ADJ_MAX, min(rxv, ryv) / min(w, h) * ADJ_UNIT))
    return box_or_freeform(ctx, node, BoxSpec((x, y, w, h), "roundRect", adj), fallback)


def leaf_round(ctx: Ctx, node: Node, tag: str) -> Item | None:
    el = node.el
    cx_, cy_ = num(el.get("cx")), num(el.get("cy"))
    if tag == "circle":
        rx = ry = num(el.get("r"))
    else:
        rx, ry = num(el.get("rx")), num(el.get("ry"))
    if rx <= 0 or ry <= 0:
        return None
    spec = BoxSpec((cx_ - rx, cy_ - ry, 2 * rx, 2 * ry), "ellipse", None)
    return box_or_freeform(ctx, node, spec, ellipse_segs(cx_, cy_, rx, ry))


def leaf_line(ctx: Ctx, node: Node) -> Item | None:
    x1, y1, x2, y2 = (num(node.el.get(a)) for a in ("x1", "y1", "x2", "y2"))
    return emit_segments(ctx, node, [Seg("M", ((x1, y1),)), Seg("L", ((x2, y2),))])


def leaf_poly(ctx: Ctx, node: Node, tag: str) -> Item | None:
    segs = points_to_segs(node.el.get("points"), close=tag == "polygon")
    if len(segs) < MIN_POLY_SEGS:
        return None
    return emit_segments(ctx, node, segs)


def leaf_path(ctx: Ctx, node: Node) -> Item | None:
    try:
        segs = parse_path(node.el.get("d", ""))
    except ValueError:
        ctx.warn["path: bad data dropped"] += 1
        return None
    if not segs:
        return None
    return emit_segments(ctx, node, segs)


def leaf_shape(ctx: Ctx, tag: str, node: Node) -> Item | None:
    if tag == "rect":
        return leaf_rect(ctx, node)
    if tag in ("circle", "ellipse"):
        return leaf_round(ctx, node, tag)
    if tag == "line":
        return leaf_line(ctx, node)
    if tag in ("polyline", "polygon"):
        return leaf_poly(ctx, node, tag)
    return leaf_path(ctx, node)


def leaf_by_tag(ctx: Ctx, tag: str, node: Node) -> Item | None:
    if tag in CUT_TAGS:
        return leaf_shape(ctx, tag, node)
    if tag == "text":
        return emit_text(ctx, node)
    if tag == "image":
        return emit_image(ctx, node)
    ctx.warn[f"unknown element <{tag}> skipped"] += 1
    return None


def emit_leaf(ctx: Ctx, tag: str, node: Node) -> Item | None:
    if node.st.mask_ref:
        ctx.warn["mask dropped"] += 1
    if url_id(node.el.get("clip-path")):
        ctx.stats["clip paths applied by cutting the geometry"] += 1
    if node.st.clips and tag in CUT_TAGS:
        cut = emit_clipped(ctx, tag, node)
        if cut.handled:
            return cut.item
    return leaf_by_tag(ctx, tag, node)
