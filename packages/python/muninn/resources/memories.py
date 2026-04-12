"""Memories resource for the Muninn SDK."""

from typing import Any, Optional
import urllib.parse

from muninn.types import Memory, SearchResult, MemoryType, Visibility
from muninn.exceptions import (
    MuninnError,
    MuninnAuthError,
    MuninnRateLimitError,
    MuninnNotFoundError,
    MuninnServerError,
    MuninnValidationError,
)


class MemoriesResource:
    """
    Resource for interacting with memory endpoints.

    Provides methods to store, search, retrieve, and delete memories.
    """

    def __init__(self, client: "MuninnClient") -> None:
        """
        Initialize the memories resource.

        Args:
            client: The MuninnClient instance
        """
        self._client = client

    def store(
        self,
        content: str,
        type: MemoryType = MemoryType.SEMANTIC,
        metadata: Optional[dict[str, Any]] = None,
        entities: Optional[list[str]] = None,
        salience: float = 0.5,
        visibility: Visibility = Visibility.ORGANIZATION,
        source_type: str = "user_input",
    ) -> Memory:
        """
        Store a new memory in Muninn.

        Args:
            content: The content of the memory (required)
            type: Type of memory - semantic, episodic, or procedural (default: semantic)
            metadata: Additional metadata to store with the memory
            entities: List of entity identifiers associated with this memory
            salience: Importance/relevance score from 0.0 to 1.0 (default: 0.5)
            visibility: Visibility level - organization, private, or shared (default: organization)
            source_type: Source of the memory (default: user_input)

        Returns:
            Memory: The created memory object

        Raises:
            MuninnValidationError: If content is empty or parameters are invalid
            MuninnAuthError: If authentication fails
            MuninnServerError: If the API returns an error

        Example:
            >>> memory = client.memories.store(
            ...     content="User prefers dark mode",
            ...     type="preference",
            ...     entities=["user_123"],
            ...     metadata={"category": "ui"}
            ... )
            >>> print(memory.id)
            m_xxx
        """
        if not content or not content.strip():
            raise MuninnValidationError("Content cannot be empty")

        if salience < 0.0 or salience > 1.0:
            raise MuninnValidationError("Salience must be between 0.0 and 1.0")

        payload: dict[str, Any] = {
            "content": content,
            "type": type.value if isinstance(type, MemoryType) else type,
            "metadata": metadata or {},
            "entities": entities or [],
            "salience": salience,
            "visibility": visibility.value if isinstance(visibility, Visibility) else visibility,
            "source_type": source_type,
        }

        response = self._client._request("POST", "/memories", json=payload)
        return Memory.from_dict(response)

    def search(
        self,
        query: str,
        limit: int = 10,
        type: Optional[MemoryType] = None,
        threshold: float = 0.3,
    ) -> SearchResult:
        """
        Search for memories using semantic or keyword search.

        Args:
            query: The search query string (required)
            limit: Maximum number of results to return (default: 10)
            type: Optional memory type filter (semantic, episodic, procedural)
            threshold: Similarity threshold for semantic search (default: 0.3)

        Returns:
            SearchResult: Object containing matching memories and metadata

        Raises:
            MuninnValidationError: If query is empty
            MuninnAuthError: If authentication fails
            MuninnServerError: If the API returns an error

        Example:
            >>> results = client.memories.search("user preferences", limit=10)
            >>> for memory in results.results:
            ...     print(memory.content)
        """
        if not query or not query.strip():
            raise MuninnValidationError("Query cannot be empty")

        if limit < 1 or limit > 100:
            raise MuninnValidationError("Limit must be between 1 and 100")

        params: dict[str, Any] = {
            "q": query,
            "limit": str(limit),
            "threshold": str(threshold),
        }

        if type:
            params["type"] = type.value if isinstance(type, MemoryType) else type

        response = self._client._request("GET", "/memories", params=params)
        return SearchResult.from_dict(response)

    def get(self, memory_id: str) -> Memory:
        """
        Retrieve a single memory by ID.

        Args:
            memory_id: The unique identifier of the memory (required)

        Returns:
            Memory: The requested memory object

        Raises:
            MuninnValidationError: If memory_id is empty
            MuninnNotFoundError: If the memory doesn't exist
            MuninnAuthError: If authentication fails
            MuninnServerError: If the API returns an error

        Example:
            >>> memory = client.memories.get("m_xxx")
            >>> print(memory.content)
        """
        if not memory_id:
            raise MuninnValidationError("Memory ID cannot be empty")

        # Validate ID format
        if not memory_id.startswith("m_"):
            raise MuninnValidationError("Invalid memory ID format")

        try:
            response = self._client._request("GET", f"/memories/{memory_id}")
            return Memory.from_dict(response)
        except MuninnError as e:
            if e.status_code == 404:
                raise MuninnNotFoundError(f"Memory not found: {memory_id}")
            raise

    def delete(self, memory_id: str) -> bool:
        """
        Delete a memory by ID.

        Args:
            memory_id: The unique identifier of the memory to delete (required)

        Returns:
            bool: True if deletion was successful

        Raises:
            MuninnValidationError: If memory_id is empty
            MuninnNotFoundError: If the memory doesn't exist
            MuninnAuthError: If authentication fails
            MuninnServerError: If the API returns an error

        Example:
            >>> client.memories.delete("m_xxx")
            True
        """
        if not memory_id:
            raise MuninnValidationError("Memory ID cannot be empty")

        if not memory_id.startswith("m_"):
            raise MuninnValidationError("Invalid memory ID format")

        try:
            response = self._client._request("DELETE", f"/memories/{memory_id}")
            return response.get("deleted", False)
        except MuninnError as e:
            if e.status_code == 404:
                raise MuninnNotFoundError(f"Memory not found: {memory_id}")
            raise