#!/bin/bash
# Merge parallel evaluation files into entry_accuracy.json and clarification_relevance.json.
#
# Usage:
#   ./run_merge_eval.sh --experiment v4-dualtrack --variant baseline_v4_dualtrack
#
# Expects these files in results/<experiment>/<variant>/evaluation/:
#   eval_entry_basic.json
#   eval_entry_int_batch1.json
#   eval_entry_int_batch2.json
#   eval_entry_int_batch3.json
#   eval_entry_int_batch4.json
#   eval_clarification.json

set -e

EXPERIMENT=""
VARIANT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --experiment) EXPERIMENT="$2"; shift 2 ;;
        --variant) VARIANT="$2"; shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [ -z "$EXPERIMENT" ] || [ -z "$VARIANT" ]; then
    echo "Usage: ./run_merge_eval.sh --experiment <name> --variant <variant>"
    exit 1
fi

DIR="results/$EXPERIMENT/$VARIANT"
EVAL_DIR="$DIR/evaluation"

if [ ! -d "$EVAL_DIR" ]; then
    echo "Error: $EVAL_DIR not found"
    exit 1
fi

echo "Merging evaluation files from $EVAL_DIR into $DIR..."

python3 -c "
import json, sys, glob
from datetime import datetime

eval_dir = '$EVAL_DIR'
out_dir = '$DIR'

# ── Merge entry accuracy (5 files → 1) ─────────────────────────────────
entry_files = sorted(glob.glob(f'{eval_dir}/eval_entry_*.json'))
if not entry_files:
    print('Warning: no eval_entry_*.json files found in evaluation/')
else:
    merged_results = {}
    for f in entry_files:
        data = json.load(open(f))
        results = data.get('results', {})
        merged_results.update(results)
        print(f'  {f}: {len(results)} cases')

    merged = {
        'evaluator': 'claude',
        'evaluated_at': datetime.now().isoformat(),
        'prompt_version': 'v4',
        'source_files': [f.split('/')[-1] for f in entry_files],
        'results': merged_results,
    }

    out_path = f'{out_dir}/entry_accuracy.json'
    json.dump(merged, open(out_path, 'w'), indent=2)
    print(f'  → {out_path} ({len(merged_results)} cases)')

# ── Copy clarification relevance ────────────────────────────────────────
clar_file = f'{eval_dir}/eval_clarification.json'
clar_out = f'{out_dir}/clarification_relevance.json'
try:
    data = json.load(open(clar_file))
    results = data.get('results', {})
    merged = {
        'evaluator': 'claude',
        'evaluated_at': datetime.now().isoformat(),
        'prompt_version': 'v4',
        'source_files': ['eval_clarification.json'],
        'results': results,
    }
    json.dump(merged, open(clar_out, 'w'), indent=2)
    print(f'  {clar_file}: {len(results)} cases')
    print(f'  → {clar_out} ({len(results)} cases)')
except FileNotFoundError:
    print(f'Warning: {clar_file} not found')

print('Done.')
"
