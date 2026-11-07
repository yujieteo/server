# Source: https://github.com/lgwrightlab/schematic-figure (MIT), foundation/blender/mol3d.py
import argparse
import asyncio
import importlib
import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import cast

from mol3d_smiles import MolResult

EXTERNAL_TIMEOUT = 60
RDKIT_MISSING = 3


def _rdkit(smi: str, seed: int = 0) -> MolResult:
    return cast("MolResult", vars(importlib.import_module("mol3d_rdkit"))["embed_rdkit"](smi, seed))


def _builtin_best(smi: str, seed: int = 0, tries: int = 4) -> MolResult:
    return cast("MolResult", vars(importlib.import_module("mol3d_embed"))["builtin_best"](smi, seed, tries))


async def _run_python(py: str, args: Sequence[str]) -> str | None:
    pipe = asyncio.subprocess.PIPE
    try:
        proc = await asyncio.create_subprocess_exec(py, *args, stdout=pipe, stderr=pipe)
    except OSError:
        return None
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=EXTERNAL_TIMEOUT)
    except TimeoutError:
        proc.kill()
        _ = await proc.wait()
        return None
    return out.decode() if proc.returncode == 0 else None


def _candidates(python: str | None) -> list[str]:
    home = Path.home()
    cands = [
        python,
        os.environ.get("MOL3D_PYTHON"),
        str(home / "AppData/Local/anaconda3/python.exe"),
        str(home / "anaconda3/bin/python"),
        str(home / "miniconda3/bin/python"),
        "python3",
        "python",
    ]
    return [c for c in cands if c]


def _external(smi: str, seed: int, python: str | None) -> MolResult | None:
    script = str(Path(__file__).resolve())
    for py in _candidates(python):
        if os.sep in py and not Path(py).exists():
            continue
        out = asyncio.run(_run_python(py, [script, smi, "--seed", str(seed), "--rdkit-only"]))
        if out is not None and out.strip().startswith("{"):
            return cast("MolResult", json.loads(out))
    return None


def embed(smi: str, seed: int = 0, python: str | None = None, *, allow_builtin: bool = True) -> MolResult:
    try:
        return _rdkit(smi, seed)
    except ImportError:
        pass
    found = _external(smi, seed, python)
    if found is not None:
        return found
    if not allow_builtin:
        msg = "no rdkit found"
        raise RuntimeError(msg)
    return _builtin_best(smi, seed)


def _parse(argv: Sequence[str] | None) -> argparse.Namespace:
    a = argparse.ArgumentParser()
    _ = a.add_argument("smiles")
    _ = a.add_argument("--seed", type=int, default=0)
    _ = a.add_argument("--out")
    _ = a.add_argument("--builtin", action="store_true")
    _ = a.add_argument("--rdkit-only", action="store_true")
    return a.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    g = _parse(argv)
    smiles, seed, out = cast("str", g.smiles), cast("int", g.seed), cast("str | None", g.out)
    if cast("bool", g.rdkit_only):
        try:
            res = _rdkit(smiles, seed)
        except ImportError:
            return RDKIT_MISSING
    else:
        res = _builtin_best(smiles, seed) if cast("bool", g.builtin) else embed(smiles, seed)
    text = json.dumps(res)
    if out:
        _ = Path(out).write_text(text)
        _ = sys.stdout.write(f"wrote {out} {len(res['atoms'])} atoms via {res['method']}\n")
    else:
        _ = sys.stdout.write(text + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
