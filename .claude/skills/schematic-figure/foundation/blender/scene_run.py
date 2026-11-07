# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_run.py
import json
import os
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import TypedDict, Unpack

import bpy
from bpy.types import CyclesPreferences, Scene
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from scene_color import Vec3
from scene_illus import illustrate_scene
from scene_post import il_post
from scene_state import IL_STATE, STYLE3D, IllOptions, IlState

GPU_BACKENDS = ("OPTIX", "CUDA", "METAL", "HIP", "ONEAPI")
DEVICE_MODES = ("auto", "gpu", "cpu")
STYLES = ("render", "illustration")
PREFS_ERRORS = (KeyError, AttributeError, RuntimeError, TypeError, ValueError)
CPU_SAMPLES = 96
GPU_SAMPLES = 192


class SetupOpts(TypedDict, total=False):
    style: str | None
    illustrate: IllOptions | None


def _pick_gpus(prefs: CyclesPreferences, kind: str) -> list[str] | None:
    try:
        prefs.compute_device_type = kind
    except TypeError:
        return None
    if hasattr(prefs, "refresh_devices"):
        prefs.refresh_devices()
    else:
        prefs.get_devices()
    gpus = [d for d in prefs.devices if d.type == kind] or [d for d in prefs.devices if d.type != "CPU"]
    if not gpus:
        return None
    for d in prefs.devices:
        d.use = d in gpus
    return [d.name for d in gpus]


def _find_gpu() -> tuple[str, str] | None:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in GPU_BACKENDS:
        names = _pick_gpus(prefs, kind)
        if names:
            return kind, ", ".join(names)
    return None


def use_device(sc: Scene, mode: str | None = None) -> str:
    mode = (mode or os.environ.get("SCHEMATIC_3D_DEVICE") or "auto").strip().lower()
    if mode not in DEVICE_MODES:
        msg = f"SCHEMATIC_3D_DEVICE must be 'auto', 'gpu' or 'cpu', not {mode!r}"
        raise ValueError(msg)
    found = None
    why = "forced by SCHEMATIC_3D_DEVICE=cpu" if mode == "cpu" else "no GPU found"
    if mode != "cpu":
        try:
            found = _find_gpu()
        except PREFS_ERRORS as e:
            why = f"GPU setup failed ({e})"
    if found:
        sc.cycles.device = "GPU"
        _ = sys.stdout.write(f"schematic-3d: Cycles device = {found[0]} ({found[1]})\n")
        return found[0]
    sc.cycles.device = "CPU"
    _ = sys.stdout.write(f"schematic-3d: Cycles device = CPU ({why})\n")
    return "CPU"


def _register_style(sc: Scene, style: str | None, illustrate: IllOptions | None) -> None:
    _ = IL_STATE.pop(sc.name, None)
    st = style or STYLE3D.style
    if st == "illustration":
        merged = STYLE3D.opts.copy()
        merged.update(illustrate or {})
        IL_STATE[sc.name] = IlState(pending=merged)
    elif st != "render":
        msg = f"style must be 'render' or 'illustration', not {st!r}"
        raise ValueError(msg)


def setup(
    width_px: int = 2400,
    height_px: int = 1200,
    samples: int | None = None,
    world: float = 0.35,
    **extra: Unpack[SetupOpts],
) -> Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    dev = use_device(sc)
    if samples is None:
        samples = CPU_SAMPLES if dev == "CPU" else GPU_SAMPLES
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = width_px
    sc.render.resolution_y = height_px
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = world
    _register_style(sc, extra.get("style"), extra.get("illustrate"))
    return sc


def use_style(style: str = "illustration", **opts: Unpack[IllOptions]) -> None:
    if style not in STYLES:
        raise ValueError(style)
    STYLE3D.style = style
    STYLE3D.opts = opts.copy()


def _project_anchors(sc: Scene, anchors: Mapping[str, Vec3]) -> tuple[dict[str, list[float]], list[str]]:
    placed: dict[str, list[float]] = {}
    off: list[str] = []
    rx, ry = sc.render.resolution_x, sc.render.resolution_y
    for name, p in anchors.items():
        v = world_to_camera_view(sc, sc.camera, Vector(p))
        px = [v.x * rx, (1 - v.y) * ry]
        placed[name] = px
        if not (0 <= px[0] <= rx and 0 <= px[1] <= ry) or v.z < 0:
            off.append(name)
    return placed, off


def finish(sc: Scene, out_png: str, anchors: Mapping[str, Vec3] | None = None) -> None:
    st = IL_STATE.get(sc.name)
    if st and st.pending is not None and st.applied is None:
        _ = illustrate_scene(sc, **st.pending)
    sc.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    st = IL_STATE.get(sc.name)
    if st and st.applied:
        il_post(sc, out_png, st.applied)
    placed, off = _project_anchors(sc, anchors or {})
    size = [sc.render.resolution_x, sc.render.resolution_y]
    _ = Path(out_png + ".json").write_text(json.dumps({"size": size, "anchors": placed, "off_frame": off}, indent=1))
    flag = "OFF-FRAME" if off else ""
    _ = sys.stdout.write(f"RENDERED {out_png} anchors {placed} {flag} {off}\n")
