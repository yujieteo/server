# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/mol3d_smiles.py
import re
from dataclasses import dataclass, field
from typing import NotRequired, TypedDict

VAL = {
    "B": (3,),
    "C": (4,),
    "N": (3, 5),
    "O": (2,),
    "P": (3, 5),
    "S": (2, 4, 6),
    "F": (1,),
    "Cl": (1,),
    "Br": (1,),
    "I": (1,),
}
BR = re.compile(r"^(\d+)?([A-Z][a-z]?|[a-z][a-z]?|\*)(@*)(H\d*)?([+-]+\d*)?(:\d+)?$")
BOND_MARKS = {"-": 1, "=": 2, "#": 3, ":": 1.5, "$": 3, "/": 1, "\\": 1}
AROMATIC_ORGANIC = ("b", "c", "n", "o", "p", "s")
TWO_LETTER = ("Cl", "Br")
AROMATIC_ORDER = 1.5

Bond = tuple[int, int, float]


class MolResult(TypedDict):
    atoms: list[str]
    xyz: list[list[float]]
    bonds: list[list[float]]
    charges: list[int]
    method: str
    strain: NotRequired[float]


@dataclass
class Atom:
    sym: str
    arom: bool
    h: int | None
    charge: int


def _charge(text: str) -> int:
    if not text:
        return 0
    digits = text.lstrip("+-")
    sign = 1 if text[0] == "+" else -1
    return sign * (int(digits) if digits else len(text))


@dataclass
class ParseState:
    smi: str
    atoms: list[Atom] = field(default_factory=list)
    bonds: list[Bond] = field(default_factory=list)
    i: int = 0
    prev: int | None = None
    stack: list[int | None] = field(default_factory=list)
    ring: dict[int, tuple[int | None, float | None]] = field(default_factory=dict)
    pend: float | None = None


def _bond(st: ParseState, a: int, b: int, order: float | None) -> None:
    if order is None:
        order = AROMATIC_ORDER if st.atoms[a].arom and st.atoms[b].arom else 1
    st.bonds.append((a, b, order))


def _ring_digit(st: ParseState) -> None:
    ch = st.smi[st.i]
    if ch == "%":
        num = int(st.smi[st.i + 1 : st.i + 3])
        st.i += 3
    else:
        num = int(ch)
        st.i += 1
    if st.prev is None:
        msg = "ring bond without an atom in " + st.smi
        raise ValueError(msg)
    if num in st.ring:
        j, bo = st.ring.pop(num)
        if j is None:
            msg = "ring bond without an atom in " + st.smi
            raise ValueError(msg)
        _bond(st, st.prev, j, st.pend if st.pend is not None else bo)
    else:
        st.ring[num] = (st.prev, st.pend)
    st.pend = None


def _bracket_atom(st: ParseState) -> None:
    k = st.smi.index("]", st.i)
    m = BR.match(st.smi[st.i + 1 : k])
    if not m:
        msg = "bad bracket atom " + st.smi[st.i : k + 1]
        raise ValueError(msg)
    raw = m.group(2)
    h = m.group(4)
    hc = 0 if not h else (int(h[1:]) if len(h) > 1 else 1)
    st.atoms.append(Atom(raw.capitalize(), raw.islower(), hc, _charge(m.group(5) or "")))
    st.i = k + 1


def _organic_atom(st: ParseState) -> None:
    two = st.smi[st.i : st.i + 2]
    sym = two if two in TWO_LETTER else st.smi[st.i]
    st.i += len(sym)
    if sym not in VAL and sym.lower() not in AROMATIC_ORGANIC:
        msg = "unknown atom " + sym
        raise ValueError(msg)
    st.atoms.append(Atom(sym.capitalize(), sym.islower(), None, 0))


def _atom(st: ParseState) -> None:
    if st.smi[st.i] == "[":
        _bracket_atom(st)
    else:
        _organic_atom(st)
    idx = len(st.atoms) - 1
    if st.prev is not None:
        _bond(st, st.prev, idx, st.pend)
    st.pend = None
    st.prev = idx


def _step(st: ParseState) -> None:
    ch = st.smi[st.i]
    if ch == "(":
        st.stack.append(st.prev)
        st.i += 1
    elif ch == ")":
        st.prev = st.stack.pop()
        st.i += 1
    elif ch in BOND_MARKS:
        st.pend = BOND_MARKS[ch]
        st.i += 1
    elif ch == ".":
        st.prev = None
        st.i += 1
    elif ch.isdigit() or ch == "%":
        _ring_digit(st)
    else:
        _atom(st)


def _run(st: ParseState) -> None:
    while st.i < len(st.smi):
        _step(st)
    if st.ring:
        msg = "unclosed ring in " + st.smi
        raise ValueError(msg)


def _implicit_h(at: Atom, a: int, bonds: list[Bond]) -> int:
    orders = [o for x, y, o in bonds if a in (x, y)]
    if at.arom:
        s = sum(1 if o == AROMATIC_ORDER else o for o in orders) + 1
        val = VAL.get(at.sym, (0,))[0]
    else:
        s = sum(orders)
        val = next((v for v in VAL.get(at.sym, (0,)) if v >= s), s)
    return max(0, round(val - s))


def parse_smiles(smi: str) -> tuple[list[Atom], list[Bond]]:
    st = ParseState(smi)
    _run(st)
    atoms, bonds = st.atoms, st.bonds
    for a in range(len(atoms)):
        at = atoms[a]
        if at.h is None:
            at.h = _implicit_h(at, a, bonds)
        for _ in range(at.h):
            atoms.append(Atom("H", arom=False, h=0, charge=0))
            bonds.append((a, len(atoms) - 1, 1))
    return atoms, bonds
