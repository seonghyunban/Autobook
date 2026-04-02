from pydantic import BaseModel


class LLMInteractionRequest(BaseModel):
    input_text: str


class JournalLineOut(BaseModel):
    account_code: str
    account_name: str
    type: str
    amount: float


class EntryOut(BaseModel):
    description: str
    lines: list[JournalLineOut]


class LLMInteractionResponse(BaseModel):
    input_text: str
    detected_language: str
    english_text: str
    english_entry: EntryOut | None = None
    korean_entry: EntryOut | None = None
