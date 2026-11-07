# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_base.py
import math
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import NamedTuple

from lxml import etree
from lxml.etree import Element as SvgElement
from pptx.slide import SlidePart

type Point = tuple[float, float]
type Matrix = tuple[float, float, float, float, float, float]
type Box = tuple[float, float, float, float]
type Poly = list[Point]
type MaybeElement = SvgElement | None

SVGNS = "http://www.w3.org/2000/svg"
XLINK = "http://www.w3.org/1999/xlink"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
NS_DECL = (
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
)
SLIDE_W_MM = 338.7
SLIDE_H_MM = 190.5
EMU_PT = 12700
PCT = 100000
ANGLE_UNIT = 60000
MAX_GROUP_DEPTH = 3
EPS = 1e-9
SHEAR_EPS = 1e-4
DET_EPS = 1e-12
OPAQUE = 0.999
KAPPA = 0.5522847498
IDENTITY: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)

INHERITED = (
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-opacity",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-miterlimit",
    "fill-rule",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "text-anchor",
    "paint-order",
    "letter-spacing",
    "marker-start",
    "marker-end",
    "text-decoration",
)
SKIP_TAGS = {
    "defs",
    "clipPath",
    "mask",
    "marker",
    "symbol",
    "pattern",
    "style",
    "title",
    "desc",
    "metadata",
    "linearGradient",
    "radialGradient",
    "filter",
    "script",
}
NUM_RE = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
UNIT_NUM = re.compile(r"^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*(%|px|pt|mm|cm|in|em)?$")
UNIT_SCALE = {"mm": 72 / 25.4, "cm": 72 / 2.54, "in": 72.0}
URL_RE = re.compile(r"\s*url\(\s*[\x27\x22]?#([^)\x27\x22]+)[\x27\x22]?\s*\)")
HUNDRED = 100.0
TRANSFORM_RE = re.compile(r"(\w+)\s*\(([^)]*)\)")
MATRIX_LEN = 6
TRANSLATE_LEN = 2
ROTATE_CENTRE_LEN = 3


class Seg(NamedTuple):
    op: str
    pts: tuple[Point, ...]


class Item(NamedTuple):
    xml: str
    box: Box


class Decomp(NamedTuple):
    sx: float
    sy: float
    rot: float
    shear_ok: bool
    flip: bool


@dataclass(frozen=True)
class Style:
    props: dict[str, str]
    opacity: float = 1.0
    filter_ref: str | None = None
    mask_ref: str | None = None
    clips: tuple[Poly, ...] = ()


@dataclass
class Ctx:
    slide_part: SlidePart
    defs: dict[str, SvgElement]
    m0: Matrix
    next_id: int = 2
    stats: Counter[str] = field(default_factory=Counter[str])
    warn: Counter[str] = field(default_factory=Counter[str])
    approx: Counter[str] = field(default_factory=Counter[str])


class Node(NamedTuple):
    el: SvgElement
    st: Style
    m: Matrix


def new_id(ctx: Ctx) -> int:
    ctx.next_id += 1
    return ctx.next_id


def style_get(st: Style, name: str) -> str | None:
    return st.props.get(name)


def style_pick(st: Style, name: str, default: str) -> str:
    return st.props.get(name, default)


def with_prop(st: Style, name: str, value: str) -> Style:
    return Style({**st.props, name: value}, st.opacity, st.filter_ref, st.mask_ref, st.clips)


def has_str_tag(tag: object) -> bool:
    return isinstance(tag, str)


def local(tag: object) -> str:
    return etree.QName(tag).localname if isinstance(tag, str) else ""


def floats_in(text: str) -> list[float]:
    return [float(m.group(0)) for m in NUM_RE.finditer(text)]


def num(v: str | None, default: float = 0.0) -> float:
    if v is None:
        return default
    m = UNIT_NUM.match(v.strip())
    if m is None:
        return default
    x = float(m.group(1))
    unit = m.group(2)
    if unit == "%":
        return x / HUNDRED
    return x * UNIT_SCALE.get(unit, 1.0)


