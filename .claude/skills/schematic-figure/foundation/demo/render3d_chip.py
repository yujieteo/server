# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/render3d_chip.py
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender"))

from scene import beam, camera_look, chip, fiber_path, finish, lens, setup, soft_lights, use_style

ART = Path(__file__).resolve().parent / "art"
WAVEGUIDES = [
    [(-2.2, 0.0), (-1.0, 0.0), (0.0, 0.5), (1.0, 0.5), (2.2, 0.5)],
    [(-2.2, -0.6), (-1.0, -0.6), (0.0, -0.1), (1.0, -0.1), (2.2, -0.1)],
]
ANCHORS = {
    "fiber": (-3.2, 0.4, 0.3),
    "chip": (0.6, -1.2, -0.2),
    "wg": (0.0, 0.5, -0.15),
    "lens": (3.6, 0, 0.6),
    "out": (4.6, 0.5, 0),
}


def main() -> None:
    illus = "--illus" in sys.argv
    if illus:
        use_style("illustration")
    suffix = "_illus" if illus else ""
    scene = setup(width_px=1600, height_px=800, samples=48)
    chip(size=(4.4, 2.4, 0.3), loc=(0.6, 0, -0.35), waveguides=WAVEGUIDES)
    _ = fiber_path([(-4.5, 0.6, 0.6), (-3.2, 0.4, 0.2), (-1.7, 0.0, 0.0)], radius=0.11)
    _ = lens(x=3.6, radius=0.6, thickness=0.2)
    _ = beam([(2.8, 0.5, 0.0), (4.6, 0.5, 0.0)], radius=0.04)
    _ = camera_look(loc=(0.4, -8.5, 5.2), target=(0.4, 0, -0.2), lens_mm=42)
    soft_lights()
    finish(scene, str(ART / f"chip{suffix}.png"), anchors=ANCHORS)


if __name__ == "__main__":
    main()
