# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_illus.py
import math
import sys
from collections.abc import Mapping, Sequence
from typing import NamedTuple, Unpack

import bpy
from bpy.types import Collection, FreestyleSettings, Object, Scene
from mathutils import Vector
from scene_feat import feature_px
from scene_mat import il_info
from scene_rewrite import RewriteOpts, il_rewrite
from scene_state import GEOM_TYPES, IL_STATE, IlApplied, IllOptions, IllOpts, IlState

MM_PER_INCH = 25.4
PT_PER_INCH = 72.0
SIZE_CLASSES = ((1.0, 6.0), (0.65, 3.0), (0.4, 1.5), (0.25, 0.6))
PLAIN_CLASSES = ((1.0, 0.0),)
OUTLINE_TYPES = ("silhouette", "border", "contour", "external_contour")
INNER_TYPES = ("crease", "material_boundary")
EDGE_TYPES = (*OUTLINE_TYPES, *INNER_TYPES, "ridge_valley", "suggestive_contour", "edge_mark")
SHADOW_RGB = (0x2A / 255, 0x30 / 255, 0x3C / 255)
MIN_BOUNCES = 24


def _fit_resolution(sc: Scene, opt: IllOpts) -> float:
    r = sc.render
    if opt.fig_width_mm:
        need = math.ceil(opt.fig_width_mm / MM_PER_INCH * opt.dpi)
        if r.resolution_x < need:
            new_y = round(r.resolution_y * need / r.resolution_x)
            r.resolution_x, r.resolution_y = need, new_y
            msg = (
                f"ILLUSTRATE: resolution raised to {need}x{new_y} for {int(opt.dpi)} dpi at {opt.fig_width_mm:.0f} mm\n"
            )
            _ = sys.stdout.write(msg)
    return opt.fig_width_mm or r.resolution_x / opt.dpi * MM_PER_INCH


def _render_defaults(sc: Scene, opt: IllOpts) -> None:
    vs = sc.view_settings
    vs.view_transform = "Standard"
    vs.look = "None"
    vs.exposure = 0.0
    vs.gamma = 1.0
    c = sc.cycles
    c.use_denoising = False
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.01
    if opt.samples:
        c.samples = opt.samples
    c.max_bounces = 4
    c.diffuse_bounces = 1
    c.glossy_bounces = 0
    c.transmission_bounces = 0
    c.volume_bounces = 0
    c.transparent_max_bounces = max(c.transparent_max_bounces, MIN_BOUNCES)
    c.caustics_reflective = False
    c.caustics_refractive = False
    sc.render.filter_size = 1.0
    sc.render.film_transparent = True


def _light_vectors(light: tuple[float, float]) -> tuple[Vector, Vector]:
    a, e = math.radians(light[0]), math.radians(light[1])
    lc = Vector((math.cos(e) * math.cos(a), -math.cos(e) * math.sin(a), -math.sin(e))).normalized()
    return lc, (lc + Vector((0, 0, -1))).normalized()


def _material_users(objs: Sequence[Object]) -> dict[str, list[Object]]:
    users: dict[str, list[Object]] = {}
    for o in objs:
        for s in o.material_slots:
            if s.material:
                users.setdefault(s.material.name, []).append(o)
    return users


def _scene_size(objs: Sequence[Object]) -> float:
    pts = [o.matrix_world @ Vector(b) for o in objs if not o.is_shadow_catcher for b in o.bound_box]
    if not pts:
        return 1.0
    return max(max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(3))


def _rewrite_materials(users: Mapping[str, list[Object]], ropts: RewriteOpts) -> dict[str, str]:
    kinds: dict[str, str] = {}
    for m in list(bpy.data.materials):
        out = m.node_tree.get_output_node("CYCLES") if m.use_nodes else None
        if out is None or not out.inputs["Surface"].is_linked:
            continue
        if m.name in users and all(o.is_shadow_catcher for o in users[m.name]):
            continue
        info = il_info(out.inputs["Surface"].links[0].from_node)
        if info is None or info.kind == "clear":
            kinds[m.name] = "skip"
            continue
        kinds[m.name] = info.kind
        if info.kind != "emit":
            il_rewrite(m, out, info, users.get(m.name, []), ropts)
    return kinds


