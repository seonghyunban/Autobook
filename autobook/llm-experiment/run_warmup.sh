#!/bin/bash
# Warm Bedrock prompt caches for selected variants.
#
# Usage:
#   ./run_warmup.sh --agent-model default=sonnet --variant single_agent_v3_1
#   ./run_warmup.sh --agent-model default=sonnet --agent-model decision_maker_v4=opus --variant baseline_v4_dualtrack
#   ./run_warmup.sh --agent-model default=haiku                              # warm all variants

set -e

export DATABASE_URL=sqlite:///:memory:
export PYTHONPATH=../backend:code/run:test_cases:.

VARIANTS=()
AGENT_MODELS=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --variant) VARIANTS+=("$2"); shift 2 ;;
        --agent-model) AGENT_MODELS+=("$2"); shift 2 ;;
        *) echo "Unknown arg: $1"; exit 1 ;;
    esac
done

if [ ${#AGENT_MODELS[@]} -eq 0 ]; then
    echo "Usage: ./run_warmup.sh --agent-model default=<model> [--agent-model agent=model ...] [--variant <name> ...]"
    echo "--agent-model default=<model> is required"
    exit 1
fi

# Collect all args for Python
ALL_ARGS=""
for v in "${VARIANTS[@]}"; do
    ALL_ARGS="$ALL_ARGS --variant $v"
done
for am in "${AGENT_MODELS[@]}"; do
    ALL_ARGS="$ALL_ARGS --agent-model $am"
done

echo "Warming caches..."
[ ${#VARIANTS[@]} -gt 0 ] && echo "  variants: ${VARIANTS[*]}"
echo "  models: ${AGENT_MODELS[*]}"

/opt/anaconda3/bin/uv run --extra agent python -c "
import sys
from warmup import warmup_caches, VARIANT_CACHE_MAP

# Parse args
variants = []
default_model = None
agent_overrides = {}

args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == '--variant':
        variants.append(args[i+1])
        i += 2
    elif args[i] == '--agent-model':
        key, val = args[i+1].split('=', 1)
        if key == 'default':
            default_model = val
        else:
            agent_overrides[key] = val
        i += 2
    else:
        i += 1

if not default_model:
    print('Error: --agent-model default=<model> is required')
    sys.exit(1)

unknown = [v for v in variants if v not in VARIANT_CACHE_MAP]
if unknown:
    print(f'Unknown variants: {unknown}')
    print(f'Available: {list(VARIANT_CACHE_MAP.keys())}')
    sys.exit(1)

warmup_caches(
    variants=variants or None,
    model=default_model,
    agent_model_overrides=agent_overrides or None,
)
" $ALL_ARGS
