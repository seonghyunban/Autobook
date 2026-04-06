from pydantic import BaseModel


class LLMInteractionRequest(BaseModel):
    parse_id: str
    input_text: str


class LLMInteractionResponse(BaseModel):
    parse_id: str
