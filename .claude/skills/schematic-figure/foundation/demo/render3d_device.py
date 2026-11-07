# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/render3d_device.py
import sys
import time
from collections.abc import Mapping
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender"))

from device3d import (
    coin_cell,
    cylindrical_cell,
    electrode_interface,
    gate_device,
    lattice,
    layer_stack,
    molecule_3d,
    nanowire_array,
    particle_bed,
    porous_membrane,
    pouch_cell,
    studio,
)
from device3d_types import Layer, Spec
from scene import camera_look, finish, setup, use_style

ILLUS = "--illus" in sys.argv
SUF = "_illus" if ILLUS else ""
ART = Path(__file__).resolve().parent / "art"
W, H, SPP = 1600, 1100, 64
NAMES = (
    "stack",
    "stack_corner",
    "moire",
    "crystal",
    "molecules",
    "particles",
    "interface",
    "pouch",
    "coin",
    "cylinder",
    "fet",
    "nano",
)


def out(name: str) -> str:
    return str(ART / f"dev_{name}{SUF}.png")


def stack() -> None:
    scene = setup(W, H, SPP)
    layers = [
        Layer(thickness=0.42, color="#6b7384", kind="semiconductor", label="Si"),
        Layer(thickness=0.14, color="#d4cfe3", kind="oxide", label="SiO2"),
        Layer(thickness=0.06, color="#cfe3ea", kind="ceramic", label="hBN bottom"),
        Layer(thickness=0.02, color="#30343b", kind="graphene", label="graphene", lattice="honeycomb"),
        Layer(thickness=0.06, color="#cfe3ea", kind="ceramic", label="hBN top"),
        Layer(thickness=0.07, color="#d6a74f", kind="gold", label="gate", inset=0.35),
    ]
    _, anchors = layer_stack(layers, footprint=(3.2, 2.2), exploded=0.26, cut="step")
    _ = studio(scale=1.2, floor=0.0)
    _ = camera_look(loc=(3.2, -7.8, 5.4), target=(0.15, 0, 0.55), lens_mm=52)
    finish(scene, out("stack"), anchors=anchors)


def stack_corner() -> None:
    scene = setup(W, H, SPP)
    layers = [
        Layer(thickness=0.32, color="#cfe0e8", kind="glass", label="glass", alpha=0.8),
        Layer(thickness=0.06, color="#9fc6d8", kind="oxide", label="ITO"),
        Layer(thickness=0.07, color="#e8e4dc", kind="ceramic", label="SnO2"),
        Layer(thickness=0.22, color="#5a3f36", kind="oxide", label="perovskite"),
        Layer(thickness=0.07, color="#c9a0c9", kind="polymer", label="HTL", alpha=0.9),
        Layer(thickness=0.08, color="#d6a74f", kind="gold", label="Au"),
    ]
    _, anchors = layer_stack(layers, footprint=(3.0, 2.2), cut="corner", notch=(0.4, 0.45))
    _ = studio(scale=1.2, floor=0.0)
    _ = camera_look(loc=(4.6, -7.2, 5.0), target=(0.1, 0, 0.35), lens_mm=55)
    finish(scene, out("stack_corner"), anchors=anchors)


def moire() -> None:
    scene = setup(W, H, SPP)
    _, anchors = lattice(
        "honeycomb",
        n=26,
        a=0.07,
        style="stick",
        colors=["#30343b"],
        colors2=["#4f86c0"],
        twist=8.0,
        interlayer=0.09,
        bond_radius=0.012,
    )
    _ = studio(scale=1.2, floor=-0.3)
    _ = camera_look(loc=(0, -3.6, 6.6), target=(0, -0.12, 0), lens_mm=46)
    finish(scene, out("moire"), anchors=anchors)


def crystal() -> None:
    scene = setup(W, H, SPP)
    _, perovskite = lattice("perovskite", n=3, a=0.4, colors=["#6c7ccc", "#9c72c4", "#cf4a3d"], loc=(-1.45, 0, 0))
    _, rocksalt = lattice("rocksalt", n=2, a=0.42, colors=["#9c72c4", "#86b85f"], loc=(1.55, 0, 0), prefix="rs.")
    _ = studio(scale=1.3, floor=0.0)
    _ = camera_look(loc=(1.6, -8.6, 5.2), target=(0.05, 0, 0.8), lens_mm=50)
    finish(scene, out("crystal"), anchors={**perovskite, **rocksalt})


def lowest_bottom(groups: tuple[Mapping[str, tuple[float, float, float]], ...]) -> float:
    return min(v[2] for anchors in groups for k, v in anchors.items() if k.endswith(".bottom")) - 0.05


def molecules() -> None:
    scene = setup(W, H, SPP)
    _, ec = molecule_3d("O=C1OCCO1", loc=(-2.55, 0, 1.0), scale=0.4, prefix="EC.")
    _, tfsi = molecule_3d(
        "FC(F)(F)S(=O)(=O)[N-]S(=O)(=O)C(F)(F)F", loc=(-0.35, 0, 1.0), scale=0.33, prefix="TFSI.", seed=1
    )
    _, coronene = molecule_3d(
        "c1cc2ccc3ccc4ccc5ccc6ccc1c1c2c3c4c5c61",
        loc=(2.35, 0, 1.0),
        scale=0.24,
        prefix="coronene.",
        rot=(-15, 0, 0),
    )
    _ = studio(scale=1.3, floor=lowest_bottom((ec, tfsi, coronene)), target=(0, 0, 1.0))
    _ = camera_look(loc=(0.0, -9.5, 3.9), target=(0.0, 0, 1.0), lens_mm=50)
    finish(scene, out("molecules"), anchors={**ec, **tfsi, **coronene})


