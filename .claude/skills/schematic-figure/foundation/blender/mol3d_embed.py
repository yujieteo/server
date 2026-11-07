# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/mol3d_embed.py
import math
from dataclasses import dataclass, field
from typing import NamedTuple

import numpy as np
from mol3d_smiles import Bond, MolResult, parse_smiles
from mol3d_tables import COV, ORDER_SHORTEN, VDW

RING_ANGLES = {3: 60.0, 4: 88.0, 5: 104.5, 6: 111.0}
SP = 180.0
SP2 = 120.0
SP3 = 109.47
INF = 99
MAX_RING_SEARCH = 7
MAX_RING_ANGLE_SIZE = 6
MANY_NEIGHBOURS = 5
THREE = 3
TWO = 2
TRIPLE = 3
DOUBLE = 2
AROMATIC = 1.5
SQRT3 = math.sqrt(3)
TIGHT_RING = 95
TIGHT_OTHER = 116.0
PLANE_START = 0.6
PLANE_FLAT = 0.62
SQUEEZE_START = 0.3
CLEAN_STRAIN = 0.03


class Cons(NamedTuple):
    i: int
    j: int
    target: float
    weight: float


@dataclass
class Topo:
    sym: list[str]
    nb: list[list[int]]
    bo: dict[tuple[int, int], float]
    hyb: list[float]
    bonds: list[Bond]
    rows: list[list[int]] = field(default_factory=list)


@dataclass
class Sys:
    n: int
    ii: np.ndarray
    jj: np.ndarray
    tt: np.ndarray
    ww: np.ndarray
    rep: np.ndarray
    lb: np.ndarray
    quad: np.ndarray


def bond_len(t: Topo, a: int, b: int) -> float:
    return COV.get(t.sym[a], 1.0) + COV.get(t.sym[b], 1.0) - ORDER_SHORTEN.get(t.bo[(a, b)], 0)


def _hybridization(nb: list[list[int]], bo: dict[tuple[int, int], float]) -> list[float]:
    hyb: list[float] = []
    for a, ns in enumerate(nb):
        orders = [bo[(a, b)] for b in ns]
        if (TRIPLE in orders or orders.count(DOUBLE) >= TWO) and len(ns) <= TWO:
            hyb.append(SP)
        elif DOUBLE in orders or AROMATIC in orders:
            hyb.append(SP2)
        else:
            hyb.append(SP3)
    return hyb


def _topology(sym: list[str], bonds: list[Bond]) -> Topo:
    nb: list[list[int]] = [[] for _ in sym]
    bo: dict[tuple[int, int], float] = {}
    for a, b, o in bonds:
        nb[a].append(b)
        nb[b].append(a)
        bo[(a, b)] = bo[(b, a)] = o
    t = Topo(sym, nb, bo, _hybridization(nb, bo), bonds)
    t.rows = _topo_rows(t)
    return t


def ring_size(t: Topo, a: int, c: int, b: int) -> int:
    seen = {a}
    front = [a]
    d = 0
    while front and d < MAX_RING_SEARCH:
        d += 1
        nxt: list[int] = []
        for u in front:
            for v in t.nb[u]:
                if v == c or v in seen:
                    continue
                if v == b:
                    return d + 2
                seen.add(v)
                nxt.append(v)
        front = nxt
    return 0


def in_ring(t: Topo, b: int, c: int) -> bool:
    return any(ring_size(t, b, c, x) for x in t.nb[c] if x != b) or any(
        ring_size(t, c, b, x) for x in t.nb[b] if x != c
    )


def _angle_targets(t: Topo, c: int) -> dict[tuple[int, int], float]:
    ns = t.nb[c]
    pairs = [(ns[x], ns[y]) for x in range(len(ns)) for y in range(x + 1, len(ns))]
    tgt: dict[tuple[int, int], float] = {}
    for a, b in pairs:
        k = ring_size(t, a, c, b)
        if k and k <= MAX_RING_ANGLE_SIZE:
            tgt[(a, b)] = 180.0 * (k - 2) / k if t.hyb[c] == SP2 else RING_ANGLES[k]
    rest = [p for p in pairs if p not in tgt]
    ring_sum = sum(tgt.values())
    for p in rest:
        if t.hyb[c] == SP2 and len(ns) == THREE:
            tgt[p] = (360.0 - ring_sum) / len(rest)
        elif t.hyb[c] == SP3 and any(v < TIGHT_RING for v in tgt.values()):
            tgt[p] = TIGHT_OTHER
        else:
            tgt[p] = t.hyb[c]
    return tgt


