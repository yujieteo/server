# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_mol.py
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict, Unpack, cast

import bpy
import numpy as np
from device3d_mat import material
from device3d_mesh import Buf, add_cyl, add_sphere, buf_solid, cyl_tpl, mat3, sphere_tpl, with_prefix
from device3d_types import Anchors, Colors, Molecule, PtLike, Tpl, Vec3
from mathutils import Euler
from mol3d import embed
from mol3d_smiles import MolResult

CPK: dict[str, str] = {
    "H": "#eceae6",
    "C": "#41454c",
    "N": "#4467b5",
    "O": "#cf4a3d",
    "F": "#86b85f",
    "Cl": "#58a05a",
    "Br": "#8e3f2f",
    "I": "#6d4290",
    "S": "#dcb140",
    "P": "#de8c35",
    "Li": "#9c72c4",
    "Na": "#7160b8",
    "K": "#6a4fa8",
    "Si": "#c4b08a",
    "B": "#dd9d86",
    "Fe": "#c0673d",
    "Co": "#6c7ccc",
    "Ni": "#6aa47a",
    "Cu": "#c7824f",
    "Zn": "#8189a6",
    "Pt": "#c9c9cf",
    "Au": "#d6a74f",
    "Ti": "#a5a9af",
    "Mg": "#72aa5d",
    "Al": "#b1a9a6",
    "Se": "#d59a3c",
}
BS_R: dict[str, float] = {
    "H": 0.24,
    "C": 0.36,
    "N": 0.35,
    "O": 0.34,
    "F": 0.32,
    "S": 0.46,
    "P": 0.46,
    "Cl": 0.44,
    "Br": 0.48,
    "I": 0.54,
    "Li": 0.48,
    "Na": 0.55,
    "K": 0.62,
    "B": 0.36,
    "Si": 0.46,
}
VDW: dict[str, float] = {
    "H": 1.1,
    "C": 1.7,
    "N": 1.55,
    "O": 1.52,
    "F": 1.47,
    "S": 1.8,
    "P": 1.8,
    "Cl": 1.75,
    "Br": 1.85,
    "I": 1.98,
    "Li": 1.82,
    "Na": 2.27,
}
MIN_HEAVY = 3
DOUBLE = 2
PERP_EPS = 1e-6
NORM_EPS = 1e-9


class MolOpts(TypedDict, total=False):
    loc: Vec3
    scale: float
    style: str
    seed: int
    colors: Colors | None
    bond_color: str | None
    hydrogens: bool
    orient: str
    rot: Vec3
    coords: Molecule | str | None
    python: str | None
    bond_radius: float
    prefix: str


@dataclass(frozen=True)
class Mol:
    sym: list[str]
    x: np.ndarray
    show: list[bool]
    style: str
    scale: float
    bond_r: float
    bond_color: str | None
    pal: Colors
    cyl: Tpl


def as_molecule(res: MolResult) -> Molecule:
    bonds = [(int(b[0]), int(b[1]), b[2]) for b in res["bonds"]]
    return Molecule(atoms=res["atoms"], xyz=res["xyz"], bonds=bonds, method=res["method"])


def load_molecule(smiles: str | None, opts: MolOpts) -> Molecule:
    coords = opts.get("coords")
    if coords is None:
        if smiles is None:
            msg = "load_molecule needs smiles or coords"
            raise ValueError(msg)
        mol = as_molecule(embed(smiles, seed=opts.get("seed", 0), python=opts.get("python")))
        _ = sys.stdout.write(f"molecule_3d: {smiles} via {mol['method']}\n")
        return mol
    if isinstance(coords, str):
        return cast("Molecule", json.loads(Path(coords).read_text()))
    return coords


def flat_orient(x: np.ndarray, heavy: np.ndarray) -> np.ndarray:
    centred = x[heavy] - x[heavy].mean(0)
    _, _, vt = np.linalg.svd(centred)
    rot = np.stack([vt[0], vt[2], vt[1]])
    if np.linalg.det(rot) < 0:
        rot[1] *= -1
    return (x - x[heavy].mean(0)) @ rot.T


def placed_coords(mol: Molecule, heavy: np.ndarray, opts: MolOpts) -> np.ndarray:
    x = np.array(mol["xyz"], float)
    if opts.get("orient", "flat") == "flat" and int(heavy.sum()) >= MIN_HEAVY:
        x = flat_orient(x, heavy)
    rot = opts.get("rot", (0, 0, 0))
    if any(rot):
        rm = mat3(Euler([math.radians(v) for v in rot], "XYZ").to_matrix())
        x = x @ rm.T
    return x * opts.get("scale", 0.35) + np.asarray(opts.get("loc", (0, 0, 0)), float)


