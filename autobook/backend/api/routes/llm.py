import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from auth.deps import AuthContext, get_current_entity, get_current_user
from db.connection import get_db
from db.dao.transactions import TransactionDAO
from schemas.llm import LLMInteractionRequest, LLMInteractionResponse
from services.llm_interaction.service import enqueue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")


@router.post("/llm", response_model=LLMInteractionResponse)
def llm_interaction(
    body: LLMInteractionRequest,
    current_user: AuthContext = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: Session = Depends(get_db),
):
    input_text = body.input_text.strip()
    if not input_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="input_text must not be empty",
        )
    transaction = TransactionDAO.create(
        db,
        entity_id=entity_id,
        submitted_by=current_user.user.id,
        raw_text=input_text,
    )
    db.commit()
    try:
        result = enqueue(
            parse_id=body.parse_id,
            input_text=input_text,
            user_id=str(current_user.user.id),
            entity_id=str(entity_id),
            transaction_id=str(transaction.id),
            live_review=True,
        )
    except Exception:
        logger.exception("LLM interaction enqueue failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="LLM processing failed",
        )
    return LLMInteractionResponse(**result)
