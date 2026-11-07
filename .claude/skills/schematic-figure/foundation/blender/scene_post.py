# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_post.py
import contextlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

import bpy
import numpy as np
from bpy.types import Material, MaterialSlot, NodeSocket, Object, Scene
from mathutils import Vector
from scene_state import GEOM_TYPES, IlApplied

PASS_NAMES = ("lines", "mask", "shadow")
MAX_PASS_SAMPLES = 32
ALPHA_FLOOR = 1e-6
FLOAT_GAP = 0.02


@dataclass
class PostPlan:
    tint: list[str]
    need_lines: bool
    cat: list[Object]
    sun: Object | None
    need_shadow: bool


@dataclass
class PassState:
    fs0: bool
    samples: int
    out_png: str
    saved: list[tuple[Material, NodeSocket | None]] = field(default_factory=list)
    swaps: list[tuple[MaterialSlot, Material]] = field(default_factory=list)
    floated: list[Object] = field(default_factory=list)


def _plan(sc: Scene, info: IlApplied) -> PostPlan:
    tint = [n for n in info.tint_objs if n in sc.objects]
    cat = [sc.objects[n] for n in info.catchers if n in sc.objects]
    sun = sc.objects.get(info.sun or "")
    return PostPlan(
        tint=tint,
        need_lines=bool(tint) and info.through > 0 and sc.render.use_freestyle,
        cat=cat,
        sun=sun,
        need_shadow=info.shadow > 0 and bool(cat) and sun is not None,
    )


def _white_material() -> Material:
    white = bpy.data.materials.new("IL_mask")
    white.use_nodes = True
    we = white.node_tree.nodes.new("ShaderNodeEmission")
    we.inputs[0].default_value = (1, 1, 1, 1)
    out = white.node_tree.get_output_node("CYCLES")
    if out is not None:
        _ = white.node_tree.links.new(we.outputs[0], out.inputs["Surface"])
    return white


def _holdout_all(white: Material, state: PassState) -> None:
    for m in bpy.data.materials:
        if m.name == white.name or not m.use_nodes or m.get("il_catcher"):
            continue
        out = m.node_tree.get_output_node("CYCLES")
        if out is None:
            continue
        surface = out.inputs["Surface"]
        state.saved.append((m, surface.links[0].from_socket if surface.is_linked else None))
        ho = m.node_tree.nodes.new("ShaderNodeHoldout")
        _ = m.node_tree.links.new(ho.outputs[0], surface)


def _unhold_all(state: PassState) -> None:
    for m, src in state.saved:
        out = m.node_tree.get_output_node("CYCLES")
        if out is None:
            continue
        for lk in list(out.inputs["Surface"].links):
            m.node_tree.links.remove(lk)
        if src is not None:
            _ = m.node_tree.links.new(src, out.inputs["Surface"])


def _render_to(sc: Scene, path: str) -> None:
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def _lines_pass(sc: Scene, plan: PostPlan, paths: dict[str, str], white: Material, state: PassState) -> None:
    for n in plan.tint:
        sc.objects[n].hide_render = True
    _render_to(sc, paths["lines"])
    for n in plan.tint:
        sc.objects[n].hide_render = False
    for n in plan.tint:
        for s in sc.objects[n].material_slots:
            state.swaps.append((s, s.material))
            s.material = white
    sc.render.use_freestyle = False
    _render_to(sc, paths["mask"])
    for s, mm in state.swaps:
        s.material = mm
    state.swaps.clear()


def _hover_off(sc: Scene, plan: PostPlan, info: IlApplied, state: PassState) -> None:
    zf = max(o.matrix_world.translation.z for o in plan.cat)
    gap = FLOAT_GAP * info.size
    for o in sc.objects:
        if o.type not in GEOM_TYPES or o.hide_render or o in plan.cat or not o.visible_shadow:
            continue
        if min((o.matrix_world @ Vector(c)).z for c in o.bound_box) > zf + gap:
            o.visible_shadow = False
            state.floated.append(o)


