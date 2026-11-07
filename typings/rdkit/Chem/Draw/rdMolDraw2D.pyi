from collections.abc import Sequence
from dataclasses import dataclass
from typing import final

from rdkit.Chem import Mol

def _use_bw(self: MolDrawOptions) -> None: ...
def _options(self: MolDraw2DSVG) -> MolDrawOptions: ...
def _finish(self: MolDraw2DSVG) -> None: ...
def _text(self: MolDraw2DSVG) -> str: ...

@final
class MolDrawOptions:
    clearBackground: bool
    bondLineWidth: float
    baseFontSize: float
    rotate: float
    fixedFontSize: int
    addStereoAnnotation: bool
    useBWAtomPalette = _use_bw

@final
@dataclass
class MolDraw2DSVG:
    width: int
    height: int
    drawOptions = _options
    FinishDrawing = _finish
    GetDrawingText = _text

def _prepare_and_draw_molecule(
    drawer: MolDraw2DSVG,
    mol: Mol,
    *,
    highlightAtoms: Sequence[int] | None = None,
    highlightAtomColors: dict[int, tuple[float, float, float]] | None = None,
    highlightBonds: Sequence[int] | None = None,
    highlightBondColors: dict[int, tuple[float, float, float]] | None = None,
) -> None: ...
PrepareAndDrawMolecule = _prepare_and_draw_molecule
