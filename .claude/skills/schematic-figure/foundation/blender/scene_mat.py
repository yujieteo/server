# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/scene_mat.py
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, replace

import bpy
from bpy.types import Node, NodeSocket, Object
from scene_color import Rgb, Vec3, l2s

GREY: Rgb = (0.5, 0.5, 0.5)
NOISE_NODES = ("ShaderNodeTexNoise", "ShaderNodeTexVoronoi", "ShaderNodeTexMusgrave", "ShaderNodeTexWave")
PASS_NODES = ("ShaderNodeHueSaturation", "ShaderNodeGamma", "ShaderNodeBrightContrast", "ShaderNodeInvert")
MIX_NODES = ("ShaderNodeMix", "ShaderNodeMixRGB")
SKIP_NODES = ("ShaderNodeTexNoise", "ShaderNodeTexCoord", "ShaderNodeMapping")
EMIT_STRENGTH = 0.4
EMIT_COLOR = 0.01
OPAQUE_ALPHA = 0.95
HALF = 0.5
TRANSMISSION = 0.5
SIMILAR = 0.3
MAX_REP_DEPTH = 12
MAX_ATTR_SAMPLES = 400


@dataclass
class SurfInfo:
    kind: str
    col: NodeSocket | None = None
    rough: float = 0.5
    metal: float = 0.0
    face: float | None = None
    edge: float | None = None
    rim: NodeSocket | None = None


def sock_float(s: NodeSocket) -> float:
    v = s.default_value
    return float(v) if isinstance(v, int | float) else v[0]


def sock_rgb(s: NodeSocket) -> Rgb:
    v = s.default_value
    if isinstance(v, int | float):
        return (v, v, v)
    return (v[0], v[1], v[2])


def upstream(sock: NodeSocket, idnames: Sequence[str], depth: int = 8) -> Node | None:
    front = [lk.from_node for lk in sock.links]
    seen: set[str] = set()
    for _ in range(depth):
        nxt: list[Node] = []
        for n in front:
            if n.name in seen:
                continue
            seen.add(n.name)
            if n.bl_idname in idnames:
                return n
            for i in n.inputs:
                nxt += [lk.from_node for lk in i.links]
        front = nxt
    return None


def face_edge(sock: NodeSocket, default: tuple[float, float] = (0.12, 0.8)) -> tuple[float, float]:
    if not sock.is_linked:
        v = sock_float(sock)
        return v, v
    mr = upstream(sock, ("ShaderNodeMapRange",))
    if mr:
        a, b = sock_float(mr.inputs[3]), sock_float(mr.inputs[4])
        return min(a, b), max(a, b)
    return default


def _principled_info(node: Node) -> SurfInfo:
    inp = node.inputs
    es, ec = inp["Emission Strength"], inp["Emission Color"]
    if (es.is_linked or sock_float(es) >= EMIT_STRENGTH) and (ec.is_linked or max(sock_rgb(ec)) > EMIT_COLOR):
        return SurfInfo(kind="emit")
    info = SurfInfo(
        kind="opaque",
        col=inp["Base Color"],
        rough=sock_float(inp["Roughness"]),
        metal=sock_float(inp["Metallic"]),
    )
    al, tw = inp["Alpha"], inp["Transmission Weight"]
    if sock_float(tw) >= TRANSMISSION and not tw.is_linked:
        return replace(info, kind="tint", face=0.1, edge=0.6)
    if al.is_linked or sock_float(al) < OPAQUE_ALPHA:
        f, e = face_edge(al)
        return replace(info, kind="tint", face=f, edge=max(e, min(1.0, f + 0.4)))
    return info


