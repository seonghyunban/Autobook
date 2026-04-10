from pydantic import BaseModel


class LLMInteractionRequest(BaseModel):
    parse_id: str
    input_text: str
    jurisdiction: str | None = None


class LLMInteractionResponse(BaseModel):
    parse_id: str
