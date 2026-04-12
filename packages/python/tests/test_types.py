"""Tests for Muninn types."""

import pytest

from muninn.types import Memory, Organization, SearchResult, MemoryType, Visibility
from muninn.exceptions import (
    MuninnError,
    MuninnAuthError,
    MuninnRateLimitError,
    MuninnNotFoundError,
    MuninnServerError,
)


class TestMemoryType:
    """Test MemoryType enum."""

    def test_memory_type_values(self):
        """Test MemoryType has correct values."""
        assert MemoryType.SEMANTIC.value == "semantic"
        assert MemoryType.EPISODIC.value == "episodic"
        assert MemoryType.PROCEDURAL.value == "procedural"


class TestVisibility:
    """Test Visibility enum."""

    def test_visibility_values(self):
        """Test Visibility has correct values."""
        assert Visibility.ORGANIZATION.value == "organization"
        assert Visibility.PRIVATE.value == "private"
        assert Visibility.SHARED.value == "shared"


class TestMemory:
    """Test Memory dataclass."""

    def test_memory_from_dict(self):
        """Test creating Memory from dictionary."""
        data = {
            "id": "m_123",
            "content": "Test content",
            "type": "semantic",
            "metadata": {"key": "value"},
            "entities": ["entity1", "entity2"],
            "salience": 0.8,
            "visibility": "organization",
            "created_at": "2024-01-01T00:00:00Z",
            "embedding_generated": True,
        }

        memory = Memory.from_dict(data)

        assert memory.id == "m_123"
        assert memory.content == "Test content"
        assert memory.type == MemoryType.SEMANTIC
        assert memory.metadata == {"key": "value"}
        assert memory.entities == ["entity1", "entity2"]
        assert memory.salience == 0.8
        assert memory.visibility == Visibility.ORGANIZATION
        assert memory.created_at == "2024-01-01T00:00:00Z"
        assert memory.embedding_generated is True

    def test_memory_default_values(self):
        """Test Memory has correct defaults."""
        memory = Memory(id="m_123", content="Test")

        assert memory.type == MemoryType.SEMANTIC
        assert memory.metadata == {}
        assert memory.entities == []
        assert memory.salience == 0.5
        assert memory.visibility == Visibility.ORGANIZATION
        assert memory.created_at is None
        assert memory.embedding_generated is False


class TestOrganization:
    """Test Organization dataclass."""

    def test_organization_from_dict(self):
        """Test creating Organization from dictionary."""
        data = {
            "id": "org_123",
            "name": "Test Org",
            "tier": "pro",
            "created_at": "2024-01-01T00:00:00Z",
            "api_key": "muninn_live_xxx",
        }

        org = Organization.from_dict(data)

        assert org.id == "org_123"
        assert org.name == "Test Org"
        assert org.tier == "pro"
        assert org.created_at == "2024-01-01T00:00:00Z"
        assert org.api_key == "muninn_live_xxx"


class TestSearchResult:
    """Test SearchResult dataclass."""

    def test_search_result_from_dict(self):
        """Test creating SearchResult from dictionary."""
        data = {
            "results": [
                {"id": "m_1", "content": "Result 1", "type": "semantic"},
                {"id": "m_2", "content": "Result 2", "type": "episodic"},
            ],
            "count": 2,
            "query": "test query",
            "search_type": "semantic",
        }

        result = SearchResult.from_dict(data)

        assert result.count == 2
        assert result.query == "test query"
        assert result.search_type == "semantic"
        assert len(result.results) == 2


class TestExceptions:
    """Test exception classes."""

    def test_muninn_error(self):
        """Test MuninnError base exception."""
        error = MuninnError("Test error", 500)
        assert error.message == "Test error"
        assert error.status_code == 500
        assert str(error) == "Test error"

    def test_muninn_auth_error(self):
        """Test MuninnAuthError."""
        error = MuninnAuthError()
        assert error.status_code == 401
        assert "API key" in str(error)

    def test_muninn_rate_limit_error(self):
        """Test MuninnRateLimitError."""
        error = MuninnRateLimitError()
        assert error.status_code == 429
        assert "limit" in str(error).lower()

    def test_muninn_not_found_error(self):
        """Test MuninnNotFoundError."""
        error = MuninnNotFoundError()
        assert error.status_code == 404

    def test_muninn_server_error(self):
        """Test MuninnServerError."""
        error = MuninnServerError()
        assert error.status_code == 500