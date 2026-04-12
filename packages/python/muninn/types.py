"""Type definitions for the Muninn SDK."""

from enum import Enum
from typing import Any, Literal, Optional
from dataclasses import dataclass, field


class MemoryType(str, Enum):
    """Types of memories that can be stored."""

    SEMANTIC = "semantic"
    EPISODIC = "episodic"
    PROCEDURAL = "procedural"


class Visibility(str, Enum):
    """Visibility level for memories."""

    ORGANIZATION = "organization"
    PRIVATE = "private"
    SHARED = "shared"


@dataclass
class Memory:
    """
    Represents a stored memory in Muninn.

    Attributes:
        id: Unique identifier for the memory
        content: The actual content of the memory
        type: Type of memory (semantic, episodic, procedural)
        metadata: Additional metadata stored with the memory
        entities: List of entity identifiers associated with this memory
        salience: Importance/relevance score (0.0 to 1.0)
        visibility: Visibility level (organization, private, shared)
        created_at: Timestamp when the memory was created
        embedding_generated: Whether an embedding was successfully generated
    """

    id: str
    content: str
    type: MemoryType = MemoryType.SEMANTIC
    metadata: dict[str, Any] = field(default_factory=dict)
    entities: list[str] = field(default_factory=list)
    salience: float = 0.5
    visibility: Visibility = Visibility.ORGANIZATION
    created_at: Optional[str] = None
    embedding_generated: bool = False

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Memory":
        """Create a Memory from an API response dictionary."""
        return cls(
            id=data.get("id", ""),
            content=data.get("content", ""),
            type=MemoryType(data.get("type", "semantic")),
            metadata=data.get("metadata", {}),
            entities=data.get("entities", []),
            salience=data.get("salience", 0.5),
            visibility=Visibility(data.get("visibility", "organization")),
            created_at=data.get("created_at"),
            embedding_generated=data.get("embedding_generated", False),
        )


@dataclass
class Organization:
    """
    Represents an organization in Muninn.

    Attributes:
        id: Unique identifier for the organization
        name: Name of the organization
        tier: Subscription tier (free, pro, enterprise)
        created_at: Timestamp when the organization was created
    """

    id: str
    name: str
    tier: Literal["free", "pro", "enterprise"] = "free"
    created_at: Optional[str] = None
    api_key: Optional[str] = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Organization":
        """Create an Organization from an API response dictionary."""
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            tier=data.get("tier", "free"),
            created_at=data.get("created_at"),
            api_key=data.get("api_key"),
        )


@dataclass
class SearchResult:
    """
    Represents a search result from memory query.

    Attributes:
        results: List of memories matching the query
        count: Total number of results
        query: The original search query
        search_type: Type of search performed (semantic or keyword)
    """

    results: list[Memory]
    count: int
    query: str
    search_type: Literal["semantic", "keyword"]

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SearchResult":
        """Create a SearchResult from an API response dictionary."""
        return cls(
            results=[Memory.from_dict(r) for r in data.get("results", [])],
            count=data.get("count", 0),
            query=data.get("query", ""),
            search_type=data.get("search_type", "keyword"),
        )