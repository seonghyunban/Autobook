"""Prompt builder for Agent 7 — Diagnostician.

Identifies which agent(s) caused an error and produces a fix plan.
Only runs when Agent 6 rejects. Output: JSON with decision and fix_plans.
"""
import json

from services.agent.graph.state import PipelineState

_CACHE_POINT = {"cachePoint": {"type": "default"}}

_PREAMBLE = """\
You are a debugging specialist in a Canadian automated bookkeeping system."""

_ROLE = """
## Your Role

The Approver rejected a journal entry. Your job is to identify which agent \
in the pipeline caused the error and produce a fix plan so the system can \
rerun the right agents. You are the last step before a human sees this — \
be precise about the root cause."""

_PIPELINE = """
## Pipeline Structure

The journal entry was produced by this pipeline of agents:

| Index | Agent              | What It Does                              |
|-------|--------------------|-------------------------------------------|
| 0     | Disambiguator      | Resolves ambiguous transaction text       |
| 1     | Debit Classifier   | Counts debit lines per directional category |
| 2     | Credit Classifier  | Counts credit lines per directional category |
| 3     | Debit Corrector    | Cross-validates debit tuple using credit side |
| 4     | Credit Corrector   | Cross-validates credit tuple using debit side |
| 5     | Entry Builder      | Constructs full journal entry from tuples |

Errors propagate downstream: if Agent 1 misclassifies, Agents 3 and 5 \
inherit the mistake. Target the ROOT CAUSE, not the symptom."""

_DECISIONS = """
## Decision: FIX vs STUCK

**FIX** — the error is fixable by rerunning agents with corrective context:
- Wrong tuple classification → target the classifier (agent 1 or 2)
- Corrector missed an error → target the corrector (agent 3 or 4)
- Entry builder used wrong accounts → target agent 5
- Ambiguous input caused cascading errors → target agent 0

**STUCK** — the error requires human intervention:
- Transaction text is genuinely ambiguous even with context
- Multiple conflicting valid interpretations exist
- Required information is missing from the transaction text
- The error pattern doesn't match any known agent failure mode"""

_EXAMPLES = """
## Examples

<example>
Rejection: "COGS recorded as asset increase instead of expense increase"
Output:
{
  "decision": "FIX",
  "fix_plans": [
    {
      "agent": 1,
      "error": "Classified COGS as asset increase instead of expense increase",
      "fix_context": "COGS should be expense increase because inventory is being consumed, not acquired"
    }
  ]
}
— Root cause is Agent 1 (debit classifier). Agent 3 and 5 will rerun automatically.
</example>

<example>
Rejection: "Missing HST lines on taxable transaction in Ontario"
Output:
{
  "decision": "FIX",
  "fix_plans": [
    {
      "agent": 5,
      "error": "Entry builder did not include HST lines for Ontario transaction",
      "fix_context": "Transaction is in Ontario (HST province). Add HST Receivable debit and increase Cash credit by HST amount."
    }
  ]
}
— Root cause is Agent 5 (entry builder). Tuples are correct, just missing tax lines.
</example>

<example>
Rejection: "Cannot determine if TXN REF 449281 is revenue or expense"
Output:
{
  "decision": "STUCK",
  "fix_plans": []
}
— Transaction text is uninterpretable. Needs human clarification.
</example>

<example>
Rejection: "Owner withdrawal classified as expense by both classifier and corrector"
Output:
{
  "decision": "FIX",
  "fix_plans": [
    {
      "agent": 1,
      "error": "Classified owner withdrawal as expense increase instead of dividend increase",
      "fix_context": "Owner withdrawals are dividend increases (slot b), not expense increases (slot c). Ownership structure is sole proprietor."
    }
  ]
}
— Root cause is Agent 1. Agent 3 didn't catch it either, but fixing 1 will cascade correctly.
</example>"""

_OUTPUT_FORMAT = """
## Output Format

Return ONLY valid JSON:
{
  "decision": "FIX" or "STUCK",
  "fix_plans": [
    {"agent": <int 0-5>, "error": "<what went wrong>", "fix_context": "<guidance for rerun>"}
  ]
}

fix_plans is empty when decision is STUCK. Each fix_plan targets the ROOT \
CAUSE agent — downstream agents rerun automatically. No markdown, no preamble."""

SYSTEM_INSTRUCTION = "\n".join([
    _PREAMBLE, _ROLE, _PIPELINE, _DECISIONS, _EXAMPLES, _OUTPUT_FORMAT,
])


def build_prompt(state: PipelineState, rag_examples: list[dict]) -> dict:
    """Build the diagnostician prompt with cache breakpoints."""
    system = [{"text": SYSTEM_INSTRUCTION}, _CACHE_POINT]

    text = state.get("enriched_text") or state["transaction_text"]
    transaction_block = f"<transaction>{text}</transaction>"

    # Dynamic block: full generator trace + rejection
    trace_parts = []
    for field in ["output_disambiguator", "output_debit_classifier",
                  "output_credit_classifier", "output_debit_corrector",
                  "output_credit_corrector", "output_entry_builder"]:
        val = state.get(field)
        if val is not None:
            trace_parts.append(f"{field}: {val}")
    trace_text = "\n".join(trace_parts) if trace_parts else "No trace available."

    approval = state.get("approval", {})
    rejection_text = json.dumps(approval, indent=2) if approval else "No rejection details."

    dynamic_block = (
        f"<generator_trace>\n{trace_text}\n</generator_trace>\n"
        f"<rejection>\n{rejection_text}\n</rejection>"
    )

    parts = [{"text": transaction_block}, _CACHE_POINT, {"text": dynamic_block}]

    if rag_examples:
        examples_text = "These are similar past fix outcomes for reference:\n<examples>\n"
        for ex in rag_examples:
            examples_text += f"  {ex}\n\n"
        examples_text += "</examples>"
        parts.append({"text": examples_text})

    return {
        "system": system,
        "messages": [{"role": "user", "content": parts}],
    }
