"""Render <tax_jurisdiction> block from jurisdiction tax_rules JSON.

Injected into the tax specialist's user message.
"""
from __future__ import annotations

from typing import Any


def render_tax_jurisdiction(tax_rules: dict[str, Any] | None) -> str:
    """Render tax_rules JSON into a <tax_jurisdiction> prompt block.

    Returns empty string if no tax_rules or no tax_name configured.
    """
    if not tax_rules or not tax_rules.get("tax_name"):
        return ""

    name = tax_rules["tax_name"]
    rate = tax_rules.get("tax_rate", 0)
    rate_pct = int(rate * 100) if rate else 0
    jurisdiction_name = tax_rules.get("jurisdiction_name", "")

    lines = ["<tax_jurisdiction>"]

    if jurisdiction_name:
        lines.append(f"Jurisdiction: {jurisdiction_name}")
    lines.append(f"Tax: {name} {rate_pct}%")

    if tax_rules.get("scope"):
        lines.append(f"\nScope: {tax_rules['scope']}")

    if tax_rules.get("out_of_scope"):
        lines.append("Not in scope: " + ", ".join(tax_rules["out_of_scope"]) + ".")

    if tax_rules.get("exempt"):
        lines.append("\nExempt supplies (no tax, no input credit):")
        for item in tax_rules["exempt"]:
            lines.append(f"- {item}")

    lines.append("\nDefault behavior:")
    tax_short = name.split("(")[0].strip()
    lines.append(
        f"- If the transaction is a supply of goods or services "
        f"and not listed above, apply {rate_pct}% {tax_short}."
    )
    if tax_rules.get("always_split"):
        lines.append("- Always record tax as a separate journal line.")
    accounts = tax_rules.get("accounts", {})
    if accounts.get("receivable"):
        lines.append(f"- Use {accounts['receivable']} for purchases.")
    if accounts.get("payable"):
        lines.append(f"- Use {accounts['payable']} for sales.")
    lines.append("- Never omit tax on a taxable supply.")

    lines.append("</tax_jurisdiction>")
    return "\n".join(lines)
