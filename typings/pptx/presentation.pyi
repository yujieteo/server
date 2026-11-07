from pathlib import Path
from typing import final

from pptx.opc.package import OpcPackage
from pptx.slide import SlideLayouts, Slides

def _save(self: Presentation, file: str | Path) -> None: ...

class PresentationPart:
    package: OpcPackage

@final
class Presentation:
    slide_width: int
    slide_height: int
    slide_layouts: SlideLayouts
    slides: Slides
    part: PresentationPart
    save = _save
