#!/bin/bash
# Run ablation experiment and show results.
#
# Usage:
#   ./run_experiment.sh --variant full_pipeline
#   ./run_experiment.sh --variant full_pipeline --test-case 12_pay_salaries
#   ./run_experiment.sh --all                    # run all 5 variants
#   ./run_experiment.sh --analyze                # compare all variants
#   ./run_experiment.sh --analyze full_pipeline  # single variant detail

set -e

export DATABASE_URL=sqlite:///:memory:
export PYTHONPATH=../backend

if [ "$1" = "--all" ]; then
    echo "Running all Stage 1 variants..."
    for variant in single_agent classify_and_build with_correction with_evaluation full_pipeline; do
        echo ""
        echo "============================================"
        echo "  Variant: $variant"
        echo "============================================"
        python run.py --variant "$variant"
    done
    echo ""
    echo "============================================"
    echo "  ANALYSIS"
    echo "============================================"
    python analysis.py --results results/stage1/
elif [ "$1" = "--analyze" ]; then
    if [ -n "$2" ]; then
        python analysis.py --results results/stage1/ --variant "$2"
    else
        python analysis.py --results results/stage1/
    fi
else
    python run.py "$@"
    echo ""
    echo "============================================"
    echo "  ANALYSIS"
    echo "============================================"
    python analysis.py --results results/stage1/
fi
