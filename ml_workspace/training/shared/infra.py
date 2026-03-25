from __future__ import annotations

import modal


WANDB_PROJECT = "490-autobook-ml"
VOLUME_PATH = "/ml_artifacts"

app = modal.App("autobook-ml-training")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git")
    .pip_install(
        "torch==2.9.1",
        index_url="https://download.pytorch.org/whl/cu128",
    )
    .pip_install(
        "datasets>=4.0.0",
        "evaluate>=0.4.0",
        "numpy>=2.0.0",
        "pyyaml>=6.0.0",
        "scikit-learn>=1.5.0",
        "seqeval>=1.2.2",
        "transformers>=4.57.3",
        "wandb>=0.21.3",
    )
    .add_local_python_source("ml_workspace")
)

volume = modal.Volume.from_name("autobook-ml-artifacts", create_if_missing=True)
wandb_secret = modal.Secret.from_name("wandb-secret")
