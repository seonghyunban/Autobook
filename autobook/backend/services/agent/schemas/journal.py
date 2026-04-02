"""Shared journal entry schema — used by entry drafter and decision maker v4."""
from typing import Literal

from pydantic import BaseModel, Field


class JournalLine(BaseModel):
    type: Literal["debit", "credit"] = Field(description="Debit or credit")
    account_name: str = Field(description="Account name from business purpose and transaction context")
    amount: float = Field(description="Dollar amount for this line")
