"""Natural language renderers for agent pipeline outputs.

27 leaf renderers (plain text, no formatting) + 1 composite (render_full_trace).
All leaves return flat strings. Formatting (#, ##, <1>, -, indentation) is
applied only in render_full_trace.
"""
from __future__ import annotations


# ═══════════════════════════════════════════════════════════════════════
# Leaf renderers — plain text, no formatting
# ═══════════════════════════════════════════════════════════════════════

# ── Ambiguity (per item) — 7 renderers ─────────────────────────────

def render_ambiguity_aspect(aspect: str) -> str:
    return aspect


def render_conventional_default(default: str | None) -> str:
    if not default:
        return ""
    return default


def render_ifrs_default(default: str | None) -> str:
    if not default:
        return ""
    return default


def render_clarification_question(question: str | None) -> str:
    if not question:
        return ""
    return question


def render_case_label(case: str) -> str:
    return case


def render_possible_entry(entry: dict | None) -> str:
    """Renders a JournalEntry in proper entry format (multi-line, aligned)."""
    if not entry or not entry.get("lines"):
        return ""
    return _format_entry_lines(entry["lines"])


def render_ambiguity_status(ambiguous: bool) -> str:
    return "unresolved" if ambiguous else "resolved"


# ── Ambiguity summary — 1 renderer ─────────────────────────────────

def render_ambiguity_summary(ambiguities: list[dict]) -> str:
    n = len(ambiguities)
    unresolved = sum(1 for a in ambiguities if a.get("ambiguous"))
    if n == 0:
        return "No ambiguities identified."
    n_word = f"There {'are' if n != 1 else 'is'} {n} potential {'ambiguities' if n != 1 else 'ambiguity'} identified"
    u_word = f"{unresolved} out of {n} of them {'are' if unresolved != 1 else 'is'} unresolved"
    return f"{n_word}, and {u_word}."


# ── Complexity (per item) — 4 renderers ─────────────────────────────

def render_complexity_aspect(aspect: str) -> str:
    return aspect


def render_best_attempt(entry: dict | None) -> str:
    """Renders a JournalEntry in proper entry format (multi-line, aligned)."""
    if not entry or not entry.get("lines"):
        return ""
    return _format_entry_lines(entry["lines"])


def render_gap_description(gap: str | None) -> str:
    if not gap:
        return ""
    return gap


def render_complexity_status(beyond: bool) -> str:
    return "beyond capability" if beyond else "within capability"


# ── Complexity summary — 1 renderer ─────────────────────────────────

def render_complexity_summary(flags: list[dict]) -> str:
    n = len(flags)
    beyond = sum(1 for f in flags if f.get("beyond_llm_capability"))
    if n == 0:
        return "No complexity identified."
    n_word = f"There {'are' if n != 1 else 'is'} {n} potential {'complexities' if n != 1 else 'complexity'} identified"
    b_word = f"{beyond} out of {n} of them {'are' if beyond != 1 else 'is'} beyond LLM capability"
    return f"{n_word}, and {b_word}."


# ── Decision — 3 renderers ─────────────────────────────────────────

def render_proceed_reason(reason: str | None) -> str:
    if not reason:
        return ""
    return reason


def render_rationale(rationale: str) -> str:
    return rationale


def render_decision(decision: str) -> str:
    return decision


# ── Classification (per detection) — 3 renderers ───────────────────

def render_slot_and_count(slot: str, count: int) -> str:
    label = slot.replace("_", " ")
    return f"Identified {count} {'lines' if count != 1 else 'line'} associated with {label}"


def render_taxonomy(category: str) -> str:
    return category


def render_slot_reason(reason: str) -> str:
    return reason


# ── Tax — 6 renderers ──────────────────────────────────────────────

def render_tax_detection(mentioned: bool, classification: str) -> str:
    label = classification.replace("_", " ")
    if mentioned:
        return f"Tax is mentioned in the input. Classification: {label}."
    return f"Tax is not mentioned in the input. Classification: {label}."


def render_tax_context(context: str | None) -> str:
    if not context:
        return ""
    return context


def render_tax_reasoning(reasoning: str) -> str:
    return reasoning


