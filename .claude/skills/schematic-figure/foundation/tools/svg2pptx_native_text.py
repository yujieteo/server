# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_text.py
import math
from typing import NamedTuple
from xml.sax.saxutils import escape, quoteattr

from lxml.etree import Element as SvgElement
from svg2pptx_native_base import (
    EMU_PT,
    PCT,
    Ctx,
    Item,
    Matrix,
    MaybeElement,
    Node,
    Style,
    decompose,
    href_of,
    local,
    mat_apply,
    mat_mul,
    mat_scale,
    name_of,
    new_id,
    num,
    rot_attr,
    style_get,
    style_pick,
    with_prop,
)
from svg2pptx_native_clip import inside
from svg2pptx_native_color import parse_color
from svg2pptx_native_font import first_family, text_width
from svg2pptx_native_geom import rot_bbox
from svg2pptx_native_lines import Run, TLine, collect_lines
from svg2pptx_native_paint import solid_fill
from svg2pptx_native_path import parse_path
from svg2pptx_native_shapes import xfrm_xml

BASE_ASC = 0.9766
ASC_PER_P = 0.3825
SINGLE_LINE = 1.2
TEXT_NUDGE_EMU = 4400
SCRIPT_AUTO = 0.66
SHIFT_EPS = 1e-6
X_EPS = 1e-6
MIN_SZ = 100
PAD = 0.4
NAME_LEN = 40
MIN_PATH_POINTS = 2
ANCHOR_ALIGN = {"middle": "ctr", "end": "r"}


class Place(NamedTuple):
    family: str
    anchor: str
    s: float
    ax: float
    y0: float
    rot: float


class Layout(NamedTuple):
    family: str
    s: float
    algn: str
    p: float
    lsize: list[float]
    multi: bool
    csx: float
    csy: float
    w: float
    h: float
    rot: float


class RunCtx(NamedTuple):
    family: str
    s: float
    base: float
    lsize: float


def textpath_frame(ctx: Ctx, tp: SvgElement, st: Style, m: Matrix) -> tuple[Matrix, Style]:
    ctx.approx["textPath -> straight text along the chord"] += 1
    href = href_of(tp)
    pth = ctx.defs.get(href[1:]) if href.startswith("#") else None
    anchor = tp.get("text-anchor")
    if anchor:
        st = with_prop(st, "text-anchor", anchor)
    if pth is None:
        return m, st
    pts = [s.pts[-1] for s in parse_path(pth.get("d", "")) if s.op in ("M", "L", "C")]
    if len(pts) < MIN_PATH_POINTS:
        return m, st
    (ax_, ay_), (bx_, by_) = pts[0], pts[-1]
    off = tp.get("startOffset", "0")
    f = num(off, 0.0) if off.strip().endswith("%") else 0.0
    px, py = ax_ + (bx_ - ax_) * f, ay_ + (by_ - ay_) * f
    ang = math.atan2(by_ - ay_, bx_ - ax_)
    c, sn = math.cos(ang), math.sin(ang)
    return mat_mul(m, (c, sn, -sn, c, px, py)), st


def last_text_path(el: SvgElement) -> MaybeElement:
    tp = None
    for ch in el:
        if local(ch.tag) == "textPath":
            tp = ch
    return tp


def line_width(ln: TLine, family: str) -> float:
    return sum(text_width(r.text, family, r.size, bold=r.bold, italic=r.italic) for r in ln.runs)


def layout_text(lines: list[TLine], size0: float, place: Place, m: Matrix) -> Layout:
    n = len(lines)
    pitch = (lines[-1].base - lines[0].base) / (n - 1) if n > 1 else SINGLE_LINE * size0
    lsize = [max(r.size for r in ln.runs if r.text) for ln in lines]
    p = pitch / (SINGLE_LINE * lsize[0])
    asc = (BASE_ASC + ASC_PER_P * (p - 1.0)) * lsize[0]
    top = place.y0 + lines[0].base - asc + TEXT_NUDGE_EMU / place.s
    widths = [line_width(ln, place.family) for ln in lines]
    wb = max(widths) + PAD * size0
    hb = (pitch * (n - 1) + SINGLE_LINE * lsize[-1]) if n > 1 else SINGLE_LINE * lsize[0]
    if place.anchor == "middle":
        cxl = place.ax
    elif place.anchor == "end":
        cxl = place.ax - wb / 2.0
    else:
        cxl = place.ax + wb / 2.0
    csx, csy = mat_apply(m, cxl, top + hb / 2.0)
    algn = ANCHOR_ALIGN.get(place.anchor, "l")
    return Layout(place.family, place.s, algn, p, lsize, n > 1, csx, csy, wb * place.s, hb * place.s, place.rot)


