# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/mol3d_rdkit.py
import contextlib

from mol3d_smiles import MolResult
from rdkit import Chem
from rdkit.Chem import AllChem

AROMATIC_ORDER = 1.5


def embed_rdkit(smi: str, seed: int = 0) -> MolResult:
    mol = Chem.MolFromSmiles(smi)
    if mol is None:
        msg = "rdkit cannot parse " + smi
        raise ValueError(msg)
    m = Chem.AddHs(mol)
    p = AllChem.ETKDGv3()
    p.randomSeed = seed
    if AllChem.EmbedMolecule(m, p) != 0:
        msg = "rdkit embed failed"
        raise RuntimeError(msg)
    with contextlib.suppress(RuntimeError, ValueError, TypeError):
        _ = AllChem.MMFFOptimizeMolecule(m)
    xyz = m.GetConformer().GetPositions()
    bonds: list[list[float]] = []
    for b in m.GetBonds():
        order = AROMATIC_ORDER if b.GetIsAromatic() else int(b.GetBondTypeAsDouble())
        bonds.append([b.GetBeginAtomIdx(), b.GetEndAtomIdx(), order])
    return {
        "atoms": [a.GetSymbol() for a in m.GetAtoms()],
        "xyz": (xyz - xyz.mean(0)).round(4).tolist(),
        "bonds": bonds,
        "charges": [a.GetFormalCharge() for a in m.GetAtoms()],
        "method": "rdkit",
    }
