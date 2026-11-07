from typing import final

from rdkit.Chem import Mol

def _set_param(self: EmbedParameters, name: str, value: int) -> None: ...

@final
class EmbedParameters:
    __setattr__ = _set_param

def _etkdg_v3() -> EmbedParameters: ...
def _embed_molecule(mol: Mol, params: EmbedParameters) -> int: ...
def _mmff_optimize(mol: Mol) -> int: ...

ETKDGv3 = _etkdg_v3
EmbedMolecule = _embed_molecule
MMFFOptimizeMolecule = _mmff_optimize
