from pydantic import BaseModel


class TaxonomyResponse(BaseModel):
    """Global IFRS taxonomy grouped by account_type.

    The taxonomy table is seeded by init.sql and is read-only at runtime —
    there is no POST /taxonomy endpoint after the refactor. The create /
    update shapes that previously existed (TaxonomyCreateRequest /
    TaxonomyCreateResponse) were removed along with the per-user custom
    taxonomy feature.
    """

    taxonomy: dict[str, list[str]]
