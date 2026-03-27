"""Load experiment results from disk.

Supports results/<experiment>/<variant>/<timestamp>/ structure.
Merges evaluation files (entry_accuracy.json, clarification_relevance.json)
into test case dicts if present.
"""
from __future__ import annotations

import json
from pathlib import Path


def _merge_eval_file(cases: list[dict], run_dir: Path, filename: str,
                     result_key: str, eval_key: str) -> None:
    path = run_dir / filename
    if not path.exists():
        return
    evals = json.loads(path.read_text()).get("results", {})
    tc_by_id = {tc["test_case_id"]: tc for tc in cases}
    for tc_id, result in evals.items():
        if tc_id in tc_by_id:
            tc_by_id[tc_id][result_key] = result.get(eval_key, False)


def load_run(run_dir: Path) -> list[dict]:
    """Load all test case JSONs + merge evaluation files from a run directory."""
    cases = []
    skip = {"meta.json", "entry_accuracy.json", "clarification_relevance.json"}
    for f in sorted(run_dir.glob("*.json")):
        if f.name in skip:
            continue
        cases.append(json.loads(f.read_text()))
    _merge_eval_file(cases, run_dir, "entry_accuracy.json", "entry_match", "match")
    _merge_eval_file(cases, run_dir, "clarification_relevance.json", "clarification_correct", "relevant")
    return cases


def load_variant(experiment_dir: Path, variant_name: str) -> list[dict]:
    """Load ALL runs for a variant within an experiment, merge test cases."""
    variant_dir = experiment_dir / variant_name
    if not variant_dir.is_dir():
        return []
    all_cases = []
    seen_ids = set()
    for run_dir in sorted(variant_dir.iterdir()):
        if not run_dir.is_dir():
            continue
        for tc in load_run(run_dir):
            tc_id = tc["test_case_id"]
            if tc_id not in seen_ids:
                all_cases.append(tc)
                seen_ids.add(tc_id)
    return all_cases


def load_experiment(experiment: str,
                    variants: list[str] | None = None) -> dict[str, list[dict]]:
    """Load all variants for an experiment.

    If variants is None, auto-discover all variant dirs.
    Merges all timestamped runs per variant (for tier-split runs).
    """
    experiment_dir = Path("results") / experiment
    if not experiment_dir.is_dir():
        print(f"Warning: {experiment_dir} not found")
        return {}

    if variants is None:
        variants = sorted(d.name for d in experiment_dir.iterdir() if d.is_dir())

    results = {}
    for variant_name in variants:
        cases = load_variant(experiment_dir, variant_name)
        if cases:
            results[variant_name] = cases
    return results


def load_all_multi_runs(experiment: str,
                        variant_names: list[str]) -> dict[str, list[list[dict]]]:
    """Load all runs per variant for multi-run consistency."""
    experiment_dir = Path("results") / experiment
    all_runs = {}
    for variant_name in variant_names:
        variant_dir = experiment_dir / variant_name
        runs = []
        if not variant_dir.is_dir():
            continue
        for run_dir in sorted(variant_dir.iterdir()):
            if not run_dir.is_dir():
                continue
            cases = load_run(run_dir)
            if cases:
                runs.append(cases)
        all_runs[variant_name] = runs
    return all_runs
