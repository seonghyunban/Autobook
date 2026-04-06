"""Transaction graph schema — output of the normalization agent."""
from typing import Literal

from pydantic import BaseModel, Field


class Node(BaseModel):
    index: int = Field(description="Position in the nodes list, starting from 0")
    name: str = Field(description="Entity name as stated in the text")
    role: Literal["reporting_entity", "counterparty", "indirect_party"]


class Edge(BaseModel):
    source: str = Field(description="Name of the node giving value")
    source_index: int = Field(description="Index of the node giving value")
    target: str = Field(description="Name of the node receiving value")
    target_index: int = Field(description="Index of the node receiving value")
    nature: str = Field(description="Verb phrase from the text describing the transfer")
    amount: float | None = Field(default=None, description="Amount transferred")
    currency: str | None = Field(default=None, description="ISO 4217 currency code")
    kind: Literal["reciprocal_exchange", "chained_exchange", "non_exchange", "relationship"] = Field(
        description="reciprocal_exchange: direct two-party swap with equal value. "
                    "chained_exchange: part of a multi-party value flow where value is conserved. "
                    "non_exchange: one-way transfer with no return expected. "
                    "relationship: no value moved, just a connection."
    )


class TransactionGraph(BaseModel):
    nodes: list[Node]
    edges: list[Edge]


class NormalizationInput(BaseModel):
    text: str
    entity_type: str | None = None
    location: str | None = None
    company_name: str | None = None
