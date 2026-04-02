#!/bin/bash
# Run ablation experiment.
#
# Usage:
#   ./run_experiment.sh --experiment stage1 --variant full_pipeline
#   ./run_experiment.sh --experiment stage1 --variant full_pipeline --tier basic
#   ./run_experiment.sh --experiment stage1 --all --tier basic --runs 5
#   ./run_experiment.sh --experiment stage1 --variant single_agent_v3_1 --agent-model default=sonnet
#   ./run_experiment.sh --experiment stage1 --variant baseline_v4_dualtrack --agent-model default=sonnet --agent-model decision_maker_v4=opus
#   ./run_experiment.sh --experiment stage1 --variant single_agent_v3_1 --agent-model default=sonnet --thinking medium
set -e

export DATABASE_URL=sqlite:///:memory:
export PYTHONPATH=../backend:code/run:test_cases:.

EXPERIMENT=""
ALL=false
VARIANT=""
TIER=""
RUNS=1
THINKING=""
AGENT_MODELS=()
TEST_CASES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --experiment) EXPERIMENT="$2"; shift 2 ;;
        --all) ALL=true; shift ;;
        --variant) VARIANT="$2"; shift 2 ;;
        --tier) TIER="$2"; shift 2 ;;
        --runs) RUNS="$2"; shift 2 ;;
        --agent-model) AGENT_MODELS+=("$2"); shift 2 ;;
        --thinking) THINKING="$2"; shift 2 ;;
        --test-case) TEST_CASES+=("$2"); shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [ -z "$EXPERIMENT" ]; then
    echo "Usage: ./run_experiment.sh --experiment <name> --variant <name> --agent-model default=<model> [--agent-model agent=model ...] [--tier <tier>] [--runs N] [--thinking low|medium|high]"
    exit 1
fi

if [ ${#AGENT_MODELS[@]} -eq 0 ]; then
    echo "--agent-model default=<model> is required"
    exit 1
fi

RUN_BASE="--experiment $EXPERIMENT"

# Build args for a single variant
run_variant() {
    local v="$1"
    RUN_ARGS="$RUN_BASE --variant $v --runs $RUNS"
    [ -n "$TIER" ] && RUN_ARGS="$RUN_ARGS --tier $TIER"
    for am in "${AGENT_MODELS[@]}"; do
        RUN_ARGS="$RUN_ARGS --agent-model $am"
    done
    [ -n "$THINKING" ] && RUN_ARGS="$RUN_ARGS --thinking $THINKING"
    for tc in "${TEST_CASES[@]}"; do
        RUN_ARGS="$RUN_ARGS --test-case $tc"
    done
    /opt/anaconda3/bin/uv run --extra agent python code/run/main.py $RUN_ARGS
}

if [ "$ALL" = true ]; then
    for v in single_agent baseline with_correction with_evaluation with_disambiguation full_pipeline; do
        echo ""
        echo "============================================"
        echo "  Variant: $v"
        echo "============================================"
        run_variant "$v"
    done
elif [ -n "$VARIANT" ]; then
    run_variant "$VARIANT"
else
    echo "Usage: ./run_experiment.sh --experiment <name> --variant <name> | --all"
fi