def _constraints(t: Topo) -> list[Cons]:
    cons = [Cons(a, b, bond_len(t, a, b), 1.0) for a, b, _ in t.bonds]
    for c, ns in enumerate(t.nb):
        if len(ns) >= MANY_NEIGHBOURS:
            continue
        for (a, b), th in _angle_targets(t, c).items():
            rad = math.radians(th)
            la, lb = bond_len(t, a, c), bond_len(t, b, c)
            cons.append(Cons(a, b, math.sqrt(la * la + lb * lb - 2 * la * lb * math.cos(rad)), 0.5))
    return cons


def _topo_rows(t: Topo) -> list[list[int]]:
    rows: list[list[int]] = []
    for s in range(len(t.sym)):
        row = [INF] * len(t.sym)
        row[s] = 0
        front = [s]
        while front:
            nxt: list[int] = []
            for u in front:
                for v in t.nb[u]:
                    if row[v] == INF:
                        row[v] = row[u] + 1
                        nxt.append(v)
            front = nxt
        rows.append(row)
    return rows


def _repulsion(t: Topo, dist: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    n = len(t.sym)
    vd = np.array([VDW.get(s, 1.8) for s in t.sym])
    pair_vdw = vd[:, None] + vd[None, :]
    lb = 0.62 * pair_vdw
    rep = (dist >= THREE) & ~np.eye(n, dtype=bool)
    frag = np.equal(dist, INF)
    lb = np.where(frag, 2.2 + 0.5 * pair_vdw, lb)
    rep = rep | frag
    for c, ns in enumerate(t.nb):
        if len(ns) < MANY_NEIGHBOURS:
            continue
        for a in ns:
            for b in ns:
                if a != b:
                    rep[a, b] = True
                    lb[a, b] = math.sqrt(2) * 0.5 * (bond_len(t, a, c) + bond_len(t, b, c)) * 0.995
    return rep, lb


def _planar_quads(t: Topo) -> np.ndarray:
    quad = [[ns[0], ns[1], ns[2], c] for c, ns in enumerate(t.nb) if t.hyb[c] == SP2 and len(ns) == THREE]
    for b, c, o in t.bonds:
        ring_single = t.hyb[b] == SP2 and t.hyb[c] == SP2 and o == 1 and t.rows[b][c] == 1 and in_ring(t, b, c)
        if o in (AROMATIC, DOUBLE) or ring_single:
            for a in t.nb[b]:
                for d in t.nb[c]:
                    if a != c and d not in (a, b):
                        quad += [[a, b, c, d], [d, c, b, a]]
    return np.array(quad, int).reshape(-1, 4)


def _step(s: Sys, x: np.ndarray, lr: float, squeeze: float) -> np.ndarray:
    g = np.zeros_like(x)
    cnt = np.zeros(s.n)
    d = x[s.ii] - x[s.jj]
    r = np.linalg.norm(d, axis=1) + 1e-9
    f = (0.5 * s.ww * (r - s.tt) / r)[:, None] * d
    np.add.at(g, s.ii, f)
    np.add.at(g, s.jj, -f)
    np.add.at(cnt, s.ii, s.ww)
    np.add.at(cnt, s.jj, s.ww)
    dd = x[:, None, :] - x[None, :, :]
    rr = np.linalg.norm(dd, axis=2) + 1e-9
    v = np.where(s.rep & (rr < s.lb), 0.5 * (rr - s.lb) / rr, 0.0) * 0.5
    g += (v[:, :, None] * dd).sum(1)
    cnt += np.not_equal(v, 0).sum(1) * 0.5
    g /= np.maximum(cnt, 1.0)[:, None]
    g[:, 3] += squeeze * x[:, 3] * 0.2
    return x - lr * g


def _flatten(s: Sys, x: np.ndarray, k: float = 0.25) -> np.ndarray:
    q = s.quad
    if not len(q):
        return x
    pa, pb, pe, pc = (x[q[:, i], :3] for i in range(4))
    nrm = np.cross(pb - pa, pe - pa)
    nrm /= np.linalg.norm(nrm, axis=1)[:, None] + 1e-9
    h = ((pc - pa) * nrm).sum(1)[:, None] * nrm * k
    g = np.zeros((s.n, 3))
    cnt = np.zeros(s.n)
    np.add.at(g, q[:, 3], -h)
    for i in (0, 1, 2):
        np.add.at(g, q[:, i], h / 3)
    for i in range(4):
        np.add.at(cnt, q[:, i], 1)
    x = x.copy()
    x[:, :3] += g / np.maximum(cnt, 1)[:, None] * 2
    return x


def _double_bond_targets(t: Topo, x: np.ndarray) -> list[Cons]:
    extra: list[Cons] = []
    for b, c, o in t.bonds:
        if o != DOUBLE or t.rows[b][c] != 1:
            continue
        for a in t.nb[b]:
            for d in t.nb[c]:
                if a == c or d == b:
                    continue
                lab, lbc, lcd = bond_len(t, a, b), bond_len(t, b, c), bond_len(t, c, d)
                start = np.array([-lab / 2, lab * SQRT3 / 2])
                mid = np.array([lbc, 0.0])
                cis = np.linalg.norm(mid + lcd * np.array([0.5, SQRT3 / 2]) - start)
                trans = np.linalg.norm(mid + lcd * np.array([0.5, -SQRT3 / 2]) - start)
                cur = np.linalg.norm(x[a, :3] - x[d, :3])
                extra.append(Cons(a, d, cis if abs(cur - cis) < abs(cur - trans) else trans, 0.4))
    return extra


def _add_constraints(s: Sys, extra: list[Cons]) -> None:
    if not extra:
        return
    s.ii = np.concatenate([s.ii, [e.i for e in extra]])
    s.jj = np.concatenate([s.jj, [e.j for e in extra]])
    s.tt = np.concatenate([s.tt, [e.target for e in extra]])
    s.ww = np.concatenate([s.ww, [e.weight for e in extra]])


def _squeeze(k: int, iters: int) -> float:
    if k < iters * SQUEEZE_START:
        return 0.0
    return min(1.0, (k - iters * SQUEEZE_START) / (iters * SQUEEZE_START)) * 2.0


def _relax(t: Topo, s: Sys, x: np.ndarray, iters: int) -> np.ndarray:
    for k in range(iters):
        x = _step(s, x, 1.2, _squeeze(k, iters))
        if k > iters * PLANE_FLAT:
            x = _flatten(s, x)
        if k == int(iters * PLANE_START):
            x[:, 3] = 0.0
            _add_constraints(s, _double_bond_targets(t, x))
    return x


def build_system(t: Topo) -> Sys:
    dist = np.array(t.rows, int)
    rep, lb = _repulsion(t, dist)
    cons = _constraints(t)
    return Sys(
        n=len(t.sym),
        ii=np.array([c.i for c in cons]),
        jj=np.array([c.j for c in cons]),
        tt=np.array([c.target for c in cons]),
        ww=np.array([c.weight for c in cons]),
        rep=rep,
        lb=lb,
        quad=_planar_quads(t),
    )


def builtin(smi: str, seed: int = 0, iters: int = 2500) -> MolResult:
    atoms, bonds = parse_smiles(smi)
    t = _topology([a.sym for a in atoms], bonds)
    s = build_system(t)
    x = np.random.default_rng(seed).normal(size=(s.n, 4)) * (1.0 + 0.4 * math.pow(s.n, 1 / 3))
    x = _relax(t, s, x, iters)
    x = x[:, :3] - x[:, :3].mean(0)
    r = np.linalg.norm(x[s.ii] - x[s.jj], axis=1)
    return {
        "atoms": t.sym,
        "xyz": x.round(4).tolist(),
        "bonds": [[a, b, o] for a, b, o in bonds],
        "charges": [a.charge for a in atoms],
        "method": "builtin",
        "strain": float(abs(r - s.tt).max()),
    }


def builtin_best(smi: str, seed: int = 0, tries: int = 4) -> MolResult:
    best: MolResult | None = None
    for i in range(tries):
        m = builtin(smi, seed * 101 + i)
        if best is None or m.get("strain", 0.0) < best.get("strain", 0.0):
            best = m
        if best.get("strain", 0.0) < CLEAN_STRAIN:
            break
    if best is None:
        msg = "no embedding tries"
        raise ValueError(msg)
    return best
