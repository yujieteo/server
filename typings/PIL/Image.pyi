from pathlib import Path
from typing import final

def _split(self: Image) -> tuple[Image, ...]: ...
def _paste(self: Image, im: Image, box: tuple[int, int] | None = None, mask: Image | None = None) -> None: ...
def _convert(self: Image, mode: str) -> Image: ...
def _save(self: Image, fp: str | Path, *, compression: str, dpi: tuple[int, int]) -> None: ...

@final
class Image:
    mode: str
    size: tuple[int, int]
    info: dict[str, tuple[float, float]]
    split = _split
    paste = _paste
    convert = _convert
    save = _save

def open(fp: str | Path) -> Image: ...
def new(mode: str, size: tuple[int, int], color: str) -> Image: ...
