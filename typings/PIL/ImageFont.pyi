from typing import final

def _getlength(self: FreeTypeFont, text: str) -> float: ...

@final
class FreeTypeFont:
    getlength = _getlength

def truetype(font: str, size: int) -> FreeTypeFont: ...