def _leaf_info(node: Node) -> SurfInfo | None:
    t, inp = node.bl_idname, node.inputs
    if t == "ShaderNodeBsdfPrincipled":
        return _principled_info(node)
    if t in ("ShaderNodeBsdfDiffuse", "ShaderNodeBsdfToon"):
        return SurfInfo(kind="opaque", col=inp["Color"], rough=1.0, metal=0.0)
    if t == "ShaderNodeEmission":
        return SurfInfo(kind="emit")
    if t == "ShaderNodeBsdfTransparent":
        return SurfInfo(kind="clear")
    if t in ("ShaderNodeBsdfGlass", "ShaderNodeBsdfRefraction"):
        return SurfInfo(kind="tint", col=inp["Color"], face=0.1, edge=0.6, rough=0.0, metal=0.0)
    return None


def _clear_mix(fac: NodeSocket, sub: list[SurfInfo], kinds: list[str]) -> SurfInfo:
    j = 1 - kinds.index("clear")
    o = sub[j]
    if o.kind == "clear":
        return SurfInfo(kind="clear")
    if fac.is_linked:
        f, e = face_edge(fac, (0.15, 0.8))
    else:
        f = e = sock_float(fac) if j == 1 else 1 - sock_float(fac)
    face = 1.0 if o.face is None else o.face
    edge = 1.0 if o.edge is None else o.edge
    return replace(o, kind="tint", face=f * face, edge=max(e * edge, min(1.0, f + 0.4)))


def _tint_mix(fac: NodeSocket, sub: list[SurfInfo], kinds: list[str]) -> SurfInfo:
    ti = kinds.index("tint")
    tint, o = sub[ti], sub[1 - ti]
    if o.kind != "opaque":
        return tint
    face = 0.1 if tint.face is None else tint.face
    if fac.is_linked:
        edge = 0.6 if tint.edge is None else tint.edge
        return replace(tint, rim=o.col, face=face, edge=max(edge, 0.7))
    w = sock_float(fac) if ti == 0 else 1 - sock_float(fac)
    f = face + (1 - face) * 0.95 * w
    return replace(o, kind="tint", face=f, edge=min(1.0, f + 0.3))


def _mix_info(node: Node, infos: Mapping[str, SurfInfo | None]) -> SurfInfo | None:
    inp = node.inputs
    found = [infos[inp[k].links[0].from_node.name] if inp[k].is_linked else SurfInfo(kind="clear") for k in (1, 2)]
    sub = [s for s in found if s is not None]
    if len(sub) < len(found):
        return None
    kinds = [s.kind for s in sub]
    if "emit" in kinds:
        return SurfInfo(kind="emit")
    if "clear" in kinds:
        return _clear_mix(inp[0], sub, kinds)
    if kinds == ["opaque", "opaque"]:
        return sub[1] if (inp[0].is_linked or sock_float(inp[0]) >= HALF) else sub[0]
    return _tint_mix(inp[0], sub, kinds)


def _mix_children(node: Node) -> list[Node]:
    return [node.inputs[k].links[0].from_node for k in (1, 2) if node.inputs[k].is_linked]


def il_info(root: Node) -> SurfInfo | None:
    order: list[Node] = []
    stack = [root]
    while stack:
        n = stack.pop()
        order.append(n)
        if n.bl_idname == "ShaderNodeMixShader":
            stack += _mix_children(n)
    infos: dict[str, SurfInfo | None] = {}
    for n in reversed(order):
        infos[n.name] = _mix_info(n, infos) if n.bl_idname == "ShaderNodeMixShader" else _leaf_info(n)
    return infos[root.name]


