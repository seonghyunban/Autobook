"""Run normalization agent on test cases and save results to JSON.

Usage:
  uv run python normalization-experiment/run.py run1          # saves to results/run1.json
  uv run python normalization-experiment/run.py run1 norm_01  # specific test case only
"""
import json
import os
import sys
import time

sys.path.insert(0, "backend")

from services.normalization.service import normalize
from test_cases import NORMALIZATION_TEST_CASES

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")


def main():
    if len(sys.argv) < 2:
        print("Usage: run.py <run_name> [test_id ...]")
        print("Example: run.py run1")
        print("Example: run.py run1 norm_01_machinery_purchase norm_04_donation")
        sys.exit(1)

    run_name = sys.argv[1]
    filter_ids = set(sys.argv[2:]) if len(sys.argv) > 2 else None

    cases = NORMALIZATION_TEST_CASES
    if filter_ids:
        cases = [tc for tc in cases if tc["id"] in filter_ids]

    os.makedirs(RESULTS_DIR, exist_ok=True)

    results = []
    for tc in cases:
        print(f"Running: {tc['id']}...", end=" ", flush=True)

        start = time.time()
        try:
            result = normalize(tc["text"])
            elapsed = time.time() - start
            print(f"{elapsed:.1f}s")
            results.append({
                "id": tc["id"],
                "input": tc["text"],
                "output": result,
                "time_s": round(elapsed, 1),
                "error": None,
            })
        except Exception as e:
            elapsed = time.time() - start
            print(f"ERROR ({elapsed:.1f}s): {e}")
            results.append({
                "id": tc["id"],
                "input": tc["text"],
                "output": None,
                "time_s": round(elapsed, 1),
                "error": str(e),
            })

    out_path = os.path.join(RESULTS_DIR, f"{run_name}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nSaved {len(results)} results to {out_path}")


if __name__ == "__main__":
    main()
