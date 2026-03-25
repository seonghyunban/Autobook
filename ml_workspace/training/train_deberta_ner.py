from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

from ml_workspace.training.dataset import load_records
from ml_workspace.training.hf_dataset import build_entity_value_examples, build_token_examples

TAG_LABELS = [
    "O",
    "B-VENDOR",
    "I-VENDOR",
    "B-ASSET_NAME",
    "I-ASSET_NAME",
    "B-TRANSFER_DESTINATION",
    "I-TRANSFER_DESTINATION",
    "B-MENTIONED_DATE",
    "I-MENTIONED_DATE",
]


@dataclass(frozen=True)
class EntityTrainingConfig:
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
    run_name: str = "autobook-ner"


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def _char_labels(example, *, text: str) -> list[str]:
    labels = ["O"] * len(text)
    for span in example.spans:
        start = int(span["start"])
        end = int(span["end"])
        label = str(span["label"])
        if start < 0 or end > len(text) or end <= start:
            continue
        labels[start] = f"B-{label}"
        for index in range(start + 1, end):
            labels[index] = f"I-{label}"
    return labels


def _align_labels(tokenizer, examples):
    tag_to_id = {label: index for index, label in enumerate(TAG_LABELS)}

    def tokenize_and_align(batch):
        tokenized = tokenizer(
            batch["text"],
            truncation=True,
            max_length=batch["max_length"][0],
            return_offsets_mapping=True,
        )
        encoded_labels = []
        for offsets, text, spans in zip(tokenized["offset_mapping"], batch["text"], batch["spans"]):
            char_labels = _char_labels(type("Example", (), {"spans": spans}), text=text)
            token_labels = []
            for start, end in offsets:
                if start == end:
                    token_labels.append(-100)
                    continue
                if start >= len(char_labels):
                    token_labels.append(tag_to_id["O"])
                    continue
                token_labels.append(tag_to_id.get(char_labels[start], tag_to_id["O"]))
            encoded_labels.append(token_labels)
        tokenized["labels"] = encoded_labels
        tokenized.pop("offset_mapping", None)
        return tokenized

    return tokenize_and_align, tag_to_id


def _build_metrics():
    import evaluate
    import numpy as np

    seqeval = evaluate.load("seqeval")

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        predictions = np.argmax(logits, axis=-1)

        true_predictions = []
        true_labels = []
        for prediction, label in zip(predictions, labels):
            pred_tags = []
            label_tags = []
            for pred_id, label_id in zip(prediction, label):
                if label_id == -100:
                    continue
                pred_tags.append(TAG_LABELS[int(pred_id)])
                label_tags.append(TAG_LABELS[int(label_id)])
            true_predictions.append(pred_tags)
            true_labels.append(label_tags)

        metrics = seqeval.compute(predictions=true_predictions, references=true_labels)
        return {
            "precision": float(metrics.get("overall_precision", 0.0)),
            "recall": float(metrics.get("overall_recall", 0.0)),
            "f1": float(metrics.get("overall_f1", 0.0)),
            "accuracy": float(metrics.get("overall_accuracy", 0.0)),
        }

    return compute_metrics


def train_entity_model(config: EntityTrainingConfig) -> dict:
    import numpy as np
    from datasets import Dataset
    from transformers import (
        AutoModelForTokenClassification,
        AutoTokenizer,
        DataCollatorForTokenClassification,
        Trainer,
        TrainingArguments,
    )

    train_records = load_records(config.train_path)
    validation_records = load_records(config.validation_path)
    train_examples = build_token_examples(train_records)
    validation_examples = build_token_examples(validation_records)
    if not train_examples or not validation_examples:
        raise ValueError(
            "Entity training requires alignable entity spans. Add labels.entity_spans or examples with weakly alignable string entities."
        )

    tokenizer = AutoTokenizer.from_pretrained(config.base_model)
    preprocess, tag_to_id = _align_labels(tokenizer, train_examples)

    train_dataset = Dataset.from_list(
        [{"record_id": example.record_id, "text": example.text, "spans": example.spans, "max_length": config.max_length} for example in train_examples]
    ).map(preprocess, batched=True)
    validation_dataset = Dataset.from_list(
        [{"record_id": example.record_id, "text": example.text, "spans": example.spans, "max_length": config.max_length} for example in validation_examples]
    ).map(preprocess, batched=True)

    train_dataset.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])
    validation_dataset.set_format(type="torch", columns=["input_ids", "attention_mask", "labels"])

    id_to_label = {index: label for label, index in tag_to_id.items()}
    model = AutoModelForTokenClassification.from_pretrained(
        config.base_model,
        num_labels=len(TAG_LABELS),
        id2label=id_to_label,
        label2id=tag_to_id,
    )

    args = TrainingArguments(
        output_dir=str(config.output_dir / "checkpoints"),
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=config.learning_rate,
        per_device_train_batch_size=config.train_batch_size,
        per_device_eval_batch_size=config.eval_batch_size,
        num_train_epochs=config.num_train_epochs,
        weight_decay=config.weight_decay,
        logging_steps=1,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        report_to=["wandb"] if config.report_to_wandb else [],
        run_name=config.run_name,
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=args,
        train_dataset=train_dataset,
        eval_dataset=validation_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorForTokenClassification(tokenizer=tokenizer),
        compute_metrics=_build_metrics(),
    )
    trainer.train()
    metrics = trainer.evaluate()

    model.save_pretrained(config.output_dir)
    tokenizer.save_pretrained(config.output_dir)
    _write_json(config.output_dir / "tag_labels.json", {"labels": TAG_LABELS})
    _write_json(config.output_dir / "metrics.json", {key: float(value) if isinstance(value, (int, float, np.floating)) else value for key, value in metrics.items()})
    _write_json(config.output_dir / "entity_value_examples.json", {"examples": build_entity_value_examples(validation_records)})
    summary = {
        "base_model": config.base_model,
        "metrics": {key: float(value) if isinstance(value, (int, float, np.floating)) else value for key, value in metrics.items()},
        "train_examples": len(train_examples),
        "validation_examples": len(validation_examples),
        "artifact_dir": str(config.output_dir),
    }
    _write_json(config.output_dir / "run_summary.json", summary)
    return summary


def _parse_args() -> EntityTrainingConfig:
    workspace_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Train a DeBERTa token-classification entity model for Autobook.")
    parser.add_argument("--base-model", default="microsoft/deberta-v3-small")
    parser.add_argument("--train-path", type=Path, default=workspace_root / "data" / "processed" / "train.jsonl")
    parser.add_argument("--validation-path", type=Path, default=workspace_root / "data" / "processed" / "validation.jsonl")
    parser.add_argument("--output-dir", type=Path, default=workspace_root / "artifacts" / "entity_extractor")
    parser.add_argument("--num-train-epochs", type=float, default=1.0)
    parser.add_argument("--learning-rate", type=float, default=5e-5)
    parser.add_argument("--train-batch-size", type=int, default=4)
    parser.add_argument("--eval-batch-size", type=int, default=4)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--report-to-wandb", action="store_true")
    parser.add_argument("--wandb-project", default="490-autobook-ml")
    parser.add_argument("--run-name", default="autobook-ner")
    args = parser.parse_args()
    return EntityTrainingConfig(
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
        run_name=args.run_name,
    )


def main() -> None:
    config = _parse_args()
    summary = train_entity_model(config)
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
