"""Generic prompt content helpers.

Used by all agent build_prompt functions to append fix context and RAG
examples to the message content list.
"""


def append_fix_context(content: list, fix_context: str | None) -> None:
    """Append fix context block if present (rerun guidance from diagnostician)."""
    if fix_context:
        content.append({"text": f"<fix_context>{fix_context}</fix_context>"})


def append_rag_examples(content: list, rag_examples: list[dict],
                        label: str, fields: list[str]) -> None:
    """Append RAG examples block if present.

    Args:
        content: Message content list to append to.
        rag_examples: List of example dicts from RAG retrieval.
        label: Description of what these examples are, e.g.
               "similar past transactions with correct debit tuples".
        fields: Keys to extract from each example dict, e.g.
                ["transaction", "debit_tuple"].
    """
    if not rag_examples:
        return

    text = f"These are {label}:\n<examples>\n"
    for ex in rag_examples:
        for field in fields:
            val = ex.get(field, "")
            text += f"  {field}: {val}\n"
        text += "\n"
    text += "</examples>"
    content.append({"text": text})
