# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/tools/export.py
import asyncio
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.shapes.group import GroupShape

HERE = Path(__file__).resolve().parent
USAGE = "python tools/export.py figure/out/<name> [--formats tif,eps,pptx,pptx-native]"
FORMATS = ("tif", "eps", "pptx", "pptx-native")
DEFAULT_FORMATS = ["tif", "eps", "pptx"]
DEFAULT_DPI = 600
HEAD_BYTES = 4096
Result = tuple[str | None, str]


def tif(base: str) -> Result:
    im = Image.open(f"{base}.png")
    dpi_x, dpi_y = im.info.get("dpi", (DEFAULT_DPI, DEFAULT_DPI))
    dpi = (round(dpi_x), round(dpi_y))
    if im.mode == "RGBA":
        flat = Image.new("RGB", im.size, "white")
        flat.paste(im, mask=im.split()[3])
        im = flat
    out = f"{base}.tif"
    im.convert("RGB").save(out, compression="tiff_lzw", dpi=dpi)
    back = Image.open(out)
    return out, f"{back.size[0]}x{back.size[1]} px, {round(back.info.get('dpi', (0.0, 0.0))[0])} dpi"


async def exec_tool(args: list[str]) -> str:
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await proc.communicate()
    code = proc.returncode or 0
    if code:
        raise subprocess.CalledProcessError(code, args, out, err)
    return out.decode()


def run_tool(args: list[str]) -> str:
    return asyncio.run(exec_tool(args))


def eps(base: str) -> Result:
    out = f"{base}.eps"
    pdftops = shutil.which("pdftops")
    ghostscript = shutil.which("gs")
    if pdftops:
        _ = run_tool([pdftops, "-eps", f"{base}.pdf", out])
    elif ghostscript:
        gs_args = ["-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=eps2write", f"-sOutputFile={out}", f"{base}.pdf"]
        _ = run_tool([ghostscript, *gs_args])
    else:
        return None, "skipped: install poppler (pdftops) or Ghostscript"
    head = Path(out).read_bytes()[:HEAD_BYTES].decode("latin-1")
    box = re.search(r"%%BoundingBox:\s*(\d+) (\d+) (\d+) (\d+)", head)
    if not head.startswith("%!PS-Adobe") or "EPSF" not in head.split("\n")[0] or not box:
        message = "the EPS has no valid header or bounding box"
        raise RuntimeError(message)
    return out, f"bounding box {box.group(3)}x{box.group(4)} pt"


def pptx(base: str) -> Result:
    out = f"{base}.pptx"
    _ = run_tool([sys.executable, str(HERE / "svg2pptx.py"), out, f"{base}.svg", f"{base}.png"])
    deck = Presentation(out)
    pic = deck.slides[0].shapes[0]
    return out, (
        f"{len(deck.slides)} slide, picture {pic.width / pic.height:.2f}:1, "
        f"slide {deck.slide_width / deck.slide_height:.2f}:1"
    )


def count_shapes(deck_path: str) -> tuple[int, int]:
    deck = Presentation(deck_path)
    n_text = n_shape = 0
    stack = list(deck.slides[0].shapes)
    while stack:
        s = stack.pop()
        if isinstance(s, GroupShape):
            stack.extend(s.shapes)
        elif s.has_text_frame and s.text_frame.text.strip():
            n_text += 1
        else:
            n_shape += 1
    return n_text, n_shape


def pptx_native(base: str) -> Result:
    out = f"{base}-native.pptx"
    stdout = run_tool([sys.executable, str(HERE / "svg2pptx.py"), "--native", out, f"{base}.svg", f"{base}.png"])
    n_text, n_shape = count_shapes(out)
    dropped = sum(1 for line in stdout.splitlines() if "WARNING" in line)
    slides = len(Presentation(out).slides)
    return out, (
        f"{slides} slide, {n_text} text boxes, {n_shape} shapes, "
        f"{dropped} kinds of dropped parts (see the converter output)"
    )


def run_format(name: str, base: str) -> Result:
    if name == "tif":
        return tif(base)
    if name == "eps":
        return eps(base)
    if name == "pptx":
        return pptx(base)
    return pptx_native(base)


def parse(argv: list[str]) -> tuple[str, list[str]]:
    args = argv[1:]
    want = list(DEFAULT_FORMATS)
    if "--formats" in args:
        i = args.index("--formats")
        want = args[i + 1].split(",")
        del args[i : i + 2]
    if len(args) != 1 or any(w not in FORMATS for w in want):
        raise SystemExit(USAGE)
    return args[0], want


def main(argv: list[str]) -> None:
    base, want = parse(argv)
    for ext in ("png", "pdf", "svg"):
        if not Path(f"{base}.{ext}").exists():
            message = f"missing {base}.{ext}: render the figure with tools/render.mjs first"
            raise SystemExit(message)
    failed = 0
    for w in want:
        try:
            path, note = run_format(w, base)
            _ = sys.stdout.write(f"{w:<5} {Path(path).name + '  ' if path else ''}{note}\n")
        except (OSError, RuntimeError, ValueError, KeyError, subprocess.SubprocessError) as e:
            failed += 1
            _ = sys.stdout.write(f"{w:<5} FAILED: {e}\n")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main(sys.argv)
