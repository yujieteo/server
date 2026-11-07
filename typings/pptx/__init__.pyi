from pathlib import Path

from pptx.presentation import Presentation as _Presentation

def _presentation(pptx: str | Path | None = None) -> _Presentation: ...

Presentation = _presentation
