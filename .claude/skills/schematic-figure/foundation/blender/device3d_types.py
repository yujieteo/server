# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_types.py
from collections.abc import Sequence
from typing import NotRequired, TypedDict

import bpy
import numpy as np

type Vec2 = tuple[float, float]
type Vec3 = tuple[float, float, float]
type Poly = list[Vec2]
type Face = tuple[int, ...]
type Faces = list[Face]
type Anchors = dict[str, Vec3]
type Colors = dict[str, str]
type PtLike = Sequence[float] | np.ndarray
type Tpl = tuple[np.ndarray, Faces]


class MatDict(TypedDict, total=False):
    kind: str
    color: str | None
    alpha: float | None
    rough: float | None
    grain: float | None


type MatSpec = bpy.types.Material | str | MatDict | None


class Layer(TypedDict):
    thickness: float
    color: NotRequired[str]
    kind: NotRequired[str]
    label: NotRequired[str]
    alpha: NotRequired[float]
    inset: NotRequired[float]
    lattice: NotRequired[str]
    lattice_color: NotRequired[str]
    lattice_a: NotRequired[float]
    lattice_r: NotRequired[float]


class Spec(TypedDict, total=False):
    t: float
    r: float
    n: int
    color: str
    kind: str
    alpha: float
    margin: float
    from_x: float
    height: float
    kind_m: str
    branching: int


class ChannelSpec(TypedDict, total=False):
    length: float
    w: float
    color: str
    kind: str
    lattice: bool
    t: float


class Molecule(TypedDict):
    atoms: list[str]
    xyz: list[list[float]]
    bonds: list[tuple[int, int, float]]
    method: str
