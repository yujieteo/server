# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_walk.py
import os
from dataclasses import dataclass, field, replace

from lxml.etree import Element as SvgElement
from svg2pptx_native_base import (
    MAX_GROUP_DEPTH,
    OPAQUE,
    SKIP_TAGS,
    Ctx,
    Item,
    Matrix,
    MaybeElement,
    Node,
    Style,
    has_str_tag,
    href_of,
    local,
    mat_mul,
    name_of,
    num,
    parse_transform,
    style_of,
    url_id,
)
from svg2pptx_native_cut import clip_polygon_of
from svg2pptx_native_leaf import emit_leaf
from svg2pptx_native_shapes import wrap_group

CAUGHT = (ValueError, ArithmeticError, LookupError, TypeError, AttributeError, RuntimeError, OSError)
MAX_NEST = 200


@dataclass
class Frame:
    kids: list[SvgElement]
    m: Matrix
    st: Style
    depth: int
    label: str
    group: MaybeElement
    out: list[Item] = field(default_factory=list[Item])
    idx: int = 0


def debug_on() -> bool:
    return bool(os.environ.get("SVG2PPTX_DEBUG"))


def styled_node(ctx: Ctx, ch: SvgElement, fr: Frame) -> Node:
    st = style_of(ch, fr.st)
    mc = mat_mul(fr.m, parse_transform(ch.get("transform")))
    cpid = url_id(ch.get("clip-path"))
    if cpid:
        poly = clip_polygon_of(ctx, cpid, mc)
        if poly:
            st = replace(st, clips=(*st.clips, poly))
        else:
            ctx.warn["clip-path dropped (not a single convex shape)"] += 1
    return Node(ch, st, mc)


def push_group(ctx: Ctx, stack: list[Frame], fr: Frame, node: Node, tag: str) -> None:
    el = node.el
    if url_id(el.get("clip-path")):
        ctx.stats["clip paths applied by cutting the geometry"] += 1
    if el.get("mask"):
        ctx.warn["mask dropped"] += 1
    if el.get("opacity") and num(el.get("opacity"), 1.0) < OPAQUE:
        ctx.approx["group opacity pushed down to children"] += 1
    if el.get("filter") and el.get("filter") != "none":
        ctx.approx["group filter applied to each child"] += 1
    if len(stack) > MAX_NEST:
        msg = "elements nested too deep"
        raise RecursionError(msg)
    stack.append(Frame(list(el), node.m, node.st, fr.depth + 1, tag, el))


def push_use(ctx: Ctx, stack: list[Frame], fr: Frame, node: Node) -> None:
    el = node.el
    href = href_of(el)
    target = ctx.defs.get(href[1:]) if href.startswith("#") else None
    if target is None:
        ctx.warn["use: unknown target"] += 1
        return
    if len(stack) > MAX_NEST:
        msg = "elements nested too deep"
        raise RecursionError(msg)
    m = mat_mul(node.m, (1, 0, 0, 1, num(el.get("x")), num(el.get("y"))))
    stack.append(Frame([target], m, node.st, fr.depth, "use", None))


def emit_node(ctx: Ctx, stack: list[Frame], fr: Frame, tag: str, node: Node) -> None:
    if tag in ("g", "a"):
        push_group(ctx, stack, fr, node, tag)
    elif tag == "use":
        push_use(ctx, stack, fr, node)
    else:
        item = emit_leaf(ctx, tag, node)
        if item is not None:
            fr.out.append(item)


def descend(ctx: Ctx, stack: list[Frame], fr: Frame) -> None:
    ch = fr.kids[fr.idx]
    fr.idx += 1
    if not has_str_tag(ch.tag):
        return
    tag = local(ch.tag)
    if tag in SKIP_TAGS or ch.get("display") == "none" or ch.get("visibility") == "hidden":
        return
    node = styled_node(ctx, ch, fr)
    try:
        emit_node(ctx, stack, fr, tag, node)
    except CAUGHT as err:
        ctx.warn[f"element failed: {tag} ({type(err).__name__})"] += 1
        if debug_on():
            raise


def frame_items(ctx: Ctx, fr: Frame) -> list[Item]:
    if fr.group is None:
        return fr.out
    kids = fr.out
    if not kids:
        return []
    deep = fr.depth - 1 >= MAX_GROUP_DEPTH
    if len(kids) == 1 or deep:
        if deep:
            ctx.stats[f"groups flattened (deeper than {MAX_GROUP_DEPTH})"] += 1
        return kids
    return [wrap_group(ctx, kids, name_of(fr.group, "Group"))]


def close_frame(ctx: Ctx, stack: list[Frame]) -> list[Item]:
    items = frame_items(ctx, stack[-1])
    _ = stack.pop()
    if stack:
        stack[-1].out.extend(items)
    return items


def walk(ctx: Ctx, root: SvgElement, m: Matrix, st: Style) -> list[Item]:
    stack = [Frame(list(root), m, st, 0, "", None)]
    result: list[Item] = []
    while stack:
        fr = stack[-1]
        try:
            if fr.idx < len(fr.kids):
                descend(ctx, stack, fr)
            else:
                result = close_frame(ctx, stack)
        except CAUGHT as err:
            if len(stack) == 1 or debug_on():
                raise
            failed = stack.pop()
            ctx.warn[f"element failed: {failed.label} ({type(err).__name__})"] += 1
    return result
