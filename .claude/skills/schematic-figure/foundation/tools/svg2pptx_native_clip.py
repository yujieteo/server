# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_clip.py
from dataclasses import dataclass, field
from typing import NamedTuple

from svg2pptx_native_base import EPS, Point, Poly, Seg
from svg2pptx_native_path import bezier, require_point

INSIDE_EPS = 1e-6
PARALLEL_EPS = 1e-12
OUTSIDE_EPS = 1e-9
JOIN_EPS = 1e-7


class Sub(NamedTuple):
    pts: list[Point]
    closed: bool


@dataclass
class FlatState:
    subs: list[Sub] = field(default_factory=list[Sub])
    pts: list[Point] = field(default_factory=list[Point])
    cur: Point | None = None
    start: Point | None = None


def flatten_seg(fs: FlatState, s: Seg, steps: int) -> None:
    if s.op == "M":
        if len(fs.pts) > 1:
            fs.subs.append(Sub(fs.pts, closed=False))
        fs.pts, fs.cur, fs.start = [s.pts[0]], s.pts[0], s.pts[0]
    elif s.op == "L":
        fs.pts.append(s.pts[0])
        fs.cur = s.pts[0]
    elif s.op == "C":
        p0 = require_point(fs.cur)
        fs.pts.extend(bezier(p0, s.pts, k / float(steps)) for k in range(1, steps + 1))
        fs.cur = s.pts[2]
    elif s.op == "Z":
        if len(fs.pts) > 1:
            fs.subs.append(Sub(fs.pts, closed=True))
        fs.pts, fs.cur = [], fs.start
        if fs.start is not None:
            fs.pts = [fs.start]


def flatten(segs: list[Seg], steps: int = 12) -> list[Sub]:
    fs = FlatState()
    for s in segs:
        flatten_seg(fs, s, steps)
    if len(fs.pts) > 1:
        fs.subs.append(Sub(fs.pts, closed=False))
    return fs.subs


def poly_area(p: Poly) -> float:
    return 0.5 * sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p)))


def poly_sign(clip: Poly) -> int:
    return 1 if poly_area(clip) > 0 else -1


def is_convex(p: Poly) -> bool:
    n = len(p)
    sign = 0
    for i in range(n):
        a, b, c = p[i], p[(i + 1) % n], p[(i + 2) % n]
        cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
        if abs(cr) < EPS:
            continue
        s = 1 if cr > 0 else -1
        if sign and s != sign:
            return False
        sign = s
    return True


def edge_side(sgn: int, a: Point, b: Point, p: Point) -> float:
    return sgn * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))


def inside(p: Point, clip: Poly) -> bool:
    sgn = poly_sign(clip)
    n = len(clip)
    return all(edge_side(sgn, clip[i], clip[(i + 1) % n], p) >= -INSIDE_EPS for i in range(n))


def clip_edge(inp: Poly, a: Point, b: Point, sgn: int) -> Poly:
    out: Poly = []
    for j in range(len(inp)):
        p, q = inp[j], inp[(j + 1) % len(inp)]
        sp, sq = edge_side(sgn, a, b, p), edge_side(sgn, a, b, q)
        if sp >= 0:
            out.append(p)
        if (sp >= 0) != (sq >= 0):
            t = sp / (sp - sq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


def clip_polygon(subject: Poly, clip: Poly) -> Poly:
    sgn = poly_sign(clip)
    out = list(subject)
    n = len(clip)
    for i in range(n):
        if not out:
            break
        out = clip_edge(out, clip[i], clip[(i + 1) % n], sgn)
    return out


def clip_segment(p: Point, q: Point, clip: Poly, sgn: int) -> tuple[float, float] | None:
    t0, t1 = 0.0, 1.0
    dx, dy = q[0] - p[0], q[1] - p[1]
    n = len(clip)
    for j in range(n):
        a, b = clip[j], clip[(j + 1) % n]
        ex, ey = b[0] - a[0], b[1] - a[1]
        num_ = sgn * (ex * (p[1] - a[1]) - ey * (p[0] - a[0]))
        den = sgn * (ex * dy - ey * dx)
        if abs(den) < PARALLEL_EPS:
            if num_ < -OUTSIDE_EPS:
                return None
            continue
        t = -num_ / den
        if den > 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return None
    return t0, t1


def flush(pieces: list[Poly], cur: Poly) -> None:
    if len(cur) > 1:
        pieces.append(cur)


def clip_polyline(pts: Poly, *, closed: bool, clip: Poly) -> list[Poly]:
    sgn = poly_sign(clip)
    seq = [*pts, pts[0]] if closed else list(pts)
    pieces: list[Poly] = []
    cur: Poly = []
    for i in range(len(seq) - 1):
        p, q = seq[i], seq[i + 1]
        span = clip_segment(p, q, clip, sgn)
        if span is None:
            flush(pieces, cur)
            cur = []
            continue
        t0, t1 = span
        dx, dy = q[0] - p[0], q[1] - p[1]
        a_ = (p[0] + t0 * dx, p[1] + t0 * dy)
        b_ = (p[0] + t1 * dx, p[1] + t1 * dy)
        if cur and abs(cur[-1][0] - a_[0]) < JOIN_EPS and abs(cur[-1][1] - a_[1]) < JOIN_EPS:
            cur.append(b_)
        else:
            flush(pieces, cur)
            cur = [a_, b_]
        if t1 < 1.0:
            pieces.append(cur)
            cur = []
    flush(pieces, cur)
    return pieces
