"""Worker-side user resolution.

Workers pull messages off SQS. Each message carries `user_id`, the
authenticated user's Cognito `sub`, populated by the API layer at enqueue
time from the validated JWT. Workers look that up in the `users` table
via `UserDAO.get_by_cognito_sub` — fail loud if missing so the message
retries / dead-letters instead of silently creating a ghost user.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from db.dao.users import UserDAO
from db.models.user import User


def resolve_user_from_message(db: Session, message: dict) -> User:
    """Look up the user by the cognito_sub carried in `message["user_id"]`.

    Raises:
        ValueError: if `user_id` is missing from the message, or if no user
        with that cognito_sub exists in the database.
    """
    cognito_sub = message.get("user_id")
    if not cognito_sub:
        raise ValueError("Worker message missing required field 'user_id'.")
    user = UserDAO.get_by_cognito_sub(db, cognito_sub)
    if user is None:
        raise ValueError(f"No user found for cognito_sub={cognito_sub!r}.")
    return user
