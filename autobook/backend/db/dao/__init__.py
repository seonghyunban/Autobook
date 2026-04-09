"""Data access objects — dumb CRUD wrappers around SQLAlchemy queries.

DAOs contain NO business logic, NO validation beyond what the DB itself
enforces, and NO cross-table orchestration. Services own all of that.
DAOs just read and write rows.
"""

from db.dao.chart_of_accounts import DEFAULT_COA, ChartOfAccountsDAO
from db.dao.drafted_entries import DraftedEntryDAO
from db.dao.drafted_entry_lines import DraftedEntryLineDAO
from db.dao.drafts import DraftDAO
from db.dao.entities import EntityDAO
from db.dao.entity_memberships import EntityMembershipDAO
from db.dao.posted_entries import PostedEntryDAO
from db.dao.posted_entry_lines import PostedEntryLineDAO
from db.dao.taxonomy import TaxonomyDAO
from db.dao.trace_ambiguities import TraceAmbiguityDAO
from db.dao.trace_ambiguity_cases import TraceAmbiguityCaseDAO
from db.dao.trace_classifications import TraceClassificationDAO
from db.dao.traces import AttemptedTraceDAO, CorrectedTraceDAO, TraceDAO
from db.dao.transaction_graphs import TransactionGraphDAO
from db.dao.transactions import TransactionDAO
from db.dao.users import UserDAO

__all__ = [
    "UserDAO",
    "EntityDAO",
    "EntityMembershipDAO",
    "ChartOfAccountsDAO",
    "DEFAULT_COA",
    "TaxonomyDAO",
    "TransactionDAO",
    "DraftDAO",
    "TransactionGraphDAO",
    "DraftedEntryDAO",
    "DraftedEntryLineDAO",
    "TraceDAO",
    "AttemptedTraceDAO",
    "CorrectedTraceDAO",
    "TraceClassificationDAO",
    "TraceAmbiguityDAO",
    "TraceAmbiguityCaseDAO",
    "PostedEntryDAO",
    "PostedEntryLineDAO",
]
