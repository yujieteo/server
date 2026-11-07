from collections.abc import Iterator
from typing import final

from pptx.shapes.base import BaseShape

def _iter(self: GroupShapes) -> Iterator[BaseShape]: ...

@final
class GroupShapes:
    __iter__ = _iter

class GroupShape(BaseShape):
    shapes: GroupShapes
