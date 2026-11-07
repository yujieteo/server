# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/demo/render3d_apparatus.py
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "blender"))

from apparatus3d import (
    Anchors,
    Avoid,
    atmosphere_layers,
    beaker,
    breadboard,
    cable,
    camera_box,
    city_block,
    cloud,
    crop_field,
    dilution_fridge,
    electrochem_cell,
    flask,
    flow_loop,
    forest,
    globe,
    ground_z,
    helmholtz_coils,
    ion_trap,
    laser_head,
    look,
    no_shadow,
    ocean_section,
    post_mount,
    solar_array,
    studio,
    tag,
    terrain_block,
    terrain_surface,
    vacuum_chamber,
    vessel,
    vial,
    wind_turbine,
)
from scene import beam, camera_look, finish, setup, shadow_floor, use_style

ILLUS = "--illus" in sys.argv
SUF = "_illus" if ILLUS else ""
ART = Path(__file__).resolve().parent / "art"
NAMES = (
    "glassware",
    "flow",
    "optics",
    "vacuum",
    "cryo",
    "traps",
    "terrain",
    "landscape",
    "globe",
    "ocean",
)


def out(name: str) -> str:
    return str(ART / f"app_{name}{SUF}.png")


def glassware() -> None:
    scene = setup(1800, 1000, 80)
    _ = look(scene)
    anchors = Anchors()
    _, a = beaker((-2.85, 0, 0), 0.5, fill=0.55, liquid_color="#2f86c9")
    anchors.update(tag(a, "beaker"))
    _, a = flask((-1.45, 0.1, 0), 0.55, fill=0.35, liquid_color="#d9534f")
    anchors.update(tag(a, "flask"))
    _, a = vessel("round", (-0.1, 0.15, 0), 0.45, fill=0.3, liquid_color="#e0a526")
    anchors.update(tag(a, "round"))
    _, a = vial((0.85, -0.2, 0), 0.16, fill=0.6, liquid_color="#5aae61")
    anchors.update(tag(a, "vial"))
    _, a = electrochem_cell((2.15, 0.1, 0), 0.58, 1.25, cable_out=(1, 0.9), cable_reach=1.9)
    anchors.update(tag(a, "cell"))
    _ = shadow_floor(0)
    _ = camera_look(loc=(0.0, -9.0, 3.4), target=(-0.15, 0, 0.95), lens_mm=50)
    _ = studio(target=(0, 0, 0.8), scale=1.0)
    finish(scene, out("glassware"), anchors=anchors)


def flow() -> None:
    scene = setup(1800, 900, 64)
    _ = look(scene)
    _, anchors = flow_loop((0, 0, 0), liquid_color="#d9534f")
    _ = shadow_floor(0)
    _ = camera_look(loc=(0.2, -8.5, 4.6), target=(0.1, 0, 0.35), lens_mm=45)
    _ = studio(target=(0, 0, 0.3), scale=1.0)
    finish(scene, out("flow"), anchors=anchors)


def optics() -> None:
    scene = setup(1800, 1100, 64)
    _ = look(scene)
    _, anchors = breadboard((0, 0, -0.07), (5.6, 3.0, 0.14))
    z0 = 0.0
    _, a = laser_head((-2.0, -0.8, z0), (1.3, 0.42, 0.36), beam_length=0.0)
    anchors.update(tag(a, "laser"))
    zb = a["aperture"][2]
    x0 = a["aperture"][0]
    _, a = post_mount((0.6, -0.8, z0), zb, "mirror", 135)
    anchors.update(tag(a, "m1"))
    _, a = post_mount((0.6, 0.7, z0), zb, "mirror", -45)
    anchors.update(tag(a, "m2"))
    _, a = post_mount((1.6, 0.7, z0), zb, "lens", 0)
    anchors.update(tag(a, "lens"))
    _, a = camera_box((2.55, 0.7, z0 + zb - 0.33), (0.55, 0.5, 0.5), lens_length=0.35)
    anchors.update(tag(a, "cam"))
    _, a = post_mount((-0.5, -0.8, z0), zb, "iris", 0)
    anchors.update(tag(a, "iris"))
    path = [(x0, -0.8, zb), (0.6, -0.8, zb), (0.6, 0.7, zb), (anchors["cam.lens"][0], 0.7, zb)]
    _ = no_shadow(beam(path, 0.028, "#e8322b"))
    _ = camera_look(loc=(-0.9, -7.0, 5.4), target=(0.25, 0.25, -0.05), lens_mm=38)
    _ = studio(target=(0, 0, 0.3), scale=1.1)
    finish(scene, out("optics"), anchors=anchors)