def _add_sun(sc: Scene, catchers: Sequence[Object]) -> None:
    rot = sc.camera.matrix_world.to_3x3()
    right = rot @ Vector((1, 0, 0))
    right.z = 0
    fwd = rot @ Vector((0, 0, -1))
    fwd.z = 0
    d = (
        Vector((0, 0, -1))
        + 0.12 * (right.normalized() if right.length else Vector())
        + 0.06 * (fwd.normalized() if fwd.length else Vector())
    )
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 10))
    sun = bpy.context.object
    sun.name = "IL_sun"
    sun.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sun.data.angle = math.radians(1.0)
    sun.data.energy = 3.0
    sun.hide_render = True
    for o in catchers:
        for sl in o.material_slots:
            if sl.material:
                sl.material["il_catcher"] = 1


def _lights_and_world(sc: Scene, catchers: Sequence[Object], opt: IllOpts) -> None:
    for o in sc.objects:
        if o.type == "LIGHT":
            o.hide_render = True
    w = sc.world or bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    bg = nt.nodes.new("ShaderNodeBackground")
    wo = nt.nodes.new("ShaderNodeOutputWorld")
    _ = nt.links.new(bg.outputs[0], wo.inputs[0])
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = 0.0
    if opt.shadow == "contact" and catchers:
        _add_sun(sc, catchers)
    for o in catchers:
        o.hide_render = True


def _collection(sc: Scene, name: str) -> Collection:
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in sc.collection.children:
        sc.collection.children.link(c)
    return c


def _pick_class(fp: float, classes: Sequence[tuple[float, float]]) -> int:
    for k, (_, lo) in enumerate(classes):
        if fp >= lo:
            return k
    return -1


def _assign_lines(
    sc: Scene,
    objs: Sequence[Object],
    kinds: Mapping[str, str],
    classes: Sequence[tuple[float, float]],
    px: float,
) -> tuple[list[str], list[int], list[Collection]]:
    noline = _collection(sc, "IL_noline")
    wcol = [_collection(sc, f"IL_w{k}") for k in range(len(classes))]
    dg = bpy.context.evaluated_depsgraph_get()
    tint_objs: list[str] = []
    nclass = [0] * (len(classes) + 1)
    for o in objs:
        ks = [kinds.get(s.material.name, "opaque") for s in o.material_slots if s.material] or ["opaque"]
        if all(k == "tint" for k in ks):
            tint_objs.append(o.name)
        idx = -1
        if not (o.is_shadow_catcher or all(k in ("emit", "skip") for k in ks)):
            idx = _pick_class(feature_px(o, sc, dg) / max(px, 1e-6), classes)
        nclass[idx] += 1
        target = noline if idx < 0 else wcol[idx]
        if o.name not in target.objects:
            target.objects.link(o)
    return tint_objs, nclass, wcol


def _linestyle(name: str, thickness: float) -> bpy.types.FreestyleLineStyle:
    sty = bpy.data.linestyles.new(name)
    sty.color = (0.1, 0.1, 0.12)
    sty.thickness = thickness
    sty.thickness_position = "CENTER"
    sty.caps = "ROUND"
    sty.use_chaining = True
    sty.chaining = "PLAIN"
    sty.use_same_object = True
    cm = sty.color_modifiers.new("mat", "MATERIAL")
    cm.material_attribute = "LINE"
    cm.blend = "MIX"
    cm.influence = 1.0
    return sty


def _add_lineset(fs: FreestyleSettings, coll: Collection, name: str, types: Sequence[str], thickness: float) -> None:
    ls = fs.linesets.new(name)
    ls.select_by_visibility = True
    ls.visibility = "VISIBLE"
    ls.select_by_edge_types = True
    ls.edge_type_combination = "OR"
    for t in EDGE_TYPES:
        setattr(ls, "select_" + t, t in types)
    ls.select_by_collection = True
    ls.collection = coll
    ls.collection_negation = "INCLUSIVE"
    ls.linestyle = _linestyle(name, thickness)


