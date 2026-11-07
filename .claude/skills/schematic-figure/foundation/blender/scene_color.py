# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_color.py
import math
from collections.abc import Mapping, Sequence
from typing import NamedTuple

Rgb = tuple[float, float, float]
Rgba = tuple[float, float, float, float]
Vec3 = Sequence[float]
Palette = Mapping[str, str] | Sequence[str]

SRGB_KNEE = 0.04045
LINEAR_KNEE = 0.0031308
HALF = 0.5
FULL_HUE = 360.0
HUE_SECTOR = 60.0
TONE_NAMES = ("light", "glow", "dark", "deep", "line")
BYTE_MAX = 255
MIN_ROOM = 1e-6


class ToneParams(NamedTuple):
    target: float
    amt: float
    k: float
    up_frac: float
    up_max: float
    dn_frac: float
    dn_max: float


def s2l(v: float) -> float:
    if v <= SRGB_KNEE:
        return v / 12.92
    return math.pow((v + 0.055) / 1.055, 2.4)


def l2s(v: float) -> float:
    v = min(max(v, 0.0), 1.0)
    if v <= LINEAR_KNEE:
        return v * 12.92
    return 1.055 * math.pow(v, 1 / 2.4) - 0.055


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return min(hi, max(lo, v))


def hex_srgb(h: str) -> Rgb:
    s = h.lstrip("#")
    return (int(s[0:2], 16) / BYTE_MAX, int(s[2:4], 16) / BYTE_MAX, int(s[4:6], 16) / BYTE_MAX)


def hex_rgb(h: str, a: float = 1.0) -> Rgba:
    r, g, b = hex_srgb(h)
    return (s2l(r), s2l(g), s2l(b), a)


def srgb_hex(c: Sequence[float]) -> str:
    r, g, b = (round(clamp(v) * BYTE_MAX) for v in c[:3])
    return f"#{r:02x}{g:02x}{b:02x}"


def _hue(r: float, g: float, b: float, mx: float, d: float) -> float:
    if mx == r:
        return HUE_SECTOR * ((g - b) / d + (6 if g < b else 0))
    if mx == g:
        return HUE_SECTOR * ((b - r) / d + 2)
    return HUE_SECTOR * ((r - g) / d + 4)


def rgb_hsl(r: float, g: float, b: float) -> Rgb:
    mx, mn = max(r, g, b), min(r, g, b)
    light = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, light
    d = mx - mn
    sat = d / (2 - mx - mn) if light > HALF else d / (mx + mn)
    return _hue(r, g, b, mx, d), sat, light


def _hsl_channel(n: int, h: float, light: float, a: float) -> float:
    k = (n + h / 30) % 12
    return light - a * max(-1, min(k - 3, 9 - k, 1))


def hsl_rgb(h: float, s: float, light: float) -> Rgb:
    h %= FULL_HUE
    s = clamp(s)
    light = clamp(light)
    a = s * min(light, 1 - light)
    return (_hsl_channel(0, h, light, a), _hsl_channel(8, h, light, a), _hsl_channel(4, h, light, a))


def toward(h: float, target: float, amt: float) -> float:
    d = ((target - h + 540) % FULL_HUE) - 180
    return h + math.copysign(min(abs(d), amt), d)


def tone_params(name: str, c: float = 1.0) -> ToneParams:
    if name == "light":
        return ToneParams(50, 7 * c, 1 - 0.1 * c, 0.5 * c, 0.16 * c, 0, 0)
    if name == "glow":
        return ToneParams(50, 7 * c, 0.6, 0.75, 1.0, 0, 0)
    if name == "dark":
        return ToneParams(235, 10 * c, 1 + 0.12 * c, 0, 0, 0.24 * c, 0.16 * c)
    if name == "deep":
        return ToneParams(235, 10 * c, 1 + 0.2 * c, 0, 0, 0.4 * c, 0.28 * c)
    return ToneParams(235, 8, 1.15, 0, 0, 0.42, 1.0)


def tone_srgb(srgb: Sequence[float], name: str, c: float = 1.0) -> Rgb:
    h, s, light = rgb_hsl(srgb[0], srgb[1], srgb[2])
    hs = min(1.0, 3 * s)
    chroma = s * (1 - abs(2 * light - 1))
    p = tone_params(name, c)
    ll = clamp(light + min(p.up_frac * (1 - light), p.up_max) - min(p.dn_frac * light, p.dn_max))
    room = 1 - abs(2 * ll - 1)
    sat = min(1.0, chroma * p.k / room) if room > MIN_ROOM else 0.0
    return hsl_rgb(toward(h, p.target, p.amt * hs), sat, ll)


def illus_tones(color: str, contrast: float = 1.0) -> dict[str, str]:
    srgb = hex_srgb(color)
    out = {"base": srgb_hex(srgb)}
    for n in TONE_NAMES:
        out[n] = srgb_hex(tone_srgb(srgb, n, contrast))
    return out


def lin_tone(lin: Sequence[float], name: str, c: float = 1.0) -> Rgba:
    r, g, b = tone_srgb((l2s(lin[0]), l2s(lin[1]), l2s(lin[2])), name, c)
    return (s2l(r), s2l(g), s2l(b), 1.0)


def _snap_palette(srgb: Rgb, palette: Sequence[str], snap: float) -> Rgb | None:
    best: str | None = None
    bd = 9.0
    for p in palette:
        q = hex_srgb(p)
        d = math.pow(sum((a - b) ** 2 for a, b in zip(q, srgb, strict=False)), HALF)
        if d < bd:
            best, bd = p, d
    if best is not None and bd <= snap:
        return hex_rgb(best)[:3]
    return None


def palette_map(lin: Rgb, palette: Palette | None, snap: float) -> Rgb:
    if not palette:
        return lin
    srgb = (l2s(lin[0]), l2s(lin[1]), l2s(lin[2]))
    if isinstance(palette, Mapping):
        mapped = {k.lower(): v for k, v in palette.items()}
        hx = srgb_hex(srgb)
        return hex_rgb(mapped[hx])[:3] if hx in mapped else lin
    return _snap_palette(srgb, palette, snap) or lin