def url_id(v: str | None) -> str | None:
    m = URL_RE.match(v or "")
    return m.group(1) if m else None


def href_of(el: SvgElement) -> str:
    return el.get(f"{{{XLINK}}}href") or el.get("href") or ""


def name_of(el: SvgElement, fallback: str) -> str:
    for attr in ("data-name", "id", "data-part", "data-panel", "data-role"):
        v = el.get(attr)
        if v:
            return v
    return fallback


def parse_css(css: str | None) -> dict[str, str]:
    pairs = (part.split(":", 1) for part in (css or "").split(";") if ":" in part)
    return {p[0].strip(): p[1].strip() for p in pairs}


def style_of(el: SvgElement, parent: Style) -> Style:
    props = dict(parent.props)
    for attr in INHERITED:
        v = el.get(attr)
        if v is not None:
            props[attr] = v.strip()
    props.update({name: value for name, value in parse_css(el.get("style")).items() if name in INHERITED})
    flt = el.get("filter")
    mask = el.get("mask")
    return Style(
        props,
        parent.opacity * num(el.get("opacity"), 1.0),
        flt if flt and flt != "none" else parent.filter_ref,
        mask if mask and mask != "none" else parent.mask_ref,
        parent.clips,
    )


def mat_mul(m: Matrix, n: Matrix) -> Matrix:
    return (
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    )


def mat_apply(m: Matrix, x: float, y: float) -> Point:
    return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])


def mat_scale(m: Matrix) -> float:
    return math.sqrt(abs(m[0] * m[3] - m[1] * m[2]))


def mat_inv(m: Matrix) -> Matrix | None:
    det = m[0] * m[3] - m[1] * m[2]
    if abs(det) < DET_EPS:
        return None
    a, b, c, d = m[3] / det, -m[1] / det, -m[2] / det, m[0] / det
    return (a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5]))


def rotate_matrix(a: list[float]) -> Matrix:
    c, sn = math.cos(math.radians(a[0])), math.sin(math.radians(a[0]))
    t: Matrix = (c, sn, -sn, c, 0, 0)
    if len(a) >= ROTATE_CENTRE_LEN:
        return mat_mul(mat_mul((1, 0, 0, 1, a[1], a[2]), t), (1, 0, 0, 1, -a[1], -a[2]))
    return t


def transform_matrix(name: str, a: list[float]) -> Matrix | None:
    t: Matrix | None = None
    if name == "translate":
        t = (1, 0, 0, 1, a[0], a[1] if len(a) > 1 else 0.0)
    elif name == "scale":
        t = (a[0], 0, 0, a[1] if len(a) > 1 else a[0], 0, 0)
    elif name == "rotate":
        t = rotate_matrix(a)
    elif name == "matrix" and len(a) == MATRIX_LEN:
        t = (a[0], a[1], a[2], a[3], a[4], a[5])
    elif name == "skewX":
        t = (1, 0, math.tan(math.radians(a[0])), 1, 0, 0)
    elif name == "skewY":
        t = (1, math.tan(math.radians(a[0])), 0, 1, 0, 0)
    return t


def parse_transform(s: str | None) -> Matrix:
    m = IDENTITY
    if not s:
        return m
    for found in TRANSFORM_RE.finditer(s):
        t = transform_matrix(found.group(1), floats_in(found.group(2)))
        if t is not None:
            m = mat_mul(m, t)
    return m


def decompose(m: Matrix) -> Decomp:
    sx = math.hypot(m[0], m[1])
    sy = math.hypot(m[2], m[3])
    det = m[0] * m[3] - m[1] * m[2]
    rot = math.atan2(m[1], m[0])
    dot = (m[0] * m[2] + m[1] * m[3]) / (sx * sy) if sx and sy else 0.0
    return Decomp(sx, sy, rot, abs(dot) < SHEAR_EPS, det < 0)


def rot_attr(rot: float) -> str:
    if abs(rot) > EPS:
        return f' rot="{round((math.degrees(rot) % 360) * ANGLE_UNIT)}"'
    return ""
