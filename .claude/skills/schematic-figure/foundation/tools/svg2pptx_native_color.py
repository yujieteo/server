# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_color.py
import re

RGB_RE = re.compile(r"rgba?\(([^)]*)\)")
HEX_SHORT = (3, 4)
HEX_ALPHA = 8
HEX_PLAIN = 6
RGB_PARTS = 3
CHANNEL_MAX = 255

NAMED: dict[str, str | None] = {
    "black": "000000",
    "white": "FFFFFF",
    "red": "FF0000",
    "green": "008000",
    "blue": "0000FF",
    "yellow": "FFFF00",
    "gray": "808080",
    "grey": "808080",
    "orange": "FFA500",
    "purple": "800080",
    "cyan": "00FFFF",
    "magenta": "FF00FF",
    "silver": "C0C0C0",
    "navy": "000080",
    "teal": "008080",
    "maroon": "800000",
    "lime": "00FF00",
    "olive": "808000",
    "aqua": "00FFFF",
    "fuchsia": "FF00FF",
    "brown": "A52A2A",
    "pink": "FFC0CB",
    "gold": "FFD700",
    "lightgray": "D3D3D3",
    "lightgrey": "D3D3D3",
    "darkgray": "A9A9A9",
    "darkgrey": "A9A9A9",
    "transparent": None,
}


def hex_color(v: str) -> tuple[str, float] | None:
    h = v[1:]
    if len(h) in HEX_SHORT:
        h = "".join(c * 2 for c in h)
    if len(h) == HEX_ALPHA:
        return h[:6].upper(), int(h[6:], 16) / 255.0
    if len(h) == HEX_PLAIN:
        return h.upper(), 1.0
    return None


def rgb_color(inner: str) -> tuple[str, float]:
    parts = [p.strip() for p in inner.replace("/", ",").split(",")]
    rgb = [round(float(p[:-1]) * 2.55) if p.endswith("%") else round(float(p)) for p in parts[:RGB_PARTS]]
    alpha = float(parts[3]) if len(parts) > RGB_PARTS else 1.0
    r, g, b = (max(0, min(CHANNEL_MAX, c)) for c in rgb)
    return f"{r:02X}{g:02X}{b:02X}", alpha


def parse_color(v: str | None) -> tuple[str, float] | None:
    if v is None:
        return None
    v = v.strip()
    if not v or v in ("none", "transparent"):
        return None
    if v.startswith("#"):
        return hex_color(v)
    m = RGB_RE.match(v)
    if m:
        return rgb_color(m.group(1))
    if v.lower() not in NAMED:
        return ("000000", 1.0)
    c = NAMED[v.lower()]
    return (c, 1.0) if c else None
