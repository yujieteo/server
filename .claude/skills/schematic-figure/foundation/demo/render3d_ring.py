# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/render3d_ring.py
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender"))

from scene import (
    camera_look,
    fiber_path,
    finish,
    gaussian_solid,
    plastic,
    setup,
    shadow_floor,
    soft_lights,
    torus,
    use_style,
)

ART = Path(__file__).resolve().parent / "art"
ANCHORS = {"pulse0": (0, -2, 0.6), "loop": (-1.9, 0.7, 1.1)}


def main() -> None:
    illus = "--illus" in sys.argv
    if illus:
        use_style("illustration")
    suffix = "_illus" if illus else ""
    scene = setup(width_px=1400, height_px=800, samples=48)
    _ = torus(loc=(0, 0, 0.08), major=2.0, minor=0.08)
    for k in range(5):
        a = -math.pi / 2 + k * 0.5
        _ = gaussian_solid(loc=(2.0 * math.cos(a), 2.0 * math.sin(a), 0.1), height=0.5, sigma=0.09)
    _ = fiber_path(
        [(-2.0, 0.3, 0.1), (-2.6, 0.5, 0.9), (-1.6, 0.9, 1.1), (-1.2, 0.8, 0.1)],
        radius=0.07,
        mat=plastic("#8a5cd6", 0.3, 0.6),
    )
    _ = shadow_floor(z=0.0)
    _ = camera_look(loc=(0, -7.5, 4.2), target=(0, 0, 0.2), lens_mm=45)
    soft_lights()
    finish(scene, str(ART / f"ring{suffix}.png"), anchors=ANCHORS)


if __name__ == "__main__":
    main()
