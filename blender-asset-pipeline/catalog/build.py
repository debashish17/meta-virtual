"""Run the Blender kit over build specs, one Blender process at a time, with a build ledger.

A spec is rebuilt only when its hash or the kit source changed, or its outputs are missing.
Blender is located through $BLENDER_EXE, falling back to the default 5.2 install path.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
from pathlib import Path

from . import paths
from .specs import PX_PER_M

BATCH_SIZE = 40
BATCH_TIMEOUT_S = 1800


def kit_hash() -> str:
    digest = hashlib.sha256()
    for path in sorted(paths.KIT.rglob("*.py")) + sorted(paths.TEXTURES.glob("*.png")):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def blender_exe() -> Path:
    exe = Path(os.environ.get("BLENDER_EXE", paths.BLENDER_DEFAULT))
    if not exe.exists():
        raise FileNotFoundError(f"Blender not found at {exe}; set BLENDER_EXE")
    return exe


def outputs(item_id: str) -> tuple[Path, Path]:
    return paths.MODELS / f"{item_id}.glb", paths.THUMBS / f"{item_id}.png"


def _load_ledger() -> dict:
    return json.loads(paths.LEDGER.read_text(encoding="utf-8")) if paths.LEDGER.exists() else {}


def _save_ledger(ledger: dict) -> None:
    paths.LEDGER.parent.mkdir(parents=True, exist_ok=True)
    paths.LEDGER.write_text(json.dumps(ledger, indent=1), encoding="utf-8")


def _key(spec: dict, suffix: str) -> str:
    return f"{spec['hash']}:{suffix}"


def _suffix() -> str:
    """Everything outside the spec that changes the outputs: kit source and render scale."""
    return f"{kit_hash()}:{PX_PER_M}"


def cached_results(specs: list[dict]) -> dict[str, dict]:
    """Ledger results still valid for these specs: same key, and GLB + render still on disk."""
    ledger, suffix = _load_ledger(), _suffix()
    return {s["id"]: ledger[s["id"]]["result"] for s in specs
            if s["id"] in ledger and ledger[s["id"]]["key"] == _key(s, suffix)
            and all(p.exists() for p in outputs(s["id"]))}


def run(specs: list[dict]) -> dict[str, dict]:
    """Build every spec not already up to date and return results keyed by id."""
    ledger, suffix = _load_ledger(), _suffix()
    results = cached_results(specs)
    todo = [(s, _key(s, suffix)) for s in specs if s["id"] not in results]
    print(f"build: {len(results)} up to date, {len(todo)} to build")

    paths.BATCHES.mkdir(parents=True, exist_ok=True)
    exe = blender_exe() if todo else None
    for start in range(0, len(todo), BATCH_SIZE):
        chunk = todo[start:start + BATCH_SIZE]
        batch_file = paths.BATCHES / f"batch_{start // BATCH_SIZE:03d}.json"
        results_file = batch_file.with_name(batch_file.stem + "_results.json")
        results_file.unlink(missing_ok=True)
        batch = {"specs": [], "results": str(results_file)}
        for spec, _ in chunk:
            glb, thumb = outputs(spec["id"])
            batch["specs"].append({**spec, "glb": str(glb), "thumb": str(thumb), "pxPerM": PX_PER_M})
        batch_file.write_text(json.dumps(batch, indent=1), encoding="utf-8")
        proc = subprocess.run([str(exe), "--background", "--factory-startup", "--python", str(paths.KIT_ENTRY),
                               "--", str(batch_file)], capture_output=True, text=True, timeout=BATCH_TIMEOUT_S)
        if "KIT_BATCH_DONE" not in proc.stdout or not results_file.exists():
            raise RuntimeError(f"Blender batch {batch_file.name} did not finish (exit {proc.returncode}):\n"
                               f"{(proc.stderr or proc.stdout)[-2000:]}")
        keys = {spec["id"]: key for spec, key in chunk}
        for result in json.loads(results_file.read_text(encoding="utf-8")):
            results[result["id"]] = result
            if result["ok"]:
                ledger[result["id"]] = {"key": keys[result["id"]], "result": result}
            else:
                ledger.pop(result["id"], None)
        _save_ledger(ledger)
        done = min(start + BATCH_SIZE, len(todo))
        failed = sum(1 for s, _ in chunk if not results[s["id"]]["ok"])
        print(f"build: {done}/{len(todo)} built ({failed} failed in this batch)")

    wanted = {spec["id"] for spec in specs}
    for folder, suffix in ((paths.MODELS, ".glb"), (paths.THUMBS, ".png")):
        for stale in folder.glob(f"*{suffix}") if folder.exists() else []:
            if stale.name[: -len(suffix)] not in wanted:
                stale.unlink()
    return results
