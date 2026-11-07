from collections.abc import Sequence
from typing import final

from numpy import ndarray

def _idx(self: Bond) -> int: ...
def _begin(self: Bond) -> int: ...
def _end(self: Bond) -> int: ...
def _num_atoms(self: Mol) -> int: ...
def _bonds(self: Mol) -> Sequence[Bond]: ...
def _atoms(self: Mol) -> Sequence[Atom]: ...
def _conformer(self: Mol) -> Conformer: ...
def _is_aromatic(self: Bond) -> bool: ...
def _bond_type_as_double(self: Bond) -> float: ...
def _symbol(self: Atom) -> str: ...
def _formal_charge(self: Atom) -> int: ...
def _positions(self: Conformer) -> ndarray: ...

@final
class Bond:
    GetIdx = _idx
    GetBeginAtomIdx = _begin
    GetEndAtomIdx = _end
    GetIsAromatic = _is_aromatic
    GetBondTypeAsDouble = _bond_type_as_double

@final
class Atom:
    GetSymbol = _symbol
    GetFormalCharge = _formal_charge

@final
class Conformer:
    GetPositions = _positions

@final
class Mol:
    GetNumAtoms = _num_atoms
    GetBonds = _bonds
    GetAtoms = _atoms
    GetConformer = _conformer

def _mol_from_smiles(smiles: str) -> Mol | None: ...

MolFromSmiles = _mol_from_smiles

def _remove_hs(mol: Mol) -> Mol: ...

RemoveHs = _remove_hs

def _mol_to_smiles(mol: Mol) -> str: ...

MolToSmiles = _mol_to_smiles

def _add_hs(mol: Mol) -> Mol: ...

AddHs = _add_hs
