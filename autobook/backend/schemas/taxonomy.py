from pydantic import BaseModel, field_validator


VALID_ACCOUNT_TYPES = ("asset", "liability", "equity", "revenue", "expense")


class TaxonomyResponse(BaseModel):
    taxonomy: dict[str, list[str]]


class TaxonomyCreateRequest(BaseModel):
    name: str
    account_type: str

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v: str) -> str:
        if v not in VALID_ACCOUNT_TYPES:
            raise ValueError(f"account_type must be one of {VALID_ACCOUNT_TYPES}")
        return v


class TaxonomyCreateResponse(BaseModel):
    id: str
    name: str
    account_type: str
    is_default: bool
