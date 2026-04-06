"""Extractors — convert raw input to text for the normalization agent.

Routes based on source type. Text input passes through as-is.
"""


def extract(message: dict) -> str:
    """Extract text from the message based on source type.

    Args:
        message: Queue message with input_text/description and source.

    Returns:
        Plain text for the normalization agent.
    """
    source = message.get("source", "manual_text")

    if source == "csv_upload":
        from services.normalization.extractors.csv import extract_csv
        return extract_csv(message)

    if source == "pdf_upload":
        from services.normalization.extractors.pdf import extract_pdf
        return extract_pdf(message)

    if source == "image":
        from services.normalization.extractors.image import extract_image
        return extract_image(message)

    if source == "bank_feed":
        from services.normalization.extractors.bank_feed import extract_bank_feed
        return extract_bank_feed(message)

    # Default: manual_text — pass through
    return message.get("input_text") or message.get("description") or ""