def atom_radii(sym: list[str], style: str, scale: float, bond_radius: float) -> list[float]:
    if style == "spacefill":
        return [VDW.get(s, 1.8) * scale for s in sym]
    if style == "stick":
        return [bond_radius * scale] * len(sym)
    return [BS_R.get(s, 0.5) * scale for s in sym]


def bond_perp(m: Mol, a: int, b: int, nb: dict[int, list[int]]) -> np.ndarray:
    x = m.x
    u = (x[b] - x[a]) / np.linalg.norm(x[b] - x[a])
    ref = next((x[c] for c in nb.get(a, []) + nb.get(b, []) if c not in (a, b)), x[a] + np.array([0, 0, 1.0]))
    perp = (ref - x[a]) - np.dot(ref - x[a], u) * u
    if float(np.linalg.norm(perp)) > PERP_EPS:
        return perp / (np.linalg.norm(perp) + NORM_EPS)
    return np.cross(u, [0, 1, 0])


def add_sticks(m: Mol, bufs: dict[str, Buf], bond: tuple[int, int, float], perp: np.ndarray) -> None:
    a, b, order = bond
    k = 1 if order in (1, 1.5) or m.style == "stick" else int(order)
    r = m.bond_r * m.scale * (1.0 if k == 1 else 0.62 if k == DOUBLE else 0.5)
    sep = m.bond_r * m.scale * (1.7 if k == DOUBLE else 2.2)
    for q in range(k):
        sh = perp * sep * (q - (k - 1) / 2)
        p0, p1 = m.x[a] + sh, m.x[b] + sh
        mid = (p0 + p1) / 2
        if m.bond_color:
            add_cyl(bufs.setdefault(m.bond_color, Buf()), p0, p1, r, tpl=m.cyl)
        else:
            add_cyl(bufs.setdefault(m.pal.get(m.sym[a], "#d06fc0"), Buf()), p0, mid, r, tpl=m.cyl)
            add_cyl(bufs.setdefault(m.pal.get(m.sym[b], "#d06fc0"), Buf()), mid, p1, r, tpl=m.cyl)


def bond_buffers(m: Mol, bonds: list[tuple[int, int, float]]) -> dict[str, Buf]:
    nb: dict[int, list[int]] = {}
    for a, b, _ in bonds:
        nb.setdefault(a, []).append(b)
        nb.setdefault(b, []).append(a)
    bufs: dict[str, Buf] = {}
    for bond in bonds:
        a, b, _ = bond
        if not (m.show[a] and m.show[b]):
            continue
        add_sticks(m, bufs, bond, bond_perp(m, a, b, nb))
    return bufs


def molecule_anchors(m: Mol, heavy: np.ndarray, rad: list[float]) -> dict[str, PtLike]:
    x = m.x
    top = max(rad)
    out: dict[str, PtLike] = {
        "center": x[heavy].mean(0),
        "top": x[int(np.argmax(x[:, 2]))] + np.array([0, 0, top]),
        "left": x[int(np.argmin(x[:, 0]))],
        "right": x[int(np.argmax(x[:, 0]))],
        "bottom": x[int(np.argmin(x[:, 2]))] - np.array([0, 0, top]),
    }
    for i, s in enumerate(m.sym):
        if s != "H":
            out[f"a{i}"] = x[i]
    return out


def molecule_3d(smiles: str | None = None, **opts: Unpack[MolOpts]) -> tuple[list[bpy.types.Object], Anchors]:
    mol = load_molecule(smiles, opts)
    sym = mol["atoms"]
    heavy = np.array([s != "H" for s in sym])
    style = opts.get("style", "ballstick")
    scale = opts.get("scale", 0.35)
    bond_radius = opts.get("bond_radius", 0.12)
    pal = {**CPK, **(opts.get("colors") or {})}
    hydrogens = opts.get("hydrogens", True)
    m = Mol(
        sym,
        placed_coords(mol, heavy, opts),
        [hydrogens or s != "H" for s in sym],
        style,
        scale,
        bond_radius,
        opts.get("bond_color"),
        pal,
        cyl_tpl(16, caps=False),
    )
    rad = atom_radii(sym, style, scale, bond_radius)
    sph = sphere_tpl(28, 16)
    atoms: dict[str, Buf] = {}
    for i, s in enumerate(sym):
        if m.show[i]:
            add_sphere(atoms.setdefault(pal.get(s, "#d06fc0"), Buf()), m.x[i], rad[i], sph)
    bonds = bond_buffers(m, mol["bonds"]) if style != "spacefill" else {}
    objs = [buf_solid(b, "atoms", material("ceramic", c, rough=0.42)) for c, b in atoms.items()]
    objs += [buf_solid(b, "bonds", material("ceramic", c, rough=0.5)) for c, b in bonds.items()]
    return objs, with_prefix(opts.get("prefix", ""), molecule_anchors(m, heavy, rad))
