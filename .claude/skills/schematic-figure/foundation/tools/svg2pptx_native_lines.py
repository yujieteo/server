# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_lines.py
import re
from dataclasses import dataclass, field, replace
from typing import NamedTuple

from lxml.etree import Element as SvgElement
from svg2pptx_native_base import EPS, XML_SPACE, Ctx, Style, local, num, style_get, style_pick

BOLD_WEIGHTS = ("bold", "700", "800", "900", "bolder")
SMALL_RUN = 0.95
TEXT_KIDS = ("tspan", "textPath")


@dataclass
class Run:
    size: float
    bold: bool
    italic: bool
    fill: str
    underline: bool
    spc: float
    text: str = ""
    y: float = 0.0


@dataclass
class Line:
    x: float
    runs: list[Run] = field(default_factory=list[Run])
    base: float | None = None


class TLine(NamedTuple):
    x: float
    runs: list[Run]
    base: float


@dataclass
class TextState:
    x: float
    y0: float
    size0: float
    preserve: bool
    y: float = 0.0
    line: Line | None = None
    lines: list[Line] = field(default_factory=list[Line])


@dataclass
class TFrame:
    node: SvgElement
    rs: Run
    kids: list[SvgElement]
    idx: int = 0


def new_line(ts: TextState, x: float) -> Line:
    ln = Line(x)
    ts.lines.append(ln)
    ts.line = ln
    return ln


def add_text(ts: TextState, text: str, rs: Run) -> None:
    ln = ts.line if ts.line is not None else new_line(ts, ts.x)
    s = text.replace("\u200b", "")
    if not ts.preserve:
        s = re.sub(r"\s+", " ", s)
        if not ln.runs or all(r.text == "" for r in ln.runs):
            s = s.lstrip()
    small = rs.size < ts.size0 * SMALL_RUN
    if ln.base is None and not small:
        ln.base = ts.y
    ln.runs.append(replace(rs, text=s, y=ts.y))


def move_to(ctx: Ctx, ts: TextState, node: SvgElement) -> None:
    nx, ny = node.get("x"), node.get("y")
    if nx is not None or ny is not None:
        cur = ts.line
        if cur is None or any(r.text for r in cur.runs):
            _ = new_line(ts, num(nx, ts.x))
        else:
            cur.x = num(nx, cur.x)
        if ny is not None:
            ts.y = num(ny) - ts.y0
    dy = node.get("dy")
    if dy is not None:
        ts.y += num(dy)
    dx = node.get("dx")
    if dx is not None and abs(num(dx)) > EPS:
        ctx.approx["tspan dx ignored"] += 1


def styled_run(node: SvgElement, rs: Run) -> Run:
    out = replace(rs)
    if node.get("font-size"):
        out.size = num(node.get("font-size"), rs.size)
    weight = node.get("font-weight")
    if weight:
        out.bold = weight in BOLD_WEIGHTS
    if node.get("font-style"):
        out.italic = node.get("font-style") == "italic"
    fill = node.get("fill")
    if fill:
        out.fill = fill
    return out


def enter_node(ctx: Ctx, ts: TextState, node: SvgElement, rs: Run, *, root: bool) -> TFrame:
    if not root:
        move_to(ctx, ts, node)
        rs = styled_run(node, rs)
    if node.text:
        add_text(ts, node.text, rs)
    return TFrame(node, rs, list(node))


def walk_text(ctx: Ctx, ts: TextState, el: SvgElement, base: Run) -> None:
    stack = [enter_node(ctx, ts, el, base, root=True)]
    while stack:
        fr = stack[-1]
        if fr.idx < len(fr.kids):
            ch = fr.kids[fr.idx]
            fr.idx += 1
            if local(ch.tag) in TEXT_KIDS:
                stack.append(enter_node(ctx, ts, ch, fr.rs, root=False))
            elif ch.tail:
                add_text(ts, ch.tail, fr.rs)
            continue
        _ = stack.pop()
        if stack:
            if not (fr.node.text or fr.kids):
                add_text(ts, "", fr.rs)
            if fr.node.tail:
                add_text(ts, fr.node.tail, stack[-1].rs)


def collect_lines(ctx: Ctx, el: SvgElement, st: Style) -> tuple[list[TLine], float]:
    size0 = num(style_get(st, "font-size"), 12.0)
    style_attr = el.get("style") or ""
    preserve = el.get(XML_SPACE) == "preserve" or "white-space: pre" in style_attr
    ts = TextState(num(el.get("x")), num(el.get("y")), size0, preserve)
    _ = new_line(ts, ts.x)
    base = Run(
        size0,
        style_pick(st, "font-weight", "normal") in BOLD_WEIGHTS,
        style_get(st, "font-style") == "italic",
        style_pick(st, "fill", "#000000"),
        "underline" in style_pick(st, "text-decoration", ""),
        num(style_get(st, "letter-spacing"), 0.0),
    )
    walk_text(ctx, ts, el, base)
    lines: list[TLine] = []
    for ln in ts.lines:
        if any(r.text for r in ln.runs):
            if not preserve:
                ln.runs[-1].text = ln.runs[-1].text.rstrip()
            lines.append(TLine(ln.x, ln.runs, ln.base if ln.base is not None else ln.runs[0].y))
    return lines, size0
