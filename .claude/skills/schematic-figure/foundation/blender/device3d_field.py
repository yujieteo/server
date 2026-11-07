# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_field.py
import math
from dataclasses import dataclass

import numpy as np
from device3d_mesh import TAU
from device3d_types import Tpl

type Ball = tuple[float, float, float, float]
COAT_SINK = 0.01
LOBES = 4
FREQ_LOW = 1.2
FREQ_HIGH = 3.2


@dataclass(frozen=True)
class Field:
    waves: list[tuple[float, float, float, float]]
    amp: float
    norm: float


@dataclass(frozen=True)
class Surface:
    field: Field
    t: float
    from_x: float | None


def field_at_point(f: Field, x: float, y: float) -> float:
    total = 0.0
    for kx, ky, p, w in f.waves:
        total = total + w * np.sin(kx * x + ky * y + p)
    return f.amp / f.norm * total


def field_at_grid(f: Field, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    total = np.zeros_like(x)
    for kx, ky, p, w in f.waves:
        total = total + w * np.sin(kx * x + ky * y + p)
    return f.amp / f.norm * total


def surface_top(s: Surface, x: float, y: float) -> float:
    h = field_at_point(s.field, x, y)
    if s.from_x is None:
        return h
    return h + (s.t if x >= s.from_x else 0)


def surface_z(s: Surface, x: float, y: float) -> float:
    return surface_top(s, x, y) - COAT_SINK


def make_field(rng: np.random.Generator, amp: float, waves: int = 28, fmin: float = 4.0, fmax: float = 24.0) -> Field:
    ks: list[tuple[float, float, float, float]] = []
    for _ in range(waves):
        f = fmin * math.pow(fmax / fmin, rng.uniform())
        th = rng.uniform(0, TAU)
        ks.append((f * math.cos(th), f * math.sin(th), rng.uniform(0, TAU), 1.0 / f))
    norm = math.sqrt(sum(w * w for *_, w in ks) / 2)
    return Field(ks, amp, norm)


def make_blob(tpl: Tpl, c: np.ndarray, r: float, rng: np.random.Generator, noise: float = 0.12) -> Tpl:
    verts, faces = tpl
    disp = np.ones(len(verts))
    for _ in range(LOBES):
        k = rng.normal(size=3)
        k /= np.linalg.norm(k)
        f = rng.uniform(FREQ_LOW, FREQ_HIGH)
        disp += noise / LOBES * 2 * np.cos(f * (verts @ k) * math.pi + rng.uniform(0, TAU))
    return verts * (r * disp).reshape(-1, 1) + c, faces