def _make_lines(
    sc: Scene,
    opt: IllOpts,
    wcol: Sequence[Collection],
    classes: Sequence[tuple[float, float]],
    px: float,
) -> None:
    r = sc.render
    r.use_freestyle = True
    r.line_thickness_mode = "ABSOLUTE"
    r.line_thickness = 1.0
    kinds = (("IL_outline", 1.0, OUTLINE_TYPES), ("IL_inner", opt.inner, INNER_TYPES))
    for vl in sc.view_layers:
        vl.use_freestyle = True
        fs = vl.freestyle_settings
        fs.mode = "EDITOR"
        fs.use_smoothness = True
        fs.crease_angle = math.radians(opt.crease)
        fs.use_culling = False
        fs.as_render_pass = False
        for ls in list(fs.linesets):
            fs.linesets.remove(ls)
        for k, (cf, _) in enumerate(classes):
            for name, wgt, types in kinds:
                if wcol[k].objects:
                    _add_lineset(fs, wcol[k], f"{name}{k}", types, max(0.6, px * wgt * cf))


def _rewrite_opts(opt: IllOpts, lc: Vector, hc: Vector, size: float) -> RewriteOpts:
    return RewriteOpts(
        lc=lc,
        hc=hc,
        bands=opt.bands,
        edges=opt.edges,
        grade=opt.grade,
        contrast=opt.contrast,
        ao=opt.ao,
        ao_dist=0.02 * size,
        highlight=opt.highlight,
        palette=opt.palette,
        snap=opt.snap,
        texture=opt.texture,
    )


class Report(NamedTuple):
    kinds: Mapping[str, str]
    px: float
    width_mm: float
    nclass: Sequence[int]
    outline_pt: float
    shadow: str


def _summary(r: Report) -> str:
    vals = list(r.kinds.values())
    counts = ", ".join(f"{k} {vals.count(k)}" for k in sorted(set(vals)))
    per_class = "/".join(str(n) for n in r.nclass)
    return (
        f"ILLUSTRATE: {len(r.kinds)} materials ({counts}), outline {r.px:.2f} px "
        f"({r.outline_pt:.2f} pt at {r.width_mm:.0f} mm), objects per line weight {per_class}, shadow {r.shadow}\n"
    )


def _prepare(sc: Scene, opt: IllOpts) -> tuple[list[Object], dict[str, str], float]:
    lc, hc = _light_vectors(opt.light)
    objs = [o for o in sc.objects if o.type in GEOM_TYPES and not o.hide_render]
    users = _material_users(objs)
    size = _scene_size(objs)
    return objs, _rewrite_materials(users, _rewrite_opts(opt, lc, hc, size)), size


def illustrate_scene(sc: Scene | None = None, **opts: Unpack[IllOptions]) -> IlApplied:
    sc = sc or bpy.context.scene
    st = IL_STATE.setdefault(sc.name, IlState())
    if st.applied is not None:
        return st.applied
    opt = IllOpts(**opts)
    width_mm = _fit_resolution(sc, opt)
    px_per_pt = sc.render.resolution_x / (width_mm / MM_PER_INCH * PT_PER_INCH)
    _render_defaults(sc, opt)
    objs, kinds, size = _prepare(sc, opt)
    catchers = [o for o in objs if o.is_shadow_catcher]
    _lights_and_world(sc, catchers, opt)
    px = opt.outline_pt * px_per_pt
    classes = SIZE_CLASSES if opt.weight_by_size else PLAIN_CLASSES
    tint_objs, nclass, wcol = _assign_lines(sc, objs, kinds, classes, px)
    if opt.lines:
        _make_lines(sc, opt, wcol, classes, px)
    contact = opt.shadow == "contact" and bool(catchers)
    info = IlApplied(
        px=px,
        px_per_pt=px_per_pt,
        tint_objs=tint_objs,
        through=opt.through if opt.lines else 0.0,
        kinds=kinds,
        catchers=[o.name for o in catchers],
        size=size,
        sun="IL_sun" if contact else None,
        shadow=opt.shadow_opacity if contact else 0.0,
        shadow_rgb=SHADOW_RGB,
    )
    st.applied = info
    st.pending = None
    shadow = opt.shadow if catchers else "none (no floor)"
    _ = sys.stdout.write(_summary(Report(kinds, px, width_mm, nclass, opt.outline_pt, shadow)))
    return info