def vacuum() -> None:
    scene = setup(1800, 1100, 64)
    _ = look(scene)
    anchors = Anchors()
    _, a = vacuum_chamber((-1.7, 0, 1.2), 1.0, "octagon", inside="#ff7b54")
    anchors.update(tag(a, "oct"))
    _, a = helmholtz_coils((-1.7, 0, 1.2), 1.25, 0.18, 0.16, 1.25, axis="z")
    anchors.update(tag(a, "coils"))
    _, a = vacuum_chamber((1.9, 0.3, 1.0), 0.8, "sphere")
    anchors.update(tag(a, "sph"))
    wire = [(0.2, -0.5, 0.0), (0.6, -1.0, 0.1), (1.2, -0.9, 0.4), (1.9, 0.3, 1.85)]
    _, a = cable(wire, 0.035, "#2a2d33", "coax")
    anchors.update(tag(a, "coax"))
    _ = shadow_floor(-0.05)
    _ = camera_look(loc=(0.0, -9.0, 6.4), target=(0.1, 0, 1.0), lens_mm=42)
    _ = studio(target=(0, 0, 1.0), scale=1.1)
    finish(scene, out("vacuum"), anchors=anchors)


def cryo() -> None:
    scene = setup(1100, 1500, 64)
    _ = look(scene)
    _, anchors = dilution_fridge((0, 0, 2.3))
    _ = camera_look(loc=(0.0, -7.8, 3.4), target=(0.0, 0, 0.75), lens_mm=58)
    _ = studio(target=(0, 0, 0.8), scale=1.0)
    finish(scene, out("cryo"), anchors=anchors)


def traps() -> None:
    scene = setup(1800, 900, 64)
    _ = look(scene)
    anchors = Anchors()
    _, a = ion_trap("blade", (-1.55, 0, 0.75), n_ions=5, spacing=0.22, length=2.2, rot=-62)
    anchors.update(tag(a, "blade"))
    _, a = ion_trap("surface", (1.55, 0.3, 0.2), n_ions=4, spacing=0.3, length=2.2, ion_color="#7b61ff", rot=12)
    anchors.update(tag(a, "surf"))
    _ = camera_look(loc=(0.0, -7.2, 4.2), target=(0.0, 0, 0.45), lens_mm=46)
    _ = studio(target=(0, 0, 0.5), scale=1.0)
    finish(scene, out("traps"), anchors=anchors)


def terrain() -> None:
    scene = setup(1800, 1150, 64)
    _ = look(scene)
    layers = [(0.35, "#d9c28c"), (0.3, "#b98a5c"), (0.35, "#e6d7ad"), (0.4, "#9a6b50"), (0.6, "#827c75")]
    _, anchors = terrain_block(
        (0, 0, 0),
        (6.0, 3.6, 2.2),
        seed=7,
        relief=0.2,
        layers=layers,
        fault={"x": 1.0, "dip": 62, "throw": 0.3},
        water_table=0.25,
    )
    river = Avoid(terrain=anchors, river_half=0.45)
    _ = forest((-2.8, -0.2, -1.6, 1.6), 16, 3, anchors, avoid=river)
    _ = forest((1.4, 2.8, -1.6, 1.6), 7, 4, anchors, kinds=("conifer",), avoid=river)
    _, c = cloud((-1.2, 0.8, 2.6), 0.55, seed=2)
    anchors.update(tag(c, "cloud"))
    _ = camera_look(loc=(-3.2, -10.5, 6.0), target=(0.0, 0, 0.3), lens_mm=42)
    _ = studio(target=(0, 0, 0.5), scale=1.2)
    finish(scene, out("terrain"), anchors=anchors)