def render_tax_decision(classification: str, itc_eligible: bool, amount_tax_inclusive: bool, rate: float | None) -> str:
    if classification in ("zero_rated", "exempt", "out_of_scope"):
        return f"No tax lines will be added ({classification.replace('_', ' ')})."
    parts = ["Tax lines will be added"]
    details = []
    if rate is not None:
        details.append(f"at {rate:.0%}")
    if itc_eligible:
        details.append("recoverable as Input Tax Credit")
    else:
        details.append("non-recoverable, included in expense")
    if amount_tax_inclusive:
        details.append("amount is tax-inclusive")
    if details:
        parts.append(": " + ", ".join(details) + ".")
    else:
        parts.append(".")
    return "".join(parts)


# ── Entry — 2 renderers ────────────────────────────────────────────

def render_entry_rationale(reason: str) -> str:
    return reason


def render_final_entry(entry: dict) -> str:
    """Renders a JournalEntry in proper entry format with totals."""
    if not entry or not entry.get("lines"):
        return "No entry produced."
    lines_text = _format_entry_lines(entry["lines"])
    debit_total = sum(float(l.get("amount", 0)) for l in entry["lines"] if l.get("type") == "debit")
    credit_total = sum(float(l.get("amount", 0)) for l in entry["lines"] if l.get("type") == "credit")
    total_line = f"Total: Dr ${debit_total:,.2f} / Cr ${credit_total:,.2f}"
    if abs(debit_total - credit_total) > 0.01:
        total_line += f"  ⚠ IMBALANCED by ${abs(debit_total - credit_total):,.2f}"
    return f"{lines_text}\n{total_line}"


# ── Shared entry formatter ──────────────────────────────────────────

def _format_entry_lines(lines: list[dict]) -> str:
    """Format journal lines with aligned columns: side, account, amount, reason."""
    parts = []
    for line in lines:
        if line.get("type") == "debit":
            side = "Dr"
            amt = float(line.get("amount", 0))
            reason = line.get("reason", "")
            text = f"{side} {line.get('account_name', '?'):40s} ${amt:>12,.2f}"
            if reason:
                text += f"  — {reason}"
            parts.append(text)
    for line in lines:
        if line.get("type") == "credit":
            side = "Cr"
            amt = float(line.get("amount", 0))
            reason = line.get("reason", "")
            text = f"{side} {line.get('account_name', '?'):40s} ${amt:>12,.2f}"
            if reason:
                text += f"  — {reason}"
            parts.append(text)
    return "\n".join(parts)


# ═══════════════════════════════════════════════════════════════════════
# Composite — render_full_trace
# Only place that applies formatting (#, ##, <1>, -, indentation)
# ═══════════════════════════════════════════════════════════════════════

def _indent(text: str, level: int) -> str:
    """Indent every non-empty line by level * 4 spaces."""
    prefix = "    " * level
    return "\n".join(prefix + line if line.strip() else "" for line in text.split("\n"))


