# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_graph.py
import numpy as np
from device3d_types import Vec2

PRUNE_ROUNDS = 4
NEIGHBOUR = 1.08
MIN_DEGREE_SPARSE = 2
MIN_DEGREE_DENSE = 3


def grid_cells(pts: np.ndarray, dmax: float) -> list[tuple[int, int, int]]:
    idx = np.floor(pts / dmax).astype(int)
    return [(int(r[0]), int(r[1]), int(r[2])) for r in idx]


def near_candidates(cell: dict[tuple[int, int, int], list[int]], k: tuple[int, int, int]) -> list[int]:
    found: list[int] = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                found += cell.get((k[0] + dx, k[1] + dy, k[2] + dz), [])
    return found


def pairs(pts: np.ndarray, dmax: float) -> list[tuple[int, int]]:
    cell: dict[tuple[int, int, int], list[int]] = {}
    keys = grid_cells(pts, dmax)
    for i, k in enumerate(keys):
        cell.setdefault(k, []).append(i)
    out: list[tuple[int, int]] = []
    for i, k in enumerate(keys):
        out += [(i, j) for j in near_candidates(cell, k) if j > i and np.sum((pts[i] - pts[j]) ** 2) < dmax * dmax]
    return out


def cut_2d(
    pts: np.ndarray,
    species: np.ndarray,
    n: int,
    a: float,
    spec: tuple[Vec2 | None, str],
) -> tuple[np.ndarray, np.ndarray]:
    size, shape = spec
    if size is not None or shape == "rect":
        w, d = size or (2 * n * a, 2 * n * a)
        keep = (np.abs(pts[:, 0]) <= w / 2) & (np.abs(pts[:, 1]) <= d / 2)
    else:
        keep = np.hypot(pts[:, 0], pts[:, 1]) <= n * a
    return pts[keep], species[keep]


def prune_dangling(pts: np.ndarray, species: np.ndarray, kind: str, a: float) -> tuple[np.ndarray, np.ndarray]:
    for _ in range(PRUNE_ROUNDS):
        deg = np.zeros(len(pts), int)
        for i, j in pairs(pts, a * NEIGHBOUR):
            deg[i] += 1
            deg[j] += 1
        keep = deg >= (MIN_DEGREE_SPARSE if kind in ("honeycomb", "kagome") else MIN_DEGREE_DENSE)
        if keep.all():
            break
        pts, species = pts[keep], species[keep]
    return pts, species
