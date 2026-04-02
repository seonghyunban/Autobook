"""Stage 1 ablation variant configs.

Config-driven — same graph, different RunnableConfig flags.
Only single_agent needs a separate graph.

Each config dict is passed via RunnableConfig["configurable"].

Variants:
  A: baseline         — classifiers + drafter only
  B: +corrector       — adds correction pass
  C: +evaluation      — adds approver + diagnostician
  D: +disambiguation  — adds disambiguator
  F: full_pipeline    — all components
  G: single_agent     — one LLM call (separate graph)
"""

VARIANTS: dict[str, dict | None] = {
    # None = separate graph (llm-experiment/single_agent/)
    "single_agent": None,

    # A: Classifiers + entry builder only (minimum viable)
    "baseline": {
        "disambiguator_active": False,
        "correction_active": False,
        "evaluation_active": False,
    },

    # B: + correction pass
    "with_correction": {
        "disambiguator_active": False,
        "evaluation_active": False,
    },

    # C: + approver + diagnostician (no correction, no disambiguator)
    "with_evaluation": {
        "disambiguator_active": False,
        "correction_active": False,
    },

    # D: + disambiguator (no correction, no evaluation)
    "with_disambiguation": {
        "correction_active": False,
        "evaluation_active": False,
    },

    # F: Full pipeline — all features on
    "full_pipeline": {},

    # V3: New architecture — specialized agents, 2-layer routing
    # Uses graph_v3.py (separate graph, no ablation flags)
    "baseline_v3": None,

    # Naive: single agent, zero domain knowledge baseline
    "naive_agent": None,

    # Single agent V3: all V3 knowledge in one LLM call
    "single_agent_v3": None,

    # V3 Simple: classifiers + tax + drafter only (no detection/decision layer)
    "v3_simple": None,

    # V3.1: gating-only single agent (ambiguity + complexity + decision, no entry)
    "single_agent_v3_1": None,

    # V4: decision maker (renamed v3.1 gating agent)
    "decision_maker_v4": None,

    # V4 Dual-Track: decision_maker_v4 + classifiers + tax parallel, then entry_drafter if PROCEED
    "baseline_v4_dualtrack": None,
}
