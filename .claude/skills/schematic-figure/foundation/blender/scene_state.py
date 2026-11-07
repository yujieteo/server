# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_state.py
import os
from dataclasses import dataclass
from typing import TypedDict

from scene_color import Palette, Rgb


class IllOptions(TypedDict, total=False):
    outline_pt: float
    fig_width_mm: float | None
    bands: int
    palette: Palette | None
    snap: float
    shadow: str
    shadow_opacity: float
    light: tuple[float, float]
    edges: tuple[float, float]
    grade: float
    contrast: float
    ao: float
    highlight: float
    inner: float
    crease: float
    through: float
    texture: bool
    weight_by_size: bool
    dpi: float
    samples: int | None
    lines: bool


@dataclass
class IllOpts:
    outline_pt: float = 0.5
    fig_width_mm: float | None = None
    bands: int = 3
    palette: Palette | None = None
    snap: float = 0.12
    shadow: str = "contact"
    shadow_opacity: float = 0.22
    light: tuple[float, float] = (-135.0, 30.0)
    edges: tuple[float, float] = (-0.1, 0.82)
    grade: float = 0.06
    contrast: float = 1.0
    ao: float = 0.3
    highlight: float = 0.55
    inner: float = 0.55
    crease: float = 140.0
    through: float = 0.75
    texture: bool = False
    weight_by_size: bool = True
    dpi: float = 600
    samples: int | None = None
    lines: bool = True


@dataclass
class IlApplied:
    px: float
    px_per_pt: float
    tint_objs: list[str]
    through: float
    kinds: dict[str, str]
    catchers: list[str]
    size: float
    sun: str | None
    shadow: float
    shadow_rgb: Rgb


@dataclass
class IlState:
    pending: IllOptions | None = None
    applied: IlApplied | None = None


@dataclass
class StyleDefault:
    style: str
    opts: IllOptions


IL_STATE: dict[str, IlState] = {}
STYLE3D = StyleDefault(style=(os.environ.get("SCHEMATIC_3D_STYLE") or "render").strip().lower(), opts={})
GEOM_TYPES = ("MESH", "CURVE", "SURFACE", "META", "FONT")
