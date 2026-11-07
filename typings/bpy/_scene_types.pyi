from collections.abc import Iterator, Sequence
from typing import final

import numpy as np
from bpy.types import NodeTree, Object

class ColorModifier:
    material_attribute: str
    blend: str
    influence: float

def _colormodifiers_new(self: ColorModifiers, name: str, modifier_type: str) -> ColorModifier: ...

@final
class ColorModifiers:
    new = _colormodifiers_new

class FreestyleLineStyle:
    color: Sequence[float]
    thickness: float
    thickness_position: str
    caps: str
    use_chaining: bool
    chaining: str
    use_same_object: bool
    color_modifiers: ColorModifiers

class LineSet:
    select_by_visibility: bool
    visibility: str
    select_by_edge_types: bool
    edge_type_combination: str
    select_by_collection: bool
    collection: Collection
    collection_negation: str
    linestyle: FreestyleLineStyle

def _linesets_new(self: LineSets, name: str) -> LineSet: ...
def _linesets_remove(self: LineSets, lineset: LineSet) -> None: ...
def _linesets_iter(self: LineSets) -> Iterator[LineSet]: ...

@final
class LineSets:
    new = _linesets_new
    remove = _linesets_remove
    __iter__ = _linesets_iter

class FreestyleSettings:
    mode: str
    use_smoothness: bool
    crease_angle: float
    use_culling: bool
    as_render_pass: bool
    linesets: LineSets

def _viewlayer_update(self: ViewLayer) -> None: ...

@final
class ViewLayer:
    use_freestyle: bool
    freestyle_settings: FreestyleSettings
    update = _viewlayer_update

def _collectionobjects_link(self: CollectionObjects, obj: Object) -> None: ...
def _collectionobjects_contains(self: CollectionObjects, name: str) -> bool: ...
def _collectionobjects_len(self: CollectionObjects) -> int: ...

@final
class CollectionObjects:
    link = _collectionobjects_link
    __contains__ = _collectionobjects_contains
    __len__ = _collectionobjects_len

def _collectionchildren_link(self: CollectionChildren, collection: Collection) -> None: ...
def _collectionchildren_contains(self: CollectionChildren, name: str) -> bool: ...

@final
class CollectionChildren:
    link = _collectionchildren_link
    __contains__ = _collectionchildren_contains

class Collection:
    name: str
    objects: CollectionObjects
    children: CollectionChildren

def _sceneobjects_iter(self: SceneObjects) -> Iterator[Object]: ...
def _sceneobjects_contains(self: SceneObjects, name: str) -> bool: ...
def _sceneobjects_getitem(self: SceneObjects, name: str) -> Object: ...
def _sceneobjects_get(self: SceneObjects, name: str) -> Object | None: ...

@final
class SceneObjects:
    __iter__ = _sceneobjects_iter
    __contains__ = _sceneobjects_contains
    __getitem__ = _sceneobjects_getitem
    get = _sceneobjects_get

class RenderSettings:
    engine: str
    resolution_x: int
    resolution_y: int
    film_transparent: bool
    filepath: str
    filter_size: float
    use_freestyle: bool
    line_thickness_mode: str
    line_thickness: float

class CyclesSettings:
    device: str
    film_transparent_glass: bool
    samples: int
    use_denoising: bool
    use_adaptive_sampling: bool
    adaptive_threshold: float
    max_bounces: int
    diffuse_bounces: int
    glossy_bounces: int
    transmission_bounces: int
    volume_bounces: int
    transparent_max_bounces: int
    caustics_reflective: bool
    caustics_refractive: bool
    sample_clamp_indirect: float
    blur_glossy: float

class ViewSettings:
    view_transform: str
    look: str
    exposure: float
    gamma: float

class World:
    use_nodes: bool
    node_tree: NodeTree

class Scene:
    name: str
    camera: Object
    render: RenderSettings
    cycles: CyclesSettings
    view_settings: ViewSettings
    world: World
    objects: SceneObjects
    collection: Collection
    view_layers: Sequence[ViewLayer]

class CyclesDevice:
    name: str
    type: str
    use: bool

def _cyclespreferences_refresh_devices(self: CyclesPreferences) -> None: ...
def _cyclespreferences_get_devices(self: CyclesPreferences) -> None: ...

@final
class CyclesPreferences:
    compute_device_type: str
    devices: Sequence[CyclesDevice]
    refresh_devices = _cyclespreferences_refresh_devices
    get_devices = _cyclespreferences_get_devices

def _pixelbuffer_foreach_get(self: PixelBuffer, array: np.ndarray) -> None: ...
def _pixelbuffer_foreach_set(self: PixelBuffer, array: np.ndarray) -> None: ...

@final
class PixelBuffer:
    foreach_get = _pixelbuffer_foreach_get
    foreach_set = _pixelbuffer_foreach_set

def _image_save(self: Image) -> None: ...

@final
class Image:
    size: tuple[int, int]
    pixels: PixelBuffer
    filepath_raw: str
    file_format: str
    save = _image_save
