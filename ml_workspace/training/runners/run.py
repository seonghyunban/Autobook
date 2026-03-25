from __future__ import annotations

from ml_workspace.training.runners.train import Train
from ml_workspace.training.shared.infra import VOLUME_PATH, app, image, volume


@app.function(image=image, volumes={VOLUME_PATH: volume}, timeout=24 * 3600)
def run(cfg: dict) -> dict:
    train = Train.with_options(
        gpu=cfg.get("gpu", "A10G"),
        timeout=int(cfg.get("timeout_hours", 4) * 3600),
    )()

    sequence_result = None
    entity_result = None

    if cfg.get("sequence", {}).get("enabled", True):
        sequence_cfg = {
            **cfg,
            **cfg.get("sequence", {}),
        }
        sequence_result = train.run_sequence.remote(sequence_cfg)

    if cfg.get("entity", {}).get("enabled", True):
        entity_cfg = {
            **cfg,
            **cfg.get("entity", {}),
        }
        entity_result = train.run_entity.remote(entity_cfg)

    return {
        "experiment_name": cfg.get("experiment_name", "autobook_ml"),
        "sequence": sequence_result,
        "entity": entity_result,
    }