def landscape() -> None:
    scene = setup(1800, 1100, 64)
    _ = look(scene)
    _, anchors = terrain_surface((0, 0, 0), (8.0, 5.0), seed=4, relief=0.7, coast=True)
    for i, (x, y) in enumerate([(-2.6, 1.4), (-1.9, 1.9), (-3.2, 2.1)]):
        _, a = wind_turbine((x, y, ground_z(anchors, x, y)), 1.25, blade=0.75, seed=i, yaw=10 * i)
        anchors.update(tag(a, f"wt{i}"))
    _, a = solar_array((-2.2, -1.4, ground_z(anchors, -2.2, -1.4)), rows=2, cols=4, module=(0.28, 0.45))
    anchors.update(tag(a, "pv"))
    _, a = city_block((0.2, -1.0, ground_z(anchors, 0.2, -1.0)), (3, 2), 0.35, seed=5, heights=(0.2, 1.0))
    anchors.update(tag(a, "city"))
    _, a = crop_field((-0.9, -0.2, ground_z(anchors, -0.9, -0.2) - 0.02), (1.3, 0.9), rows=8, per_row=18, seed=2)
    anchors.update(tag(a, "crops"))
    built = Avoid(boxes=((-2.2, -1.3, 0.9, 0.6), (0.2, -1.0, 0.8, 0.6), (-0.9, -0.2, 0.8, 0.6)))
    _ = forest((-3.8, -0.8, -2.4, 0.4), 12, 6, anchors, height=(0.3, 0.5), avoid=built)
    for k, (x, y, z, size) in enumerate([(1.8, 1.2, 2.4, 0.45), (-1.2, 1.6, 2.7, 0.4)]):
        _ = cloud((x, y, z), size, seed=10 + k)
    _ = camera_look(loc=(-2.2, -11.5, 6.8), target=(0.0, 0.3, 0.1), lens_mm=40)
    _ = studio(target=(0, 0, 0.3), scale=1.3)
    finish(scene, out("landscape"), anchors=anchors)


def globe_scene() -> None:
    scene = setup(1600, 1100, 48)
    _ = look(scene)
    anchors = Anchors()
    _, a = globe((-1.9, 0, 1.55), 1.45, seed=11, cutaway=True, spin=-48, tilt=10)
    anchors.update(tag(a, "globe"))
    layers = [
        (0.7, "#d3e8f7", "#bddcf2", "troposphere"),
        (0.6, "#aacdef", "#93bce8", "stratosphere"),
        (0.55, "#86abe0", "#7196d3", "mesosphere"),
        (0.7, "#6788c9", "#44559e", "thermosphere"),
    ]
    _, a = atmosphere_layers((2.3, 0.0, 0.25), 9.0, arc_deg=17.0, depth=0.8, layers=layers)
    anchors.update(tag(a, "atm"))
    _ = cloud((1.75, -0.62, 0.32), 0.24, seed=4)
    _ = cloud((2.95, -0.62, 0.4), 0.18, seed=5)
    _ = camera_look(loc=(0.3, -10.5, 3.2), target=(0.3, 0, 1.45), lens_mm=46)
    _ = studio(target=(0, 0, 1.2), scale=1.1)
    finish(scene, out("globe"), anchors=anchors)


def ocean() -> None:
    scene = setup(1800, 1000, 64)
    _ = look(scene)
    _, anchors = ocean_section((0, 0, 0), (6.0, 2.6), depth=1.7, seed=5, amp=0.1, wavelength=1.3)
    _ = cloud((-1.6, 1.0, 1.1), 0.5, seed=21)
    _ = cloud((1.7, 1.4, 1.3), 0.4, seed=22)
    _ = camera_look(loc=(-2.5, -9.5, 4.2), target=(0.0, 0, -0.2), lens_mm=45)
    _ = studio(target=(0, 0, 0), scale=1.1)
    finish(scene, out("ocean"), anchors=anchors)


def build_lab(name: str) -> None:
    if name == "glassware":
        glassware()
    if name == "flow":
        flow()
    if name == "optics":
        optics()
    if name == "vacuum":
        vacuum()
    if name == "cryo":
        cryo()


def build_field(name: str) -> None:
    if name == "traps":
        traps()
    if name == "terrain":
        terrain()
    if name == "landscape":
        landscape()
    if name == "globe":
        globe_scene()
    if name == "ocean":
        ocean()


def picked_names() -> list[str]:
    if "--" not in sys.argv:
        return list(NAMES)
    names = [a for a in sys.argv[sys.argv.index("--") + 1 :] if a != "--illus"]
    return names or list(NAMES)


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    if ILLUS:
        use_style("illustration")
    for name in picked_names():
        if name not in NAMES:
            raise KeyError(name)
        t0 = time.time()
        build_lab(name)
        build_field(name)
        _ = sys.stdout.write(f"TIME {name} {time.time() - t0:.1f} s\n")


if __name__ == "__main__":
    main()
