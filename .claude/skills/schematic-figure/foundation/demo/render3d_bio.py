# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/render3d_bio.py
import sys
import time
from collections.abc import Mapping
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender"))

from bio3d import (
    EPITHELIUM,
    bacterium,
    bio_lights,
    bio_setup,
    camera_orbit,
    cell,
    dna_helix,
    membrane_patch,
    microtube,
    nanoparticle,
    organoid,
    petri_dish,
    pipette_tip,
    protein_blob,
    spheroid,
    tissue_slab,
    vesicle,
    virus,
    well_plate,
)
from scene import finish, shadow_floor, use_style

ILLUS = "--illus" in sys.argv
SUF = "_illus" if ILLUS else ""
ART = Path(__file__).resolve().parent / "art"
NAMES = ("cell", "tissue", "membrane", "vessels", "micro", "organoid")
PLATE_COLORS = ("#f28e9e", "#f6c26b", "#7fc4a6", "#6fa8dc", "#b18fd6", "")
PLATE_ROWS = "ABCDEFGH"
PLATE_COLUMNS = 10
PLATE_BAND = 4


def pre[V](prefix: str, anchors: Mapping[str, V]) -> dict[str, V]:
    return {prefix + k: v for k, v in anchors.items()}


def plate_colors() -> dict[str, str]:
    colors: dict[str, str] = {}
    for i, row in enumerate(PLATE_ROWS):
        for j in range(PLATE_COLUMNS):
            colour = PLATE_COLORS[(i + j) // PLATE_BAND % len(PLATE_COLORS)]
            if colour:
                colors[f"{row}{j + 1}"] = colour
    return colors


def out(name: str) -> str:
    return str(ART / f"bio_{name}{SUF}.png")


def scene_cell() -> None:
    scene = bio_setup(1400, 1150, samples=48)
    _, anchors = cell(radius=1.0, cutaway="octant", cut_azimuth=-50, receptors=70, seed=4)
    _ = camera_orbit(target=(0, 0, -0.02), dist=5.6, az=-50, el=30, lens_mm=55)
    bio_lights(az=-50)
    _ = shadow_floor(z=-0.86)
    finish(scene, out("cell"), anchors=anchors)


def scene_tissue() -> None:
    scene = bio_setup(1500, 1050, samples=48)
    _, anchors = tissue_slab(size=(4.2, 2.6, 0), layers=EPITHELIUM, seed=2)
    _ = camera_orbit(target=(0, 0, 0.55), dist=8.2, az=-58, el=30, lens_mm=50)
    bio_lights(az=-58)
    _ = shadow_floor(z=0.0)
    finish(scene, out("tissue"), anchors=anchors)


def scene_membrane() -> None:
    scene = bio_setup(1500, 1100, samples=48)
    _, patch = membrane_patch(size=(5.2, 3.2), loc=(0, 0, -0.9), seed=1)
    _, ves = vesicle(radius=0.9, loc=(-1.0, 0.9, 1.15), cut_azimuth=-58, seed=2, spacing=0.075, thickness=0.26)
    _ = camera_orbit(target=(-0.1, 0.1, 0.1), dist=9.6, az=-58, el=24, lens_mm=50)
    bio_lights(az=-58)
    _ = shadow_floor(z=-1.3)
    finish(scene, out("membrane"), anchors={**pre("m.", patch), **pre("v.", ves)})


def scene_vessels() -> None:
    scene = bio_setup(1600, 1000, samples=48)
    _, plate = well_plate(loc=(0.7, 0.8, 0), wells=96, length=4.2, seed=1, well_colors=plate_colors())
    _, dish = petri_dish(
        loc=(-2.3, -0.5, 0), radius=1.25, colonies=("#f4ead2", "#e6a93a", "#c75a4a"), n_colonies=34, seed=3
    )
    _, tube = microtube(loc=(-0.1, -1.6, 0), height=2.2, liquid="#6fa8dc", fill=0.5, lid="open")
    _, tip = pipette_tip(
        loc=(1.9, -1.55, 0.35), rot=(0, 0, 0), length=2.1, color="#f2cf4a", liquid="#e25f7b", droplet=True
    )
    _ = camera_orbit(target=(-0.1, -0.2, 0.5), dist=10.0, az=-72, el=38, lens_mm=50)
    bio_lights(az=-72)
    _ = shadow_floor(z=0.0)
    anchors = {**pre("plate.", plate), **pre("dish.", dish), **pre("tube.", tube), **pre("tip.", tip)}
    finish(scene, out("vessels"), anchors=anchors)


def scene_micro() -> None:
    scene = bio_setup(1600, 1000, samples=48)
    _, bact = bacterium(loc=(-2.1, 1.0, 0.4), rot=(0, 0, -35), seed=1, flagellum_len=1.9)
    _, vir = virus(loc=(0.2, 0.8, 0.5), radius=0.62, seed=2)
    _, nano = nanoparticle(loc=(2.5, 0.7, 0.4), radius=0.42, seed=3, peg=24)
    _, dna = dna_helix(loc=(-2.8, -1.6, 0.35), rot=(0, 0, 8), n_bp=22, radius=0.34, rise=0.34 * 0.34, seed=4)
    _, prot = protein_blob(loc=(1.6, -1.4, 0.45), size=0.9, seed=5, color="#3a7fc0")
    _ = camera_orbit(target=(0, -0.3, 0.3), dist=10.5, az=-80, el=28, lens_mm=50)
    bio_lights(az=-80)
    _ = shadow_floor(z=-0.1)
    anchors = {
        **pre("bact.", bact),
        **pre("virus.", vir),
        **pre("np.", nano),
        **pre("dna.", dna),
        **pre("prot.", prot),
    }
    finish(scene, out("micro"), anchors=anchors)


def scene_organoid() -> None:
    scene = bio_setup(1500, 1000, samples=48)
    _, org = organoid(loc=(-1.55, 0, 0), radius=1.3, n_cells=130, seed=1, cut_azimuth=-40, cut_elevation=15)
    _, sph = spheroid(
        loc=(1.65, 0, 0), radius=1.1, cell_size=0.3, seed=2, cutaway=True, cut_azimuth=-120, cut_elevation=15
    )
    _ = camera_orbit(target=(0, 0, 0), dist=9.0, az=-80, el=24, lens_mm=50)
    bio_lights(az=-80)
    _ = shadow_floor(z=-1.35)
    finish(scene, out("organoid"), anchors={**pre("org.", org), **pre("sph.", sph)})


def build(name: str) -> None:
    if name == "cell":
        scene_cell()
    if name == "tissue":
        scene_tissue()
    if name == "membrane":
        scene_membrane()
    if name == "vessels":
        scene_vessels()
    if name == "micro":
        scene_micro()
    if name == "organoid":
        scene_organoid()


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
        build(name)
        _ = sys.stdout.write(f"TIME {name} {time.time() - t0:.1f} s\n")


if __name__ == "__main__":
    main()
