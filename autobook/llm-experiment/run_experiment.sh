#!/bin/bash
# Run ablation experiment and/or show results.
#
# Run:
#   ./run_experiment.sh --variant full_pipeline                           # run one
#   ./run_experiment.sh --variant full_pipeline --analyze                 # run + results
#   ./run_experiment.sh --all                                             # run all 5
#   ./run_experiment.sh --all --analyze                                   # run all + compare
#   ./run_experiment.sh --variant full_pipeline --test-case 12_pay_salaries
#
# Analyze only (no run):
#   ./run_experiment.sh --analyze                                         # compare all
#   ./run_experiment.sh --analyze --variant full_pipeline                 # one variant detail

set -e

export DATABASE_URL=sqlite:///:memory:
export PYTHONPATH=../backend

ANALYZE=false
ALL=false
VARIANT=""
TEST_CASE=""
RUN=false

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --analyze) ANALYZE=true; shift ;;
        --all) ALL=true; RUN=true; shift ;;
        --variant) VARIANT="$2"; shift 2 ;;
        --test-case) TEST_CASE="$2"; shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

# Determine if we should run
if [ "$ALL" = true ]; then
    RUN=true
elif [ -n "$VARIANT" ] && [ "$ANALYZE" = false ]; then
    RUN=true
elif [ -n "$VARIANT" ] && [ -n "$TEST_CASE" ]; then
    RUN=true
fi

# Run
if [ "$RUN" = true ]; then
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
    fi
fi

# Analyze
if [ "$ANALYZE" = true ]; then
    echo ""
    echo "============================================"
    echo "  ANALYSIS"
    echo "============================================"
    if [ -n "$VARIANT" ]; then
        python analysis.py --results results/stage1/ --variant "$VARIANT"
    else
        python analysis.py --results results/stage1/
    fi
fi

# Show usage if nothing happened
if [ "$RUN" = false ] && [ "$ANALYZE" = false ]; then
    echo "Usage:"
    echo "  Run:     ./run_experiment.sh --variant <name> | --all [--analyze]"
    echo "  Analyze: ./run_experiment.sh --analyze [--variant <name>]"
fi
