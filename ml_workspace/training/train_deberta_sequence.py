from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

from ml_workspace.training.dataset import load_records
from ml_workspace.training.hf_dataset import build_classification_examples

TASKS = ("intent_label", "bank_category", "cca_class_match")


@dataclass(frozen=True)
class SequenceTrainingConfig:
    base_model: str
    train_path: Path
    validation_path: Path
    output_dir: Path
    num_train_epochs: float = 1.0
    learning_rate: float = 5e-5
    train_batch_size: int = 4
    eval_batch_size: int = 4
    weight_decay: float = 0.01
    max_length: int = 256
    report_to_wandb: bool = False
    wandb_project: str = "490-autobook-ml"
    run_prefix: str = "autobook-seq"


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def _build_metrics():
    import evaluate
    import numpy as np

    accuracy_metric = evaluate.load("accuracy")
    f1_metric = evaluate.load("f1")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)
        return {
            "accuracy": accuracy_metric.compute(predictions=predictions, references=labels)["accuracy"],
            "macro_f1": f1_metric.compute(
                predictions=predictions,
                references=labels,
                average="macro",
            )["f1"],
        }

    return compute_metrics


def _train_one_task(
    *,
    task_name: str,
    config: SequenceTrainingConfig,
    train_records: list,
    validation_records: list,
) -> dict:
    import numpy as np
    from datasets import Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        DataCollatorWithPadding,
        Trainer,
        TrainingArguments,
    )

    train_examples = build_classification_examples(train_records, task_name)
    validation_examples = build_classification_examples(validation_records, task_name)
    labels = sorted({example["label"] for example in train_examples + validation_examples})
    label_to_id = {label: index for index, label in enumerate(labels)}
    id_to_label = {index: label for label, index in label_to_id.items()}

    tokenizer = AutoTokenizer.from_pretrained(config.base_model)

    def preprocess(batch):
        encoded = tokenizer(
            batch["text"],
            truncation=True,
            max_length=config.max_length,
        )
        encoded["labels"] = [label_to_id[label] for label in batch["label"]]
        return encoded

    train_dataset = Dataset.from_list(train_examples).map(preprocess, batched=True)
    validation_dataset = Dataset.from_list(validation_examples).map(preprocess, batched=True)
    train_dataset.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
    validation_dataset.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])

    model = AutoModelForSequenceClassification.from_pretrained(
        config.base_model,
        num_labels=len(labels),
        id2label=id_to_label,
        label2id=label_to_id,
    )

    task_output_dir = config.output_dir / task_name
    args = TrainingArguments(
        output_dir=str(task_output_dir / "checkpoints"),
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=config.learning_rate,
        per_device_train_batch_size=config.train_batch_size,
        per_device_eval_batch_size=config.eval_batch_size,
        num_train_epochs=config.num_train_epochs,
        weight_decay=config.weight_decay,
        logging_steps=1,
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        report_to=["wandb"] if config.report_to_wandb else [],
        run_name=f"{config.run_prefix}-{task_name}",
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=_build_metrics(),
    )
    trainer.train()
    metrics = trainer.evaluate()

    model.save_pretrained(task_output_dir)
    tokenizer.save_pretrained(task_output_dir)
    _write_json(task_output_dir / "labels.json", {"labels": labels})
    _write_json(
        task_output_dir / "metrics.json",
        {key: float(value) if isinstance(value, (int, float, np.floating)) else value for key, value in metrics.items()},
    )
    return {
        "task": task_name,
        "labels": labels,
        "metrics": {key: float(value) if isinstance(value, (int, float, np.floating)) else value for key, value in metrics.items()},
        "artifact_dir": str(task_output_dir),
    }


def train_sequence_models(config: SequenceTrainingConfig) -> dict:
    train_records = load_records(config.train_path)
    validation_records = load_records(config.validation_path)

    summary = {
        "base_model": config.base_model,
        "tasks": {},
        "train_records": len(train_records),
        "validation_records": len(validation_records),
    }
    label_maps: dict[str, list[str]] = {}

    for task_name in TASKS:
        task_summary = _train_one_task(
            task_name=task_name,
            config=config,
            train_records=train_records,
            validation_records=validation_records,
        )
        summary["tasks"][task_name] = task_summary
        label_maps[task_name] = task_summary["labels"]

    _write_json(config.output_dir / "manifest.json", {"base_model": config.base_model, "tasks": list(TASKS)})
    _write_json(config.output_dir / "label_maps.json", label_maps)
    _write_json(config.output_dir / "run_summary.json", summary)
    return summary


def _parse_args() -> SequenceTrainingConfig:
    workspace_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train DeBERTa sequence classifiers for Autobook ML tasks.")
    parser.add_argument("--base-model", default="microsoft/deberta-v3-small")
    parser.add_argument("--train-path", type=Path, default=workspace_root / "data" / "processed" / "train.jsonl")
    parser.add_argument("--validation-path", type=Path, default=workspace_root / "data" / "processed" / "validation.jsonl")
    parser.add_argument("--output-dir", type=Path, default=workspace_root / "artifacts" / "classifier")
    parser.add_argument("--num-train-epochs", type=float, default=1.0)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--train-batch-size", type=int, default=4)
    parser.add_argument("--eval-batch-size", type=int, default=4)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--report-to-wandb", action="store_true")
    parser.add_argument("--wandb-project", default="490-autobook-ml")
    parser.add_argument("--run-prefix", default="autobook-seq")
    args = parser.parse_args()
    return SequenceTrainingConfig(
        base_model=args.base_model,
        train_path=args.train_path,
        validation_path=args.validation_path,
        output_dir=args.output_dir,
        num_train_epochs=args.num_train_epochs,
        learning_rate=args.learning_rate,
        train_batch_size=args.train_batch_size,
        eval_batch_size=args.eval_batch_size,
        weight_decay=args.weight_decay,
        max_length=args.max_length,
        report_to_wandb=args.report_to_wandb,
        wandb_project=args.wandb_project,
        run_prefix=args.run_prefix,
    )


def main() -> None:
    config = _parse_args()
    summary = train_sequence_models(config)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
