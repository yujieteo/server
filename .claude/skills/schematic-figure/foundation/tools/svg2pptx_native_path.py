# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_path.py
from dataclasses import dataclass

from svg2pptx_native_arc import Arc, arc_to_cubics, quad_to_cubic
from svg2pptx_native_base import NUM_RE, Point, Seg

SEPARATORS = " \t\r\n,"
FLAG_CHARS = "01"


@dataclass
class PathState:
    d: str
    i: int = 0
    cx: float = 0.0
    cy: float = 0.0
    sx: float = 0.0
    sy: float = 0.0
    last_c: Point | None = None
    last_q: Point | None = None
    cmd: str | None = None


def require_point(cur: Point | None) -> Point:
    if cur is None:
        msg = "curve without a start point"
        raise TypeError(msg)
    return cur


def bezier(p0: Point, pts: tuple[Point, ...], t: float) -> Point:
    u = 1 - t
    return (
        u**3 * p0[0] + 3 * u * u * t * pts[0][0] + 3 * u * t * t * pts[1][0] + t**3 * pts[2][0],
        u**3 * p0[1] + 3 * u * u * t * pts[0][1] + 3 * u * t * t * pts[1][1] + t**3 * pts[2][1],
    )


def skip_sep(st: PathState) -> None:
    while st.i < len(st.d) and st.d[st.i] in SEPARATORS:
        st.i += 1


def read_num(st: PathState) -> float:
    skip_sep(st)
    m = NUM_RE.match(st.d, st.i)
    if not m:
        msg = f"number expected at {st.i}"
        raise ValueError(msg)
    st.i = m.end()
    return float(m.group(0))


def read_flag(st: PathState) -> int:
    skip_sep(st)
    if st.i < len(st.d) and st.d[st.i] in FLAG_CHARS:
        st.i += 1
        return int(st.d[st.i - 1])
    msg = "flag expected"
    raise ValueError(msg)


def read_point(st: PathState, *, rel: bool) -> Point:
    x, y = read_num(st), read_num(st)
    if rel:
        return (x + st.cx, y + st.cy)
    return (x, y)


def read_points(st: PathState, count: int, *, rel: bool) -> list[Point]:
    return [read_point(st, rel=rel) for _ in range(count)]


def set_pen(st: PathState, p: Point) -> None:
    st.cx, st.cy = p
    st.last_c = None
    st.last_q = None


def cmd_move(st: PathState, segs: list[Seg], *, rel: bool) -> None:
    p = read_point(st, rel=rel)
    segs.append(Seg("M", (p,)))
    set_pen(st, p)
    st.sx, st.sy = p
    st.cmd = "l" if rel else "L"


def cmd_line(st: PathState, segs: list[Seg], up: str, *, rel: bool) -> None:
    if up == "L":
        p = read_point(st, rel=rel)
    elif up == "H":
        p = (read_num(st) + (st.cx if rel else 0), st.cy)
    else:
        p = (st.cx, read_num(st) + (st.cy if rel else 0))
    segs.append(Seg("L", (p,)))
    set_pen(st, p)


def cmd_cubic(st: PathState, segs: list[Seg], up: str, *, rel: bool) -> None:
    if up == "C":
        c1, c2, p = read_points(st, 3, rel=rel)
    else:
        c2, p = read_points(st, 2, rel=rel)
        c1 = (2 * st.cx - st.last_c[0], 2 * st.cy - st.last_c[1]) if st.last_c else (st.cx, st.cy)
    segs.append(Seg("C", (c1, c2, p)))
    set_pen(st, p)
    st.last_c = c2


def cmd_quad(st: PathState, segs: list[Seg], up: str, *, rel: bool) -> None:
    if up == "Q":
        q, p = read_points(st, 2, rel=rel)
    else:
        p = read_point(st, rel=rel)
        q = (2 * st.cx - st.last_q[0], 2 * st.cy - st.last_q[1]) if st.last_q else (st.cx, st.cy)
    segs.append(quad_to_cubic((st.cx, st.cy), q, p))
    set_pen(st, p)
    st.last_q = q


def cmd_arc(st: PathState, segs: list[Seg], *, rel: bool) -> None:
    rx, ry, rot = read_num(st), read_num(st), read_num(st)
    large, sweep = read_flag(st), read_flag(st)
    p = read_point(st, rel=rel)
    segs.extend(arc_to_cubics((st.cx, st.cy), p, Arc(rx, ry, rot, large, sweep)))
    set_pen(st, p)


def apply_command(st: PathState, segs: list[Seg], cmd: str) -> None:
    up = cmd.upper()
    rel = cmd.islower()
    if up == "M":
        cmd_move(st, segs, rel=rel)
    elif up in ("L", "H", "V"):
        cmd_line(st, segs, up, rel=rel)
    elif up in ("C", "S"):
        cmd_cubic(st, segs, up, rel=rel)
    elif up in ("Q", "T"):
        cmd_quad(st, segs, up, rel=rel)
    elif up == "A":
        cmd_arc(st, segs, rel=rel)
    else:
        msg = "unknown command " + cmd
        raise ValueError(msg)


def path_step(st: PathState, segs: list[Seg]) -> None:
    ch = st.d[st.i]
    if ch.isalpha():
        st.cmd = ch
        st.i += 1
        if ch in "Zz":
            if segs:
                segs.append(Seg("Z", ()))
            st.cx, st.cy = st.sx, st.sy
            st.last_c = None
            st.last_q = None
            return
    elif st.cmd is None:
        msg = "path data must start with a command"
        raise ValueError(msg)
    elif st.cmd in "Zz":
        msg = "number after Z"
        raise ValueError(msg)
    apply_command(st, segs, st.cmd)


def parse_path(d: str) -> list[Seg]:
    st = PathState(d)
    segs: list[Seg] = []
    skip_sep(st)
    while st.i < len(d):
        path_step(st, segs)
        skip_sep(st)
    return segs
