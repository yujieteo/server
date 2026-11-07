from collections.abc import Iterator
from pathlib import Path
from typing import final

from lxml.etree import Element
from pptx.shapes.base import BaseShape

def _iter(self: SlideShapes) -> Iterator[BaseShape]: ...
def _getitem(self: SlideShapes, idx: int) -> BaseShape: ...
def _add_picture(
    self: SlideShapes, image_file: str | Path, left: int, top: int, width: int, height: int
) -> BaseShape: ...

@final
class SlideShapes:
    element: Element
    __iter__ = _iter
    __getitem__ = _getitem
    add_picture = _add_picture