def _attr_colors(n: Node, users: Sequence[Object]) -> list[Vec3]:
    name = n.layer_name if n.bl_idname == "ShaderNodeVertexColor" else n.attribute_name
    cs: list[Vec3] = []
    for o in users:
        me = o.data
        if not isinstance(me, bpy.types.Mesh) or not len(me.color_attributes):
            continue
        a = me.color_attributes[name] if name in me.color_attributes else me.color_attributes[0]
        k = max(1, len(a.data) // MAX_ATTR_SAMPLES)
        cs += [a.data[i].color[:3] for i in range(0, len(a.data), k)]
    return cs


def _avg(cs: Sequence[Vec3]) -> Rgb:
    n = max(1, len(cs))
    return (sum(c[0] for c in cs) / n, sum(c[1] for c in cs) / n, sum(c[2] for c in cs) / n)


def _rep_leaf(s: NodeSocket, users: Sequence[Object]) -> Rgb:
    n = s.links[0].from_node
    t = n.bl_idname
    if t == "ShaderNodeValToRGB":
        return _avg([e.color[:3] for e in n.color_ramp.elements])
    if t == "ShaderNodeRGB":
        return sock_rgb(s.links[0].from_socket)
    if t == "ShaderNodeObjectInfo":
        return _avg([o.color[:3] for o in users]) if users else GREY
    if t in ("ShaderNodeVertexColor", "ShaderNodeAttribute"):
        cs = _attr_colors(n, users)
        if cs:
            return _avg(cs)
    return GREY


def _rep_children(s: NodeSocket) -> list[tuple[NodeSocket, float]] | None:
    n = s.links[0].from_node
    t = n.bl_idname
    if t == "ShaderNodeMix":
        f = sock_float(n.inputs[0]) if not n.inputs[0].is_linked else HALF
        return [(n.inputs[6], 1 - f), (n.inputs[7], f)]
    if t == "ShaderNodeMixRGB":
        return [(n.inputs[1], HALF), (n.inputs[2], HALF)]
    if t in PASS_NODES:
        return [(n.inputs["Color"], 1.0)]
    if t == "ShaderNodeVectorMath":
        sc = n.inputs["Scale"]
        k = sock_float(sc) if n.operation == "SCALE" and not sc.is_linked else 1.0
        return [(n.inputs[0], k)]
    return None


def rep_color(sock: NodeSocket | None, users: Sequence[Object]) -> Rgb:
    if sock is None:
        return GREY
    acc = [0.0, 0.0, 0.0]
    stack = [(sock, 1.0, 0)]
    while stack:
        s, w, depth = stack.pop()
        if not s.is_linked or depth > MAX_REP_DEPTH:
            leaf = sock_rgb(s)
        else:
            kids = _rep_children(s)
            if kids is not None:
                stack += [(k, w * kw, depth + 1) for k, kw in kids]
                continue
            leaf = _rep_leaf(s, users)
        acc = [a + w * c for a, c in zip(acc, leaf, strict=False)]
    return (acc[0], acc[1], acc[2])


def _noisy(s: NodeSocket) -> bool:
    return s.is_linked and upstream(s, NOISE_NODES) is not None


def _pin(n: Node, key: str | int, value: float) -> int:
    for lk in list(n.inputs[key].links):
        n.id_data.links.remove(lk)
    n.inputs[key].default_value = value
    return 1


def _flatten_node(n: Node) -> int:
    k = 0
    if n.bl_idname in MIX_NODES and _noisy(n.inputs[0]):
        a, b = (6, 7) if n.bl_idname == "ShaderNodeMix" else (1, 2)
        ca, cb = rep_color(n.inputs[a], []), rep_color(n.inputs[b], [])
        if sum((l2s(x) - l2s(y)) ** 2 for x, y in zip(ca, cb, strict=False)) ** HALF < SIMILAR:
            k += _pin(n, 0, 0.5)
    if n.bl_idname == "ShaderNodeVectorMath" and n.operation == "SCALE" and _noisy(n.inputs["Scale"]):
        k += _pin(n, "Scale", 1.0)
    return k


def flatten(sock: NodeSocket | None) -> int:
    if sock is None or not sock.is_linked:
        return 0
    k = 0
    front = [sock.links[0].from_node]
    seen: set[str] = set()
    while front:
        n = front.pop()
        if n.name in seen:
            continue
        seen.add(n.name)
        k += _flatten_node(n)
        for i in n.inputs:
            if i.type in ("RGBA", "VECTOR") or n.bl_idname in MIX_NODES:
                front += [lk.from_node for lk in i.links if lk.from_node.bl_idname not in SKIP_NODES]
    return k
