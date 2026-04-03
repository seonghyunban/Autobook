from pydantic import BaseModel


class LLMInteractionRequest(BaseModel):
    input_text: str


class LLMInteractionResponse(BaseModel):
    parse_id: str
    detected_language: str
    english_text: str
