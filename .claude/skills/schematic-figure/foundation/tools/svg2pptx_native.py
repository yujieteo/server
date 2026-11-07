# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native.py
import re
import sys
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

from lxml import etree
from lxml.etree import Element as SvgElement
from pptx import Presentation
from pptx.oxml import parse_xml
from pptx.presentation import Presentation as Deck
from pptx.slide import SlidePart
from pptx.util import Mm
from svg2pptx_native_base import NS_DECL, SLIDE_H_MM, SLIDE_W_MM, Ctx, Style, has_str_tag, num
from svg2pptx_native_geom import fit_box
from svg2pptx_native_walk import walk

USAGE = (
    "python tools/svg2pptx_native.py out.pptx fig.svg [fig2.svg ...]\n"
    "python tools/svg2pptx.py --native out.pptx fig.svg fig.png [fig2.svg fig2.png ...]"
)
MIN_ARGS = 2
BLANK_LAYOUT = 6
P_NS = "http://schemas.openxmlformats.org/presentationml/2006/main"
BACKGROUND = (
    f'<p:bg {NS_DECL}><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
)

type SlideReport = tuple[Counter[str], Counter[str], Counter[str]]


def say(text: str) -> None:
    _ = sys.stdout.write(text)


def shout(text: str) -> None:
    _ = sys.stderr.write(text)


def make_ctx(root: SvgElement, slide_part: SlidePart, slide_w: int, slide_h: int) -> Ctx:
    defs: dict[str, SvgElement] = {}
    for el in root.iter():
        if has_str_tag(el.tag):
            ident = el.get("id")
            if ident:
                defs[ident] = el
    vb = root.get("viewBox")
    if vb:
        vx, vy, vw, vh = (float(v) for v in re.split(r"[\s,]+", vb.strip()))
    else:
        vx = vy = 0.0
        vw, vh = num(root.get("width"), 100.0), num(root.get("height"), 100.0)
    fx, fy, fw, fh = fit_box(vw, vh, slide_w, slide_h)
    k = fw / vw
    return Ctx(slide_part, defs, (k, 0.0, 0.0, fh / vh, fx - vx * k, fy - vy * fh / vh))


def build_slide(prs: Deck, svg_path: str | Path) -> SlideReport:
    root = etree.parse(str(svg_path)).getroot()
    slide = prs.slides.add_slide(prs.slide_layouts[BLANK_LAYOUT])
    ctx = make_ctx(root, slide.part, prs.slide_width, prs.slide_height)
    st0 = Style({"fill": "#000000", "font-family": "Arial", "font-size": "12"})
    items = walk(ctx, root, ctx.m0, st0)
    tree = slide.shapes.element
    for item in items:
        tree.append(parse_xml(f"<p:wrap {NS_DECL}>{item.xml}</p:wrap>")[0])
    csld = slide.element.find(f"{{{P_NS}}}cSld")
    if csld is not None:
        csld.insert(0, parse_xml(BACKGROUND))
    return ctx.stats, ctx.warn, ctx.approx


def report_slide(i: int, svg: str, res: SlideReport) -> None:
    stats, warn, approx = res
    body = ", ".join(f"{v} {k}" for k, v in stats.items())
    say(f"slide {i} ({Path(svg).name}): {body}\n")
    for k, v in warn.items():
        say(f"  WARNING dropped: {k} x{v}\n")
    for k, v in approx.items():
        say(f"  note approximated: {k} x{v}\n")


def convert(out: str, svgs: Sequence[str], *, quiet: bool = False) -> list[SlideReport]:
    prs = Presentation()
    prs.slide_width, prs.slide_height = Mm(SLIDE_W_MM), Mm(SLIDE_H_MM)
    allres: list[SlideReport] = []
    for i, svg in enumerate(svgs, 1):
        res = build_slide(prs, svg)
        allres.append(res)
        if not quiet:
            report_slide(i, svg, res)
    prs.save(out)
    if not quiet:
        say(f"wrote {out} {len(svgs)} slides (native objects)\n")
    return allres


def main(out: str, svgs: Sequence[str]) -> list[SlideReport]:
    return convert(out, svgs)


def cli(args: list[str]) -> None:
    if len(args) < MIN_ARGS:
        shout(USAGE + "\n")
        sys.exit(1)
    _ = main(args[0], args[1:])


if __name__ == "__main__":
    cli(sys.argv[1:])