def _shadow_pass(sc: Scene, plan: PostPlan, info: IlApplied, paths: dict[str, str], state: PassState) -> None:
    sc.render.use_freestyle = False
    for o in plan.cat:
        o.hide_render = False
    if plan.sun is not None:
        plan.sun.hide_render = False
    _hover_off(sc, plan, info, state)
    _render_to(sc, paths["shadow"])


def _restore(sc: Scene, plan: PostPlan, state: PassState) -> None:
    sc.render.use_freestyle = state.fs0
    sc.cycles.samples = state.samples
    sc.render.filepath = state.out_png
    for s, mm in state.swaps:
        s.material = mm
    for o in plan.cat:
        o.hide_render = True
    for o in state.floated:
        o.visible_shadow = True
    if plan.sun is not None:
        plan.sun.hide_render = True
    _unhold_all(state)


def il_image(path: str) -> tuple[np.ndarray, tuple[int, int]]:
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4), (w, h)


def _over(frgb: np.ndarray, fa: np.ndarray, brgb: np.ndarray, ba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    oa = fa + ba * (1 - fa)
    return np.where(oa > ALPHA_FLOOR, (frgb * fa + brgb * ba * (1 - fa)) / np.maximum(oa, ALPHA_FLOOR), 0), oa


def _composite(out_png: str, info: IlApplied, plan: PostPlan, paths: dict[str, str]) -> None:
    arr, (w, h) = il_image(out_png)
    rgb, al = arr[..., :3], arr[..., 3:4]
    if plan.need_shadow:
        shadow_img, _ = il_image(paths["shadow"])
        sa = np.clip(shadow_img[..., 3:4], 0, 1) * info.shadow
        rgb, al = _over(rgb, al, np.broadcast_to(np.array(info.shadow_rgb, np.float32), rgb.shape), sa)
    if plan.need_lines:
        lines_img, _ = il_image(paths["lines"])
        mask_img, _ = il_image(paths["mask"])
        la = lines_img[..., 3:4] * np.clip(mask_img[..., 3:4], 0, 1) * info.through
        rgb, al = _over(lines_img[..., :3], la, rgb, al)
    res = np.concatenate([rgb, al], axis=2).astype(np.float32).ravel()
    img = bpy.data.images.new("IL_out", w, h, alpha=True)
    img.pixels.foreach_set(res)
    img.filepath_raw = out_png
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


def _run_passes(sc: Scene, info: IlApplied, plan: PostPlan, paths: dict[str, str], state: PassState) -> None:
    white = _white_material()
    _holdout_all(white, state)
    sc.cycles.samples = min(state.samples, MAX_PASS_SAMPLES)
    try:
        if plan.need_lines:
            _lines_pass(sc, plan, paths, white, state)
        if plan.need_shadow:
            _shadow_pass(sc, plan, info, paths, state)
    finally:
        _restore(sc, plan, state)


def il_post(sc: Scene, out_png: str, info: IlApplied) -> None:
    plan = _plan(sc, info)
    if not (plan.need_lines or plan.need_shadow):
        return
    stem = out_png[:-4] if out_png.lower().endswith(".png") else out_png
    paths = {k: f"{stem}.il_{k}.png" for k in PASS_NAMES}
    state = PassState(fs0=sc.render.use_freestyle, samples=sc.cycles.samples, out_png=out_png)
    _run_passes(sc, info, plan, paths, state)
    _composite(out_png, info, plan, paths)
    for p in paths.values():
        with contextlib.suppress(OSError):
            Path(p).unlink()
    lines = f", lines behind {len(plan.tint)} see-through objects" if plan.need_lines else ""
    _ = sys.stdout.write(f"ILLUSTRATE: post-pass{' contact shadow' if plan.need_shadow else ''}{lines}\n")
