#!/usr/bin/env python3
"""Build a reproducible, bounded-memory public H1 validation fixture for VCC2026.

The full public H1 fixture has 68,800 cells and 18,080 genes. On Server-IA
(15 GiB RAM) the full local cell-eval2 comparison was killed by the OOM
killer while scoring. This script constructs a separate, immutable, balanced
exploratory fixture without touching the full original data.

This subset must NEVER be represented as the official or full-size H1 score.
It is a preregistered surrogate to compare the same candidates under strictly
matched validation conditions, with an explicit independent confirmation gate.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile

import anndata as ad
import numpy as np

ROOT = Path("/mnt/datos/competition-24h/vcc")
SOURCE = ROOT / "data/fixtures/h1b"
TARGET = ROOT / "data/fixtures/h1b_lowram"
SEED = 20261103
N_PER_PERTURBATION = 96
N_CONTROL_CELLS = 4000
EXPECTED_PERTURBATIONS = 126
EXPECTED_GENES = 18080


def sha256_file(path: Path) -> str:
    """Return the content digest of a local validation artefact."""
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def select_rows(labels: np.ndarray, panel: list[str],
                rng: np.random.Generator) -> np.ndarray:
    """Select equal-size held-out samples without changing perturbation labels."""
    chosen: list[int] = []
    for gene in panel:
        indices = np.flatnonzero(labels == gene)
        if len(indices) < N_PER_PERTURBATION:
            raise ValueError(f"Insufficient public held-out cells: {gene}")
        sample = rng.choice(indices, N_PER_PERTURBATION, replace=False)
        chosen.extend(int(index) for index in sample)
    controls = np.flatnonzero(labels == "non-targeting")
    if len(controls) < N_CONTROL_CELLS:
        raise ValueError("Insufficient NTC control cells")
    chosen.extend(int(index) for index in rng.choice(
        controls, N_CONTROL_CELLS, replace=False))
    return np.array(sorted(chosen), dtype=np.int64)


def construct() -> None:
    """Create an audited, immutable held-out fixture using sparse backed reads."""
    TARGET.mkdir(parents=True, exist_ok=True)
    output_real = TARGET / "real.h5ad"
    output_ctrl = TARGET / "ctrl.h5ad"
    manifest = TARGET / "sampling_manifest.json"

    if manifest.exists():
        meta = json.loads(manifest.read_text(encoding="utf-8"))
        if (meta.get("sampling_seed") == SEED
                and output_real.exists() and output_ctrl.exists()
                and sha256_file(output_real) == meta.get("real_sha256")
                and sha256_file(output_ctrl) == meta.get("ctrl_sha256")):
            print("EXISTING_H1_LOWRAM_FIXTURE_VERIFIED", meta["real_shape"])
            return
        raise RuntimeError("H1 fixture exists with an invalid manifest; refusing overwrite")

    original_real = ad.read_h5ad(SOURCE / "real.h5ad", backed="r")
    original_ctrl = ad.read_h5ad(SOURCE / "ctrl.h5ad", backed="r")
    if original_real.n_vars != EXPECTED_GENES:
        raise ValueError("Unexpected public H1 gene dimension")
    original_panel = json.loads((SOURCE / "panel.json").read_text(encoding="utf-8"))
    panel = original_panel["panel"]
    if len(panel) != EXPECTED_PERTURBATIONS:
        raise ValueError("Unexpected H1 perturbation panel")
    if list(original_real.var_names) != list(original_ctrl.var_names):
        raise ValueError("Held-out target/control gene axes differ")

    rng = np.random.default_rng(SEED)
    labels = original_real.obs["target_gene"].astype(str).to_numpy()
    selected_real = select_rows(labels, panel, rng)
    ctrl_selection = np.sort(
        rng.choice(original_ctrl.n_obs, N_CONTROL_CELLS, replace=False)
    )

    # Backed sparse slicing reads only selected rows. The subset fits into RAM.
    reduced_real = original_real[selected_real, :].to_memory()
    reduced_ctrl = original_ctrl[ctrl_selection, :].to_memory()
    original_real.file.close()
    original_ctrl.file.close()

    expected_real = EXPECTED_PERTURBATIONS * N_PER_PERTURBATION + N_CONTROL_CELLS
    if reduced_real.shape != (expected_real, EXPECTED_GENES):
        raise ValueError("Real reduced fixture has the wrong shape")
    if reduced_ctrl.shape != (N_CONTROL_CELLS, EXPECTED_GENES):
        raise ValueError("Control reduced fixture has the wrong shape")
    counts = reduced_real.obs["target_gene"].astype(str).value_counts()
    if counts.get("non-targeting", 0) != N_CONTROL_CELLS:
        raise ValueError("Wrong number of held-out NTC cells")
    if any(counts.get(name, 0) != N_PER_PERTURBATION for name in panel):
        raise ValueError("Perturbation group count mismatch")

    temp_real = TARGET / "real.partial.h5ad"
    temp_ctrl = TARGET / "ctrl.partial.h5ad"
    try:
        reduced_real.write_h5ad(temp_real, compression="gzip")
        reduced_ctrl.write_h5ad(temp_ctrl, compression="gzip")
        test_real = ad.read_h5ad(temp_real, backed="r")
        test_ctrl = ad.read_h5ad(temp_ctrl, backed="r")
        if test_real.shape != reduced_real.shape or test_ctrl.shape != reduced_ctrl.shape:
            raise RuntimeError("Round-trip H1 low-RAM fixture validation failed")
        test_real.file.close()
        test_ctrl.file.close()
        temp_real.replace(output_real)
        temp_ctrl.replace(output_ctrl)
        shutil.copy2(SOURCE / "panel.json", TARGET / "panel.json")
        record = {
            "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "sampling_seed": SEED,
            "source_context": "H1 public training fixture",
            "full_reference_size": [68800, 18080],
            "real_shape": list(reduced_real.shape),
            "ctrl_shape": list(reduced_ctrl.shape),
            "cells_per_perturbation": N_PER_PERTURBATION,
            "ntc_count": N_CONTROL_CELLS,
            "number_of_perturbations": EXPECTED_PERTURBATIONS,
            "real_sha256": sha256_file(output_real),
            "ctrl_sha256": sha256_file(output_ctrl),
            "panel_sha256": sha256_file(TARGET / "panel.json"),
            "scientific_limitations": (
                "New reduced H1 public fixture, NOT equivalent to the original "
                "full 400-cell-per-perturbation H1 benchmark, and NOT an official "
                "challenge score. The same fixed subset is reused for ALL candidates."
            ),
        }
        manifest.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
        print("H1_LOWRAM_FIXTURE_READY", json.dumps(record, sort_keys=True))
    finally:
        temp_real.unlink(missing_ok=True)
        temp_ctrl.unlink(missing_ok=True)


if __name__ == "__main__":
    construct()
