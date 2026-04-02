import logging

from fastapi import APIRouter, Depends, HTTPException, status

from auth.deps import AuthContext, get_current_user
from schemas.llm import LLMInteractionRequest, LLMInteractionResponse
from services.llm_interaction.service import execute

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")


@router.post("/llm", response_model=LLMInteractionResponse)
def llm_interaction(
    body: LLMInteractionRequest,
    current_user: AuthContext = Depends(get_current_user),
):
    if not body.input_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="input_text must not be empty",
        )
    try:
        result = execute(body.input_text.strip())
    except Exception:
        logger.exception("LLM interaction failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM processing failed",
        )
    return LLMInteractionResponse(**result)
