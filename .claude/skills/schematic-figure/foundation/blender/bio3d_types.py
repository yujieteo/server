# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/bio3d_types.py
import random
from collections.abc import Sequence
from dataclasses import dataclass

import bpy
import numpy as np

type Vec3 = tuple[float, float, float]
type Mesh = tuple[np.ndarray, np.ndarray]
type Anchors = dict[str, Vec3]
type Built = tuple[bpy.types.Object, Anchors]
type Rows = np.ndarray | Sequence[np.ndarray] | Sequence[Sequence[float]]
type Point = np.ndarray | Sequence[float]
type MeshPart = tuple[np.ndarray | Sequence[Sequence[float]], np.ndarray]

TWIST_MAX = 6.3
ORIGIN: Vec3 = (0.0, 0.0, 0.0)
NO_ROT: Vec3 = (0.0, 0.0, 0.0)


class Rng(random.Random): ...


@dataclass(frozen=True)
class MeshOpts:
    face_mat: Sequence[int] | None = None
    rand: Sequence[float] | None = None
    rand2: Sequence[float] | None = None
    smooth: bool = True
    recalc: bool = False
