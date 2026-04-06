"""Shared journal entry schemas — used by entry drafter and decision maker."""
from typing import Literal

from pydantic import BaseModel, Field


class JournalLine(BaseModel):
    type: Literal["debit", "credit"] = Field(description="Debit or credit")
    account_name: str = Field(description="Account name from business purpose and transaction context")
    amount: float = Field(description="Amount for this line")
    reason: str = Field(description="One sentence: why this specific account and amount")


class JournalEntry(BaseModel):
    reason: str = Field(description="One sentence: why these accounts and amounts")
    currency: str = Field(description="ISO 4217 currency code (e.g. CAD, KRW, USD)")
    lines: list[JournalLine] = Field(description="Journal entry lines. Total debits must equal total credits.")
