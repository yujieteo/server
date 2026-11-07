# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/device3d_mat.py
import bpy
from device3d_types import MatSpec
from scene import hex_rgb, mat

MAX_BYTE = 255
DEFAULT_COLOR: dict[str, str] = {
    "metal": "#b9bec5",
    "steel": "#b4b9bf",
    "gold": "#d6a74f",
    "copper": "#c8825a",
    "aluminium": "#c6c9ce",
    "lithium": "#b3b8bf",
    "oxide": "#dcd8cf",
    "ceramic": "#e6e2da",
    "semiconductor": "#5f6878",
    "graphene": "#30343b",
    "carbon": "#2e2e30",
    "polymer": "#e8edf1",
    "separator": "#f3f3ef",
    "electrolyte": "#bcdcec",
    "glass": "#e6f2fa",
    "plastic": "#9aa3ad",
    "rubber": "#34373c",
    "emissive": "#e8322b",
}
KIND_SETTINGS: dict[str, dict[str, float]] = {
    "metal": {"Metallic": 1.0, "Roughness": 0.38},
    "steel": {"Metallic": 1.0, "Roughness": 0.42},
    "gold": {"Metallic": 1.0, "Roughness": 0.4},
    "copper": {"Metallic": 1.0, "Roughness": 0.36},
    "aluminium": {"Metallic": 1.0, "Roughness": 0.40},
    "lithium": {"Metallic": 0.85, "Roughness": 0.45},
    "oxide": {"Roughness": 0.62, "Specular IOR Level": 0.35},
    "ceramic": {"Roughness": 0.5, "Specular IOR Level": 0.4, "Coat Weight": 0.08},
    "semiconductor": {"Metallic": 0.3, "Roughness": 0.34, "Coat Weight": 0.15},
    "graphene": {"Metallic": 0.2, "Roughness": 0.42, "Coat Weight": 0.2},
    "carbon": {"Roughness": 0.85, "Specular IOR Level": 0.25},
    "polymer": {"Roughness": 0.38, "Coat Weight": 0.25, "Alpha": 0.6},
    "separator": {"Roughness": 0.7, "Alpha": 0.8, "Specular IOR Level": 0.3},
    "electrolyte": {"Roughness": 0.12, "Coat Weight": 0.5, "Alpha": 0.32},
    "glass": {"Roughness": 0.05, "Coat Weight": 0.8, "Alpha": 0.25},
    "plastic": {"Roughness": 0.5, "Coat Weight": 0.12},
    "rubber": {"Roughness": 0.8, "Specular IOR Level": 0.3},
}
GRAIN: dict[str, float] = {
    "carbon": 0.5,
    "oxide": 0.18,
    "ceramic": 0.08,
    "lithium": 0.25,
    "separator": 0.3,
    "rubber": 0.15,
    "steel": 0.06,
}
type CacheKey = tuple[str, str, float | None, float | None, float]
MATERIAL_CACHE: dict[CacheKey, bpy.types.Material] = {}


def add_grain(m: bpy.types.Material, amount: float, scale: float = 90.0) -> None:
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    bump = nt.nodes.new("ShaderNodeBump")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 2.0
    bump.inputs["Strength"].default_value = amount
    bump.inputs["Distance"].default_value = 0.02
    _ = nt.links.new(tex_coord.outputs["Object"], noise.inputs["Vector"])
    _ = nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    _ = nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def coat_material(color: str = "#f0c987", edge: float = 0.85, face: float = 0.05) -> bpy.types.Material:
    m = mat("coat", **{"Base Color": hex_rgb(color), "Roughness": 0.3, "Coat Weight": 0.3})
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    layer_weight = nt.nodes.new("ShaderNodeLayerWeight")
    layer_weight.inputs["Blend"].default_value = 0.35
    map_range = nt.nodes.new("ShaderNodeMapRange")
    map_range.inputs["To Min"].default_value = face
    map_range.inputs["To Max"].default_value = edge
    _ = nt.links.new(layer_weight.outputs["Facing"], map_range.inputs["Value"])
    _ = nt.links.new(map_range.outputs["Result"], bsdf.inputs["Alpha"])
    return m


def cached_material(cache_id: CacheKey) -> bpy.types.Material | None:
    try:
        found = MATERIAL_CACHE.get(cache_id)
        if found is not None and found.name in bpy.data.materials:
            return found
    except ReferenceError:
        MATERIAL_CACHE.clear()
    return None


def build_material(kind: str, color: str, alpha: float | None, rough: float | None, grain: float) -> bpy.types.Material:
    if kind == "emissive":
        return mat("emit", **{"Base Color": hex_rgb(color), "Emission Color": hex_rgb(color), "Emission Strength": 1.0})
    if kind == "coat":
        return coat_material(color)
    settings = dict(KIND_SETTINGS.get(kind, KIND_SETTINGS["plastic"]))
    if alpha is not None:
        settings["Alpha"] = alpha
    if rough is not None:
        settings["Roughness"] = rough
    m = mat(kind, **{"Base Color": hex_rgb(color), **settings})
    if grain:
        add_grain(m, grain)
    return m


def material(
    kind: str = "oxide",
    color: str | None = None,
    alpha: float | None = None,
    rough: float | None = None,
    grain: float | None = None,
) -> bpy.types.Material:
    color = color or DEFAULT_COLOR.get(kind, "#9aa3ad")
    amount = GRAIN.get(kind, 0.0) if grain is None else grain
    cache_id = (kind, color, alpha, rough, amount)
    found = cached_material(cache_id)
    if found is not None:
        return found
    built = build_material(kind, color, alpha, rough, amount)
    MATERIAL_CACHE[cache_id] = built
    return built


def resolve(spec: MatSpec, kind: str = "oxide", color: str | None = None) -> bpy.types.Material:
    if isinstance(spec, bpy.types.Material):
        return spec
    if isinstance(spec, dict):
        return material(
            spec.get("kind", kind), spec.get("color", color), spec.get("alpha"), spec.get("rough"), spec.get("grain")
        )
    if isinstance(spec, str) and spec.startswith("#"):
        return material(kind, spec)
    if isinstance(spec, str):
        return material(spec, color)
    return material(kind, color)


def shade(color: str, f: float) -> str:
    base = [int(color.lstrip("#")[i : i + 2], 16) for i in (0, 2, 4)]
    mixed = [v + (MAX_BYTE - v) * f if f > 0 else v * (1 + f) for v in base]
    red, green, blue = (int(max(0, min(MAX_BYTE, round(v)))) for v in mixed)
    return f"#{red:02x}{green:02x}{blue:02x}"


BATTERY: dict[str, str] = {
    "cathode": "#5b6f8f",
    "anode": "#3b3e44",
    "separator": "#f1f1ec",
    "al": "#c6c9ce",
    "cu": "#c8825a",
    "pouch": "#c3c6cb",
    "steel": "#b4b9bf",
    "lithium": "#9aa1ab",
    "gasket": "#34373c",
    "sleeve": "#2f6aa8",
    "sealant": "#d9b54a",
}