def render_full_trace(state: dict) -> str:
    """Render complete pipeline reasoning trace from final pipeline state."""
    from services.agent.utils.slots import DEBIT_SLOTS, CREDIT_SLOTS

    dm = state.get("output_decision_maker") or {}
    debit = state.get("output_debit_classifier") or {}
    credit = state.get("output_credit_classifier") or {}
    tax = state.get("output_tax_specialist") or {}
    entry = state.get("output_entry_drafter") or {}

    out = []

    # ── # Decisions ─────────────────────────────────────────────────
    out.append("# Decisions")
    out.append("")

    # ## Ambiguity
    out.append("    ## Ambiguity")
    ambiguities = dm.get("ambiguities", [])
    out.append(_indent(render_ambiguity_summary(ambiguities), 2))
    sorted_ambs = sorted(ambiguities, key=lambda a: (not a.get("ambiguous", False)))
    for i, a in enumerate(sorted_ambs, 1):
        out.append("")
        out.append(f"        <{i}> Ambiguity: {render_ambiguity_aspect(a.get('aspect', '?'))}")
        conv = render_conventional_default(a.get("input_contextualized_conventional_default"))
        ifrs = render_ifrs_default(a.get("input_contextualized_ifrs_default"))
        detail = ""
        if conv and ifrs:
            detail = f"Convention: {conv}; IFRS: {ifrs}"
        elif conv:
            detail = f"Convention: {conv}"
        elif ifrs:
            detail = f"IFRS: {ifrs}"
        if detail:
            out.append(f"            - Details: {detail}")
        if a.get("ambiguous"):
            q = render_clarification_question(a.get("clarification_question"))
            if q:
                out.append(f"            - Question: {q}")
            for case in (a.get("cases") or []):
                label = render_case_label(case.get("case", "?"))
                pe = render_possible_entry(case.get("possible_entry"))
                out.append(f"                If {label}:")
                if pe:
                    out.append(_indent(pe, 5))
        out.append(f"            - Decision: Ambiguity {render_ambiguity_status(a.get('ambiguous', False))}")

    out.append("")

    # ## Complexity
    out.append("    ## Complexity")
    flags = dm.get("complexity_flags", [])
    out.append(_indent(render_complexity_summary(flags), 2))
    sorted_flags = sorted(flags, key=lambda f: (not f.get("beyond_llm_capability", False)))
    for i, f in enumerate(sorted_flags, 1):
        out.append("")
        out.append(f"        <{i}> Complexity: {render_complexity_aspect(f.get('aspect', '?'))}")
        ba = render_best_attempt(f.get("best_attempt"))
        if ba:
            out.append(f"            - Details: Best attempt is")
            out.append(_indent(ba, 4))
        gap = render_gap_description(f.get("gap"))
        if gap:
            out.append(f"            - Gap: {gap}")
        out.append(f"            - Decision: Complexity {render_complexity_status(f.get('beyond_llm_capability', False))}")

    out.append("")

    # ## Proceed
    out.append("    ## Proceed")
    proceed = render_proceed_reason(dm.get("proceed_reason"))
    if proceed:
        out.append(_indent(proceed, 2))
    else:
        out.append("        No proceed reason.")

    out.append("")

    # ## Final Decision
    out.append("    ## Final Decision")
    rationale = render_rationale(dm.get("overall_final_rationale", ""))
    if rationale:
        out.append(_indent(rationale, 2))
    out.append(_indent(f"Decision: {render_decision(dm.get('decision', '?'))}", 2))

    out.append("")
    out.append("")

    # ── # Classification ────────────────────────────────────────────
    out.append("# Classification")
    out.append("")

    # ## Debit Classification
    out.append("    ## Debit Classification")
    for slot in DEBIT_SLOTS:
        for det in debit.get(slot, []):
            out.append(f"        - {render_slot_and_count(slot, det.get('count', 1))}")
            out.append(f"            Taxonomy: {render_taxonomy(det.get('category', '?'))}")
            out.append(f"            Reason: {render_slot_reason(det.get('reason', '?'))}")

    out.append("")
    out.append("")

    # ## Credit Classification
    out.append("    ## Credit Classification")
    for slot in CREDIT_SLOTS:
        for det in credit.get(slot, []):
            out.append(f"        - {render_slot_and_count(slot, det.get('count', 1))}")
            out.append(f"            Taxonomy: {render_taxonomy(det.get('category', '?'))}")
            out.append(f"            Reason: {render_slot_reason(det.get('reason', '?'))}")

    out.append("")
    out.append("")

    # ── # Tax Treatment ─────────────────────────────────────────────
    out.append("# Tax Treatment")
    out.append("")
    out.append(f"    - {render_tax_detection(tax.get('tax_mentioned', False), tax.get('classification', 'out_of_scope'))}")
    ctx = render_tax_context(tax.get("tax_context"))
    if ctx:
        out.append(f"    - {ctx}")
    reasoning = render_tax_reasoning(tax.get("reasoning", ""))
    if reasoning:
        out.append(f"    - {reasoning}")
    out.append(f"    - {render_tax_decision(tax.get('classification', 'out_of_scope'), tax.get('itc_eligible', False), tax.get('amount_tax_inclusive', False), tax.get('tax_rate'))}")

    out.append("")
    out.append("")

    # ── # Journal Entry ─────────────────────────────────────────────
    out.append("# Journal Entry")
    out.append("")
    if entry and entry.get("reason"):
        out.append(f"    - Final rationale: {render_entry_rationale(entry['reason'])}")
        out.append(f"    - Final entry is as follows:")
        out.append("")
        out.append(_indent(render_final_entry(entry), 2))
    else:
        out.append("    No entry produced.")

    return "\n".join(out)