def run_xml(ctx: Ctx, st: Style, r: Run, rc: RunCtx) -> str:
    shift = r.y - rc.base
    shifted = abs(shift) > SHIFT_EPS
    size_r = r.size / SCRIPT_AUTO if shifted else r.size
    attrs = f' lang="en-US" sz="{max(MIN_SZ, round(size_r * rc.s / EMU_PT * 100))}"'
    if r.bold:
        attrs += ' b="1"'
    if r.italic:
        attrs += ' i="1"'
    if r.underline:
        attrs += ' u="sng"'
    if shifted:
        attrs += f' baseline="{round(-shift / rc.lsize * PCT)}"'
        ctx.stats["sub/superscript runs"] += 1
    if r.spc:
        attrs += f' spc="{round(r.spc * rc.s / EMU_PT * 100)}"'
    c = parse_color(r.fill) or ("000000", 1.0)
    fill = solid_fill(c[0], c[1] * st.opacity * num(style_get(st, "fill-opacity"), 1.0))
    fam = quoteattr(rc.family)
    return (
        f'<a:r><a:rPr{attrs} dirty="0">{fill}<a:latin typeface={fam}/><a:cs typeface={fam}/></a:rPr>'
        f"<a:t>{escape(r.text)}</a:t></a:r>"
    )


def para_xml(ctx: Ctx, st: Style, ln: TLine, li: int, lay: Layout) -> str:
    rc = RunCtx(lay.family, lay.s, ln.base, lay.lsize[li])
    runs = "".join(run_xml(ctx, st, r, rc) for r in ln.runs if r.text)
    spacing = round(lay.p * PCT) if lay.multi else PCT
    lnspc = f'<a:lnSpc><a:spcPct val="{spacing}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef>'
    end_sz = max(MIN_SZ, round(lay.lsize[li] * lay.s / EMU_PT * 100))
    return (
        f'<a:p><a:pPr algn="{lay.algn}">{lnspc}</a:pPr>{runs}<a:endParaRPr lang="en-US" sz="{end_sz}" dirty="0"/></a:p>'
    )


def text_shape(ctx: Ctx, el: SvgElement, lay: Layout, paras: str, content: str) -> Item:
    sid = new_id(ctx)
    named = el.get("data-name") or el.get("id")
    nm = quoteattr(name_of(el, "Text") if named else "Text: " + content[:NAME_LEN])
    x, y = lay.csx - lay.w / 2, lay.csy - lay.h / 2
    xfrm = xfrm_xml(rot_attr(lay.rot), round(x), round(y), max(1, round(lay.w)), max(1, round(lay.h)))
    xml = (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name={nm}/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>'
        f'<p:spPr>{xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
        '<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t">'
        f"<a:noAutofit/></a:bodyPr><a:lstStyle/>{paras}</p:txBody></p:sp>"
    )
    ctx.stats["text boxes"] += 1
    return Item(xml, rot_bbox(x, y, lay.w, lay.h, lay.rot))


def emit_text(ctx: Ctx, node: Node) -> Item | None:
    el, st, m = node
    tp = last_text_path(el)
    if tp is not None:
        m, st = textpath_frame(ctx, tp, st, m)
    lines, size0 = collect_lines(ctx, el, st)
    if not lines:
        return None
    if st.clips:
        ax_, ay_ = mat_apply(m, lines[0].x, num(el.get("y")))
        if not all(inside((ax_, ay_), poly) for poly in st.clips):
            ctx.warn["text outside its clip path dropped"] += 1
            return None
    if style_pick(st, "paint-order", "").startswith("stroke") and style_pick(st, "stroke", "none") != "none":
        ctx.approx["text halo (paint-order stroke) dropped"] += 1
    d = decompose(m)
    if not d.shear_ok or d.flip:
        ctx.approx["sheared or mirrored text drawn unsheared"] += 1
    ax = lines[0].x if tp is None else 0.0
    if any(abs(ln.x - ax) > X_EPS for ln in lines):
        ctx.approx["multi-line text with different x: first x used"] += 1
    family = first_family(style_get(st, "font-family"))
    y0 = num(el.get("y")) if tp is None else 0.0
    place = Place(family, style_pick(st, "text-anchor", "start"), mat_scale(m), ax, y0, d.rot)
    lay = layout_text(lines, size0, place, m)
    paras = "".join(para_xml(ctx, st, ln, li, lay) for li, ln in enumerate(lines))
    content = " / ".join("".join(r.text for r in ln.runs) for ln in lines)
    return text_shape(ctx, el, lay, paras, content)
