#!/bin/bash
# Run ablation experiment and optionally show results.
#
# Usage:
#   ./run_experiment.sh --variant full_pipeline                    # run one variant
#   ./run_experiment.sh --variant full_pipeline --analyze          # run + show results
#   ./run_experiment.sh --all                                      # run all 5 variants
#   ./run_experiment.sh --all --analyze                            # run all + compare
#   ./run_experiment.sh --variant full_pipeline --test-case 12_pay_salaries  # single test case

set -e

export DATABASE_URL=sqlite:///:memory:
export PYTHONPATH=../backend

ANALYZE=false
ALL=false
VARIANT=""
TEST_CASE=""

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --analyze) ANALYZE=true; shift ;;
        --all) ALL=true; shift ;;
        --variant) VARIANT="$2"; shift 2 ;;
        --test-case) TEST_CASE="$2"; shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# Run
if [ "$ALL" = true ]; then
    echo "Running all Stage 1 variants..."
    for v in single_agent classify_and_build with_correction with_evaluation full_pipeline; do
        echo ""
        echo "============================================"
        echo "  Variant: $v"
        echo "============================================"
        python run.py --variant "$v"
    done
elif [ -n "$VARIANT" ]; then
    RUN_ARGS="--variant $VARIANT"
    [ -n "$TEST_CASE" ] && RUN_ARGS="$RUN_ARGS --test-case $TEST_CASE"
    python run.py $RUN_ARGS
else
    echo "Usage: ./run_experiment.sh --variant <name> | --all [--analyze]"
    exit 1
fi

# Analyze
if [ "$ANALYZE" = true ]; then
    echo ""
    echo "============================================"
    echo "  ANALYSIS"
    echo "============================================"
    if [ -n "$VARIANT" ] && [ "$ALL" = false ]; then
        python analysis.py --results results/stage1/ --variant "$VARIANT"
    else
        python analysis.py --results results/stage1/
    fi
fi
