# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/svg2pptx_native_font.py
from pathlib import Path

from PIL import ImageFont
from PIL.ImageFont import FreeTypeFont

HERE = Path(__file__).resolve().parent
FONT_DIR = HERE.parent / "fonts"
MAC_FONTS = "/System/Library/Fonts/Supplemental/"
MAC_PPT = "/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts/"
WIN_FONTS = "C:/Windows/Fonts/"
LINUX_MS = "/usr/share/fonts/truetype/msttcorefonts/"
LINUX_LIB = "/usr/share/fonts/truetype/liberation/"
SERIFS = ("cambria", "times new roman", "latin modern roman")
GLYPH_UNITS = 1000
SERIF_WIDTH = 0.5
SANS_WIDTH = 0.55
BOLD_WIDTH = 1.05
QUOTE_CHARS = "\x27\x22"

type FontId = tuple[str, bool, bool]

FONT_FILES: dict[FontId, list[str]] = {
    ("arial", False, False): [
        MAC_FONTS + "Arial.ttf",
        WIN_FONTS + "arial.ttf",
        LINUX_MS + "Arial.ttf",
        LINUX_LIB + "LiberationSans-Regular.ttf",
    ],
    ("arial", True, False): [
        MAC_FONTS + "Arial Bold.ttf",
        WIN_FONTS + "arialbd.ttf",
        LINUX_LIB + "LiberationSans-Bold.ttf",
    ],
    ("arial", False, True): [
        MAC_FONTS + "Arial Italic.ttf",
        WIN_FONTS + "ariali.ttf",
        LINUX_LIB + "LiberationSans-Italic.ttf",
    ],
    ("arial", True, True): [
        MAC_FONTS + "Arial Bold Italic.ttf",
        WIN_FONTS + "arialbi.ttf",
        LINUX_LIB + "LiberationSans-BoldItalic.ttf",
    ],
    ("cambria", False, False): [MAC_PPT + "Cambria.ttc", WIN_FONTS + "cambria.ttc"],
    ("cambria", True, False): [MAC_PPT + "Cambriab.ttf", WIN_FONTS + "cambriab.ttf"],
    ("cambria", False, True): [MAC_PPT + "Cambriai.ttf", WIN_FONTS + "cambriai.ttf"],
    ("cambria", True, True): [MAC_PPT + "Cambriaz.ttf", WIN_FONTS + "cambriaz.ttf"],
    ("times new roman", False, False): [MAC_FONTS + "Times New Roman.ttf", WIN_FONTS + "times.ttf"],
    ("times new roman", True, False): [MAC_FONTS + "Times New Roman Bold.ttf"],
    ("times new roman", False, True): [MAC_FONTS + "Times New Roman Italic.ttf"],
    ("times new roman", True, True): [MAC_FONTS + "Times New Roman Bold Italic.ttf"],
    ("latin modern roman", False, False): [str(FONT_DIR / "lmroman10-regular.otf")],
    ("latin modern roman", True, False): [str(FONT_DIR / "lmroman10-bold.otf")],
    ("latin modern roman", False, True): [str(FONT_DIR / "lmroman10-italic.otf")],
    ("latin modern roman", True, True): [str(FONT_DIR / "lmroman10-italic.otf")],
}
FONT_CACHE: dict[FontId, FreeTypeFont | None] = {}


def open_font(ident: FontId) -> FreeTypeFont | None:
    for path in FONT_FILES.get(ident, []):
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, GLYPH_UNITS)
            except (OSError, ImportError, ValueError):
                return None
    return None


def load_font(name: str, *, bold: bool, italic: bool) -> FreeTypeFont | None:
    ident = (name.lower(), bold, italic)
    if ident in FONT_CACHE:
        return FONT_CACHE[ident]
    font = open_font(ident)
    FONT_CACHE[ident] = font
    return font


def font_length(font: FreeTypeFont, s: str) -> float | None:
    try:
        return font.getlength(s)
    except (OSError, ValueError, UnicodeError):
        return None


def text_width(s: str, family: str, size: float, *, bold: bool, italic: bool) -> float:
    font = load_font(family, bold=bold, italic=italic)
    if font is not None:
        length = font_length(font, s)
        if length is not None:
            return length * size / 1000.0
    serif = family.lower() in SERIFS
    return len(s) * size * (SERIF_WIDTH if serif else SANS_WIDTH) * (BOLD_WIDTH if bold else 1.0)


def first_family(v: str | None) -> str:
    if not v:
        return "Arial"
    first = v.split(",")[0].strip().strip(QUOTE_CHARS)
    generic = {"sans-serif": "Arial", "serif": "Times New Roman", "monospace": "Courier New"}
    return generic.get(first.lower(), first)
