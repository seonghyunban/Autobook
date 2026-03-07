#!/usr/bin/env python3
"""Custom GSM8K eval for SFT checkpoints.

Runner entrypoint:
    run_eval(checkpoint_dir, model_tag, step) -> dict
"""

import os
from contextlib import nullcontext

import torch


def _get_max_problems() -> int | None:
    raw = os.getenv("A4P2_GSM8K_MAX_PROBLEMS", "").strip()
    if not raw:
        return None
    value = int(raw)
    return None if value <= 0 else value


def run_eval(
    checkpoint_dir: str,
    model_tag: str,
    step: int,
) -> dict:
    os.environ["NANOCHAT_BASE_DIR"] = checkpoint_dir

    from nanochat.checkpoint_manager import load_model
    from nanochat.common import autodetect_device_type
    from nanochat.dataloader import tokenizing_distributed_data_loader_bos_bestfit
    from nanochat.engine import Engine
    from nanochat.loss_eval import evaluate_bpb
    from nanochat.tokenizer import get_token_bytes
    from scripts.chat_eval import run_chat_eval

    device_type = autodetect_device_type()
    device = torch.device(device_type)
    autocast_ctx = (
        torch.amp.autocast(device_type="cuda", dtype=torch.bfloat16)
        if device_type == "cuda"
        else nullcontext()
    )

    model, tokenizer, meta = load_model(
        source="sft",
        device=device,
        phase="eval",
        model_tag=model_tag,
        step=step,
    )
    engine = Engine(model, tokenizer)

    # BPB on train/val splits for SFT checkpoint.
    sequence_len = int(meta["model_config"]["sequence_len"])
    device_batch_size = int(os.getenv("A4P2_BPB_DEVICE_BATCH_SIZE", "16"))
    split_tokens = int(os.getenv("A4P2_BPB_SPLIT_TOKENS", str(4 * 524288)))
    tokens_per_step = max(1, device_batch_size * sequence_len)
    split_tokens = max(tokens_per_step, (split_tokens // tokens_per_step) * tokens_per_step)
    steps = max(1, split_tokens // tokens_per_step)
    token_bytes = get_token_bytes(device=device)

    bpb_results: dict[str, float] = {}
    for split_name in ("train", "val"):
        loader = tokenizing_distributed_data_loader_bos_bestfit(
            tokenizer, device_batch_size, sequence_len, split_name, device=device
        )
        with autocast_ctx:
            bpb = evaluate_bpb(model, loader, steps, token_bytes)
        bpb_results[split_name] = float(bpb)

    max_problems = _get_max_problems()
    with autocast_ctx:
        accuracy = run_chat_eval(
            task_name="GSM8K",
            model=model,
            tokenizer=tokenizer,
            engine=engine,
            batch_size=8,
            num_samples=1,
            max_new_tokens=512,
            temperature=0.0,
            top_k=50,
            max_problems=max_problems,
        )

    return {
        "task": "GSM8K",
        "source": "sft",
        "model_tag": model_tag,
        "step": step,
        "train_bpb": bpb_results["train"],
        "val_bpb": bpb_results["val"],
        "bpb_steps": steps,
        "bpb_split_tokens": split_tokens,
        "max_problems": max_problems if max_problems is not None else "all",
        "accuracy": float(accuracy),
    }
