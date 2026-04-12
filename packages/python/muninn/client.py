"""
Main client module for the Muninn SDK.

Provides the MuninnClient class for interacting with
the Muninn memory API.
"""

import httpx
from typing import Optional, List, Dict, Any


class MuninnClient:
    """
    Client for the Muninn memory API.

    Usage:
        >>> from muninn import MuninnClient
        >>> client = MuninnClient(api_key="muninn_xxx")
        >>> client.store("Remember that James works at TechCorp")
        >>> results = client.search("James workplace")
    """

    DEFAULT_BASE_URL = "https://api.muninn.au"

    def __init__(
        self,
        api_key: str,
        organization_id: str = "default",
        base_url: Optional[str] = None,
        timeout: float = 30.0
    ):
        """
        Initialize the Muninn client.

        Args:
            api_key: Your Muninn API key
            organization_id: Organization ID for multi-tenant isolation
            base_url: Base URL for the Muninn API (default: https://api.muninn.au)
            timeout: Request timeout in seconds
        """
        self.api_key = api_key
        self.organization_id = organization_id
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self.timeout = timeout

        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={
                "Authorization": f"Bearer {api_key}",
                "X-Organization-ID": organization_id,
                "Content-Type": "application/json"
            }
        )

    def store(
        self,
        content: str,
        memory_type: str = "semantic",
        metadata: Optional[Dict[str, Any]] = None,
        entities: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Store a memory in Muninn.

        Args:
            content: The content to store
            memory_type: Type of memory (semantic, episodic, procedural)
            metadata: Optional metadata dictionary
            entities: Optional list of entity names

        Returns:
            The created memory object
        """
        payload = {
            "content": content,
            "type": memory_type,
            "metadata": metadata or {}
        }
        if entities:
            payload["entities"] = entities

        response = self._client.post("/api/memories", json=payload)
        response.raise_for_status()
        return response.json()

    def search(
        self,
        query: str,
        limit: int = 10,
        search_type: str = "hybrid"
    ) -> List[Dict[str, Any]]:
        """
        Search memories in Muninn.

        Args:
            query: The search query
            limit: Maximum number of results
            search_type: Search type (keyword, hybrid)

        Returns:
            List of matching memories
        """
        response = self._client.get("/api/memories", params={
            "q": query,
            "limit": limit,
            "search_type": search_type
        })
        response.raise_for_status()
        return response.json().get("memories", [])

    def list(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        List all memories.

        Args:
            limit: Maximum number of memories to return

        Returns:
            List of memories
        """
        response = self._client.get("/api/memories", params={"limit": limit})
        response.raise_for_status()
        return response.json().get("memories", [])

    def delete(self, memory_id: str) -> None:
        """
        Delete a memory by ID.

        Args:
            memory_id: The ID of the memory to delete
        """
        response = self._client.delete(f"/api/memories/{memory_id}")
        response.raise_for_status()

    def get_entity_facts(self, entity_name: str) -> List[Dict[str, Any]]:
        """
        Get all facts about an entity.

        Args:
            entity_name: Name of the entity

        Returns:
            List of facts about the entity
        """
        response = self._client.get(f"/api/entities/{entity_name}/facts")
        response.raise_for_status()
        return response.json().get("facts", [])

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self) -> "MuninnClient":
        return self

    def __exit__(self, *args) -> None:
        self.close()