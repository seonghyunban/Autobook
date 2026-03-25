"""Experiment analysis — aggregate and compare variant results using rich tables.

Usage:
    python analysis.py --results results/stage1/
    python analysis.py --results results/stage1/ --variant full_pipeline
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text

from metrics import VariantMetrics

console = Console()


def _load_results(results_dir: Path) -> dict[str, list[dict]]:
    """Load latest variant JSON results (symlinks only, skip timestamped files)."""
    results = {}
    for f in sorted(results_dir.glob("*.json")):
        # Skip timestamped files — only read symlinks (latest)
        if "_2026" in f.name:
            continue
        variant_name = f.stem
        data = json.loads(f.read_text())
        results[variant_name] = data
    return results


def aggregate_variant(variant_name: str, test_cases: list[dict]) -> VariantMetrics:
    """Aggregate per-test-case metrics into per-variant summary."""
    n = len(test_cases)
    if n == 0:
        return VariantMetrics(variant_name=variant_name)

    exact_matches = sum(
        1 for tc in test_cases
        if tc.get("debit_tuple_exact_match") and tc.get("credit_tuple_exact_match")
    )
    valid_entries = sum(1 for tc in test_cases if tc.get("entry_valid"))
    errors = sum(1 for tc in test_cases if tc.get("error"))
    fixes_attempted = sum(1 for tc in test_cases if tc.get("fix_attempted"))
    fixes_succeeded = sum(1 for tc in test_cases if tc.get("fix_succeeded"))

    total_cost = sum(tc.get("total_cost_usd", 0) for tc in test_cases)
    mean_latency = sum(tc.get("total_latency_ms", 0) for tc in test_cases) / n

    mean_debit_acc = sum(tc.get("debit_tuple_slot_accuracy", 0) for tc in test_cases) / n
    mean_credit_acc = sum(tc.get("credit_tuple_slot_accuracy", 0) for tc in test_cases) / n
    mean_slot = (mean_debit_acc + mean_credit_acc) / 2

    return VariantMetrics(
        variant_name=variant_name,
        num_test_cases=n,
        exact_match_rate=exact_matches / n,
        mean_slot_accuracy=mean_slot,
        entry_valid_rate=valid_entries / n,
        total_cost_usd=total_cost,
        cost_per_correct_entry=total_cost / exact_matches if exact_matches else float("inf"),
        mean_latency_ms=mean_latency,
        fix_rate=fixes_attempted / n if fixes_attempted else 0.0,
        fix_success_rate=fixes_succeeded / fixes_attempted if fixes_attempted else 0.0,
        error_rate=errors / n,
    )


def print_variant_table(variants: dict[str, VariantMetrics]) -> None:
    """Print per-variant comparison table using rich."""
    table = Table(title="Variant Comparison", show_lines=True)
    table.add_column("Variant", style="cyan", width=25)
    table.add_column("Match%", justify="right", width=8)
    table.add_column("SlotAcc", justify="right", width=8)
    table.add_column("Valid%", justify="right", width=8)
    table.add_column("Cost $", justify="right", width=10)
    table.add_column("$/Correct", justify="right", width=10)
    table.add_column("Latency", justify="right", width=10)
    table.add_column("Fix%", justify="right", width=7)
    table.add_column("Err%", justify="right", width=7)

    for name, m in variants.items():
        match_style = "green" if m.exact_match_rate >= 0.8 else "yellow" if m.exact_match_rate >= 0.5 else "red"
        err_style = "green" if m.error_rate == 0 else "red"
        cost_correct = f"${m.cost_per_correct_entry:.4f}" if m.cost_per_correct_entry < float("inf") else "∞"

        table.add_row(
            name,
            f"[{match_style}]{m.exact_match_rate*100:.1f}%[/{match_style}]",
            f"{m.mean_slot_accuracy*100:.1f}%",
            f"{m.entry_valid_rate*100:.1f}%",
            f"${m.total_cost_usd:.4f}",
            cost_correct,
            f"{m.mean_latency_ms:.0f}ms",
            f"{m.fix_rate*100:.1f}%",
            f"[{err_style}]{m.error_rate*100:.1f}%[/{err_style}]",
        )

    console.print(table)


def print_test_case_breakdown(all_results: dict[str, list[dict]]) -> None:
    """Print per-test-case breakdown across variants using rich."""
    # Collect all test case IDs
    all_ids = set()
    for cases in all_results.values():
        for tc in cases:
            all_ids.add(tc["test_case_id"])

    variant_names = list(all_results.keys())

    table = Table(title="Per-Test-Case Breakdown", show_lines=True)
    table.add_column("Test Case", style="cyan", width=35)
    for v in variant_names:
        table.add_column(v, width=20, no_wrap=True)

    for tc_id in sorted(all_ids):
        row = [tc_id]
        for variant in variant_names:
            cases = all_results[variant]
            tc = next((c for c in cases if c["test_case_id"] == tc_id), None)
            if tc:
                if tc.get("error"):
                    row.append("[red]❌ ERR[/red]")
                else:
                    d = "🔵" if tc.get("debit_tuple_exact_match") else "🔴"
                    c = "🔵" if tc.get("credit_tuple_exact_match") else "🔴"
                    cost = tc.get("total_cost_usd", 0)
                    row.append(f"D{d} C{c} ${cost:.3f}")
            else:
                row.append("—")
        table.add_row(*row)

    console.print(table)


def print_single_variant_detail(variant_name: str, test_cases: list[dict]) -> None:
    """Print detailed report for a single variant using rich."""
    m = aggregate_variant(variant_name, test_cases)

    # Summary panel
    summary = (
        f"Exact match rate:   [bold]{m.exact_match_rate*100:.1f}%[/bold]\n"
        f"Mean slot accuracy: {m.mean_slot_accuracy*100:.1f}%\n"
        f"Entry valid rate:   {m.entry_valid_rate*100:.1f}%\n"
        f"Total cost:         ${m.total_cost_usd:.4f}\n"
        f"Cost per correct:   ${m.cost_per_correct_entry:.4f}\n"
        f"Mean latency:       {m.mean_latency_ms:.0f}ms\n"
        f"Fix rate:           {m.fix_rate*100:.1f}%\n"
        f"Error rate:         {m.error_rate*100:.1f}%"
    )
    console.print(Panel(summary, title=f"{variant_name} — {m.num_test_cases} test cases"))

    # Per-test-case table
    table = Table(show_lines=False)
    table.add_column("Test Case", style="cyan", width=35)
    table.add_column("D", width=4)
    table.add_column("C", width=4)
    table.add_column("Cost", justify="right", width=10)
    table.add_column("Latency", justify="right", width=10)
    table.add_column("Note", width=50, no_wrap=True)

    for tc in sorted(test_cases, key=lambda x: x["test_case_id"]):
        if tc.get("error"):
            err = tc["error"][:45] + "…" if len(tc.get("error", "")) > 45 else tc.get("error", "")
            table.add_row(
                tc["test_case_id"],
                "", "",
                f"${tc.get('total_cost_usd', 0):.4f}",
                f"{tc.get('total_latency_ms', 0)}ms",
                f"[red]{err}[/red]",
            )
        else:
            d = "🔵" if tc.get("debit_tuple_exact_match") else "🔴"
            c = "🔵" if tc.get("credit_tuple_exact_match") else "🔴"
            table.add_row(
                tc["test_case_id"],
                d, c,
                f"${tc.get('total_cost_usd', 0):.4f}",
                f"{tc.get('total_latency_ms', 0)}ms",
                "",
            )

    console.print(table)


def export_csv(all_results: dict[str, list[dict]], out_path: Path) -> None:
    """Export all results to CSV."""
    rows = []
    for variant, cases in all_results.items():
        for tc in cases:
            row = dict(tc)
            row["variant"] = variant
            # Remove large fields for CSV
            row.pop("pipeline_state", None)
            row.pop("journal_entry", None)
            row.pop("agent_outputs", None)
            rows.append(row)

    if not rows:
        return

    fieldnames = list(rows[0].keys())
    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    console.print(f"\nCSV exported to [bold]{out_path}[/bold]")


def main():
    parser = argparse.ArgumentParser(description="Analyze experiment results")
    parser.add_argument("--results", required=True, help="Results directory")
    parser.add_argument("--variant", default=None, help="Analyze single variant only")
    args = parser.parse_args()

    results_dir = Path(args.results)
    if not results_dir.exists():
        console.print(f"[red]Directory not found: {results_dir}[/red]")
        sys.exit(1)

    all_results = _load_results(results_dir)
    if not all_results:
        console.print("[red]No result files found[/red]")
        sys.exit(1)

    console.print(f"\n[bold]Loaded {len(all_results)} variant(s):[/bold] {', '.join(all_results.keys())}\n")

    if args.variant:
        if args.variant not in all_results:
            console.print(f"[red]Variant not found: {args.variant}[/red]")
            console.print(f"Available: {list(all_results.keys())}")
            sys.exit(1)
        print_single_variant_detail(args.variant, all_results[args.variant])
    else:
        variants = {name: aggregate_variant(name, cases) for name, cases in all_results.items()}
        print_variant_table(variants)
        print_test_case_breakdown(all_results)
        csv_path = results_dir / "comparison.csv"
        export_csv(all_results, csv_path)


if __name__ == "__main__":
    main()
