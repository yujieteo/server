# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx.py
import copy
import sys
from pathlib import Path

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.opc.package import Part
from pptx.opc.packuri import PackURI
from pptx.presentation import Presentation as Deck
from pptx.util import Mm
from svg2pptx_native import main as native_main

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
SVGNS = "http://schemas.microsoft.com/office/drawing/2016/SVG/main"
SVG_TEXT = "{http://www.w3.org/2000/svg}text"
WIDE = 16 / 9
WIDE_TOLERANCE = 0.01


def split_halo(el: etree.Element) -> None:
    halo = copy.deepcopy(el)
    halo.tail = None
    _ = halo.attrib.pop("paint-order", None)
    halo.set("fill", "none")
    for c in halo.iter():
        if c is not halo and c.get("fill"):
            c.set("fill", "none")
    for a in ("paint-order", "stroke", "stroke-width", "stroke-linejoin"):
        _ = el.attrib.pop(a, None)
    el.addprevious(halo)


def ppt_safe(svg_bytes: bytes) -> tuple[bytes, int]:
    tree = etree.fromstring(svg_bytes)
    count = 0
    for el in list(tree.iter(SVG_TEXT)):
        if el.get("paint-order", "").startswith("stroke") and el.get("stroke"):
            split_halo(el)
            count += 1
    return etree.tostring(tree, xml_declaration=True, encoding="UTF-8"), count


def add_svg_blip(pic_element: etree.Element, rid: str) -> None:
    blip = pic_element.find(f".//{{{A}}}blip")
    if blip is None:
        message = "the picture has no blip"
        raise ValueError(message)
    ext_lst = etree.SubElement(blip, f"{{{A}}}extLst")
    ext = etree.SubElement(ext_lst, f"{{{A}}}ext", uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}")
    svg_blip = etree.SubElement(ext, f"{{{SVGNS}}}svgBlip", nsmap={"asvg": SVGNS})
    svg_blip.set(f"{{{R}}}embed", rid)


def add_slide(prs: Deck, index: int, svg: str, png: str) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    iw, ih = Image.open(png).size
    k = min(prs.slide_width / iw, prs.slide_height / ih)
    if abs(iw / ih - WIDE) < WIDE_TOLERANCE:
        w, h = prs.slide_width, prs.slide_height
    else:
        w, h = round(iw * k), round(ih * k)
    pic = slide.shapes.add_picture(png, (prs.slide_width - w) // 2, (prs.slide_height - h) // 2, w, h)
    pic.name = f"slide{index} (SVG)"
    data, halos = ppt_safe(Path(svg).read_bytes())
    _ = sys.stdout.write(f"slide {index}: {halos} haloed labels split for PowerPoint\n")
    part = Part(PackURI(f"/ppt/media/slide{index}-vector.svg"), "image/svg+xml", prs.part.package, data)
    add_svg_blip(pic.element, slide.part.relate_to(part, RT.IMAGE))


def main(argv: list[str]) -> None:
    if "--native" in argv:
        argv.remove("--native")
        _ = native_main(argv[1], argv[2::2])
        return
    out, files = argv[1], argv[2:]
    pairs = list(zip(files[0::2], files[1::2], strict=False))
    prs = Presentation()
    prs.slide_width, prs.slide_height = Mm(338.7), Mm(190.5)
    for i, (svg, png) in enumerate(pairs, 1):
        add_slide(prs, i, svg, png)
    prs.save(out)
    _ = sys.stdout.write(f"wrote {out} {len(pairs)} slides\n")


if __name__ == "__main__":
    main(sys.argv)