def particles() -> None:
    scene = setup(W, H, SPP)
    coating = Spec(t=0.018, color="#e9a53c")
    _, anchors = particle_bed(
        size=(3.2, 2.0, 0.8),
        n=190,
        radius=(0.1, 0.19),
        seed=3,
        color="#6f8fb8",
        kind="ceramic",
        shell=coating,
        carbon={"n": 360, "r": 0.024},
        binder={"n": 70, "r": 0.011},
        foil={"t": 0.07, "color": "#c6c9ce", "kind": "aluminium"},
    )
    _ = studio(scale=1.2, floor=0.0)
    _ = camera_look(loc=(2.8, -7.6, 4.8), target=(0.1, 0, 0.35), lens_mm=55)
    finish(scene, out("particles"), anchors=anchors)


def interface() -> None:
    scene = setup(W, H, SPP)
    _, anchors = electrode_interface(
        size=(3.2, 2.0),
        thickness=0.5,
        seed=4,
        roughness=0.05,
        substrate={"kind": "lithium", "color": "#aab0b8"},
        coating={"t": 0.06, "color": "#4f9ac4", "kind": "ceramic", "from_x": -0.05},
        deposit={"kind": "dendrite", "n": 7, "height": 0.95},
    )
    _ = studio(scale=1.2, floor=-0.5)
    _ = camera_look(loc=(2.8, -7.6, 4.2), target=(0.05, 0, 0.15), lens_mm=52)
    finish(scene, out("interface"), anchors=anchors)


def pouch() -> None:
    scene = setup(W, H, SPP)
    _, big = pouch_cell(size=(2.6, 1.8), exploded=0.3, n_pairs=1)
    _, small = pouch_cell(size=(1.3, 0.9), exploded=0, loc=(2.6, 0.6, 0), prefix="cell.")
    _ = studio(scale=1.3, floor=0.0)
    _ = camera_look(loc=(3.0, -8.2, 5.8), target=(0.6, 0.2, 0.55), lens_mm=50)
    finish(scene, out("pouch"), anchors={**big, **small})


def coin() -> None:
    scene = setup(W, H, SPP)
    _, big = coin_cell(radius=1.0, exploded=0.26, loc=(-0.9, 0, 0))
    _, cut = coin_cell(radius=0.85, exploded=0, cut=True, loc=(1.85, -0.2, 0), prefix="cut.")
    _ = studio(scale=1.3, floor=0.0)
    _ = camera_look(loc=(2.2, -8.6, 5.6), target=(0.35, 0, 1.05), lens_mm=46)
    finish(scene, out("coin"), anchors={**big, **cut})


def cylinder() -> None:
    scene = setup(1300, H, SPP)
    _, anchors = cylindrical_cell(radius=0.9, height=3.0, cut=True)
    _ = studio(scale=1.3, floor=0.0)
    _ = camera_look(loc=(5.2, -6.6, 5.2), target=(0, 0, 1.4), lens_mm=50)
    finish(scene, out("cylinder"), anchors=anchors)


def fet() -> None:
    scene = setup(W, H, SPP)
    _, anchors = gate_device(gate="top")
    _ = studio(scale=1.3, floor=-0.08)
    _ = camera_look(loc=(2.8, -7.2, 5.6), target=(0, 0.2, 0.3), lens_mm=50)
    finish(scene, out("fet"), anchors=anchors)


def nano() -> None:
    scene = setup(W, H, SPP)
    _, wires = nanowire_array(
        n=(7, 5),
        pitch=0.38,
        radius=0.075,
        height=1.1,
        tip={},
        seed=2,
        loc=(-1.45, 0, 0),
        color="#5f86b0",
        substrate={"color": "#8e97a6"},
    )
    _, membrane = porous_membrane(
        size=(2.2, 1.9), thickness=0.3, pore_radius=0.09, pitch=0.27, loc=(1.55, 0, 0), prefix="mem."
    )
    _ = studio(scale=1.3, floor=-0.2)
    _ = camera_look(loc=(1.4, -8.0, 5.8), target=(0.05, 0, 0.3), lens_mm=50)
    finish(scene, out("nano"), anchors={**wires, **membrane})


def build_layers(name: str) -> None:
    if name == "stack":
        stack()
    if name == "stack_corner":
        stack_corner()
    if name == "moire":
        moire()
    if name == "crystal":
        crystal()
    if name == "molecules":
        molecules()
    if name == "particles":
        particles()


def build_cells(name: str) -> None:
    if name == "interface":
        interface()
    if name == "pouch":
        pouch()
    if name == "coin":
        coin()
    if name == "cylinder":
        cylinder()
    if name == "fet":
        fet()
    if name == "nano":
        nano()


def picked_names() -> list[str]:
    if "--" not in sys.argv:
        return list(NAMES)
    names = [a for a in sys.argv[sys.argv.index("--") + 1 :] if a != "--illus"]
    return names or list(NAMES)


def main() -> None:
    if ILLUS:
        use_style("illustration")
    for name in picked_names():
        if name not in NAMES:
            raise KeyError(name)
        t0 = time.time()
        build_layers(name)
        build_cells(name)
        _ = sys.stdout.write(f"SCENE {name} {time.time() - t0:.1f} s\n")


if __name__ == "__main__":
    main()
