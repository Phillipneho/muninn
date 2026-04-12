"""Tests for the Muninn SDK client initialization."""

import pytest

from muninn import MuninnClient
from muninn.exceptions import MuninnValidationError


class TestClientInitialization:
    """Test client initialization."""

    def test_init_with_api_key(self):
        """Test initialization with API key."""
        client = MuninnClient(api_key="muninn_live_abc123")
        assert client.api_key == "muninn_live_abc123"
        assert client.supabase_jwt is None
        client.close()

    def test_init_with_jwt(self):
        """Test initialization with JWT."""
        client = MuninnClient(supabase_jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test")
        assert client.api_key is None
        assert client.supabase_jwt == "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test"
        client.close()

    def test_init_without_credentials(self):
        """Test that initialization fails without credentials."""
        with pytest.raises(MuninnValidationError) as exc_info:
            MuninnClient()
        assert "Either api_key or supabase_jwt" in str(exc_info.value)

    def test_init_with_both_credentials(self):
        """Test that providing both credentials fails."""
        with pytest.raises(MuninnValidationError) as exc_info:
            MuninnClient(
                api_key="muninn_live_abc",
                supabase_jwt="eyJabc"
            )
        assert "Cannot provide both" in str(exc_info.value)

    def test_invalid_api_key_format(self):
        """Test that invalid API key format raises error."""
        with pytest.raises(MuninnValidationError) as exc_info:
            MuninnClient(api_key="invalid_key")
        assert "must start with 'muninn_live_'" in str(exc_info.value)

    def test_invalid_jwt_format(self):
        """Test that invalid JWT format raises error."""
        with pytest.raises(MuninnValidationError) as exc_info:
            MuninnClient(supabase_jwt="invalid_jwt")
        assert "must start with 'eyJ'" in str(exc_info.value)

    def test_custom_base_url(self):
        """Test custom base URL."""
        client = MuninnClient(
            api_key="muninn_live_abc",
            base_url="https://custom-api.example.com"
        )
        assert client.base_url == "https://custom-api.example.com"
        client.close()

    def test_default_base_url(self):
        """Test default base URL."""
        client = MuninnClient(api_key="muninn_live_abc")
        assert client.base_url == "https://muninn-supabase.vercel.app"
        client.close()

    def test_custom_timeout(self):
        """Test custom timeout."""
        client = MuninnClient(api_key="muninn_live_abc", timeout=60.0)
        assert client.timeout == 60.0
        client.close()

    def test_context_manager(self):
        """Test using client as context manager."""
        with MuninnClient(api_key="muninn_live_abc") as client:
            assert client.api_key == "muninn_live_abc"
        # Client should be closed after exiting context