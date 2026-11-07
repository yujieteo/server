from collections.abc import Iterator
from typing import IO, final

from lxml.etree import Element
from pptx.opc.package import Part
from pptx.shapes.shapetree import SlideShapes

def _relate_to(self: SlidePart, target: Part, reltype: str) -> str: ...
def _get_or_add_image_part(self: SlidePart, image_file: IO[bytes]) -> tuple[Part, str]: ...
def _layout_getitem(self: SlideLayouts, idx: int) -> SlideLayout: ...
def _slides_len(self: Slides) -> int: ...
def _slides_iter(self: Slides) -> Iterator[Slide]: ...
def _slides_getitem(self: Slides, idx: int) -> Slide: ...
def _add_slide(self: Slides, slide_layout: SlideLayout) -> Slide: ...

@final
class SlidePart:
    relate_to = _relate_to
    get_or_add_image_part = _get_or_add_image_part

class Slide:
    element: Element
    shapes: SlideShapes
    part: SlidePart

@final
class SlideLayouts:
    __getitem__ = _layout_getitem

class SlideLayout: ...

@final
class Slides:
    __len__ = _slides_len
    __iter__ = _slides_iter
    __getitem__ = _slides_getitem
    add_slide = _add_slide
