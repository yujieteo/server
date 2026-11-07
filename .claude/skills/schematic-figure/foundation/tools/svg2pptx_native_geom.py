# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_geom.py
import math

from svg2pptx_native_base import KAPPA, Box, Point, Seg, floats_in
from svg2pptx_native_path import bezier, require_point

FIT_EPS = 0.01
RAD_EPS = 1e-9
WIDE = 16 / 9


def points_to_segs(pts: str | None, *, close: bool) -> list[Seg]:
    nums = floats_in(pts or "")
    xy = list(zip(nums[0::2], nums[1::2], strict=False))
    if not xy:
        return []
    segs = [Seg("M", (xy[0],)), *[Seg("L", (p,)) for p in xy[1:]]]
    if close:
        segs.append(Seg("Z", ()))
    return segs


def segs_bbox(segs: list[Seg]) -> Box | None:
    xs: list[float] = []
    ys: list[float] = []
    cur: Point | None = None
    for s in segs:
        if s.op in ("M", "L"):
            xs.append(s.pts[0][0])
            ys.append(s.pts[0][1])
            cur = s.pts[0]
        elif s.op == "C":
            p0 = require_point(cur)
            for k in range(1, 9):
                x, y = bezier(p0, s.pts, k / 8.0)
                xs.append(x)
                ys.append(y)
            cur = s.pts[2]
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys)


def rect_segs(x: float, y: float, w: float, h: float) -> list[Seg]:
    return [
        Seg("M", ((x, y),)),
        Seg("L", ((x + w, y),)),
        Seg("L", ((x + w, y + h),)),
        Seg("L", ((x, y + h),)),
        Seg("Z", ()),
    ]


def rrect_segs(box: Box, rx: float, ry: float) -> list[Seg]:
    x, y, w, h = box
    k = KAPPA
    return [
        Seg("M", ((x + rx, y),)),
        Seg("L", ((x + w - rx, y),)),
        Seg("C", ((x + w - rx + k * rx, y), (x + w, y + ry - k * ry), (x + w, y + ry))),
        Seg("L", ((x + w, y + h - ry),)),
        Seg("C", ((x + w, y + h - ry + k * ry), (x + w - rx + k * rx, y + h), (x + w - rx, y + h))),
        Seg("L", ((x + rx, y + h),)),
        Seg("C", ((x + rx - k * rx, y + h), (x, y + h - ry + k * ry), (x, y + h - ry))),
        Seg("L", ((x, y + ry),)),
        Seg("C", ((x, y + ry - k * ry), (x + rx - k * rx, y), (x + rx, y))),
        Seg("Z", ()),
    ]


def ellipse_segs(cx: float, cy: float, rx: float, ry: float) -> list[Seg]:
    k = KAPPA
    return [
        Seg("M", ((cx + rx, cy),)),
        Seg("C", ((cx + rx, cy + k * ry), (cx + k * rx, cy + ry), (cx, cy + ry))),
        Seg("C", ((cx - k * rx, cy + ry), (cx - rx, cy + k * ry), (cx - rx, cy))),
        Seg("C", ((cx - rx, cy - k * ry), (cx - k * rx, cy - ry), (cx, cy - ry))),
        Seg("C", ((cx + k * rx, cy - ry), (cx + rx, cy - k * ry), (cx + rx, cy))),
        Seg("Z", ()),
    ]


def rot_bbox(x: float, y: float, w: float, h: float, rot: float) -> Box:
    if abs(rot) < RAD_EPS:
        return (x, y, x + w, y + h)
    cx, cy = x + w / 2.0, y + h / 2.0
    c, s = math.cos(rot), math.sin(rot)
    xs: list[float] = []
    ys: list[float] = []
    for px, py in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
        xs.append(cx + c * px - s * py)
        ys.append(cy + s * px + c * py)
    return (min(xs), min(ys), max(xs), max(ys))


def fit_box(fig_w: float, fig_h: float, slide_w: int, slide_h: int) -> tuple[int, int, int, int]:
    k = min(slide_w / fig_w, slide_h / fig_h)
    if abs(fig_w / fig_h - WIDE) < FIT_EPS:
        w, h = slide_w, slide_h
    else:
        w, h = round(fig_w * k), round(fig_h * k)
    return ((slide_w - w) // 2, (slide_h - h) // 2, w, h)
