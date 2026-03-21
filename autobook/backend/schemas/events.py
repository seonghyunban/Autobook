from pydantic import BaseModel


class RealtimeEvent(BaseModel):
    type: str  # "entry.posted", "clarification.created", "clarification.resolved"
    journal_entry_id: str | None = None
    parse_id: str | None = None
    occurred_at: str
