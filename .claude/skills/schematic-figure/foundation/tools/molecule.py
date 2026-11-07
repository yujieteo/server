# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/molecule.py
import argparse
import sys
from pathlib import Path

from rdkit import Chem
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

RGB = tuple[float, float, float]
HEX_STEP = 2
HEX_MAX = 255


class Options:
    smiles: str = ""
    out: str = ""
    width: int = 300
    height: int = 200
    bond: float = 2.0
    font: float = 0.8
    color: str = "#1a1a1a"
    hetero_colour: bool = False
    highlight: str = ""
    hl_color: str = "#E69F00"
    rotate: float = 0
    no_h: bool = False


def parse() -> Options:
    parser = argparse.ArgumentParser()
    _ = parser.add_argument("smiles")
    _ = parser.add_argument("out")
    _ = parser.add_argument("--width", type=int, default=Options.width)
    _ = parser.add_argument("--height", type=int, default=Options.height)
    _ = parser.add_argument("--bond", type=float, default=Options.bond)
    _ = parser.add_argument("--font", type=float, default=Options.font)
    _ = parser.add_argument("--color", default=Options.color)
    _ = parser.add_argument("--hetero-colour", action="store_true")
    _ = parser.add_argument("--highlight", default=Options.highlight)
    _ = parser.add_argument("--hl-color", default=Options.hl_color)
    _ = parser.add_argument("--rotate", type=float, default=Options.rotate)
    _ = parser.add_argument("--no-h", action="store_true")
    return parser.parse_args(namespace=Options())


def hex_rgb(code: str) -> RGB:
    digits = code.lstrip("#")
    r, g, b = (int(digits[i : i + HEX_STEP], 16) / HEX_MAX for i in (0, 2, 4))
    return r, g, b


def draw(drawer: rdMolDraw2D.MolDraw2DSVG, mol: Chem.Mol, opts: Options) -> None:
    atoms = [int(i) for i in opts.highlight.split(",") if i.strip()]
    if not atoms:
        rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
        return
    colour = hex_rgb(opts.hl_color)
    bonds = [b.GetIdx() for b in mol.GetBonds() if b.GetBeginAtomIdx() in atoms and b.GetEndAtomIdx() in atoms]
    rdMolDraw2D.PrepareAndDrawMolecule(
        drawer,
        mol,
        highlightAtoms=atoms,
        highlightAtomColors=dict.fromkeys(atoms, colour),
        highlightBonds=bonds,
        highlightBondColors=dict.fromkeys(bonds, colour),
    )


def main() -> None:
    opts = parse()
    mol = Chem.MolFromSmiles(opts.smiles)
    if mol is None:
        raise SystemExit("invalid SMILES: " + opts.smiles)
    if opts.no_h:
        mol = Chem.RemoveHs(mol)
    prefer_coord_gen = True
    rdDepictor.SetPreferCoordGen(prefer_coord_gen)
    _ = rdDepictor.Compute2DCoords(mol)
    drawer = rdMolDraw2D.MolDraw2DSVG(opts.width, opts.height)
    draw_opts = drawer.drawOptions()
    draw_opts.clearBackground = False
    draw_opts.bondLineWidth = opts.bond
    draw_opts.baseFontSize = opts.font
    draw_opts.rotate = opts.rotate
    draw_opts.fixedFontSize = -1
    draw_opts.addStereoAnnotation = False
    if not opts.hetero_colour:
        draw_opts.useBWAtomPalette()
    draw(drawer, mol, opts)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()
    if opts.color.lower() not in ("#000000", "black"):
        svg = svg.replace("#000000", opts.color)
    _ = Path(opts.out).write_text(svg, encoding="utf-8")
    _ = sys.stdout.write(f"wrote {opts.out} {mol.GetNumAtoms()} atoms; valid: {Chem.MolToSmiles(mol)}\n")


if __name__ == "__main__":
    main()
