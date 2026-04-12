"""Organizations resource for the Muninn SDK."""

from typing import Optional

from muninn.types import Organization
from muninn.exceptions import (
    MuninnError,
    MuninnValidationError,
    MuninnServerError,
)


class OrganizationsResource:
    """
    Resource for interacting with organization endpoints.

    Provides methods to create and manage organizations.
    Note: Organization creation does not require authentication.
    """

    def __init__(self, client: "MuninnClient") -> None:
        """
        Initialize the organizations resource.

        Args:
            client: The MuninnClient instance
        """
        self._client = client

    def create(
        self,
        name: str,
        email: str,
        tier: str = "free",
    ) -> Organization:
        """
        Create a new organization and generate an API key.

        Note: This is the only endpoint that doesn't require authentication.
        The returned API key should be stored securely - it won't be shown again.

        Args:
            name: Name of the organization (required)
            email: Contact email for the organization (required)
            tier: Subscription tier - free, pro, or enterprise (default: free)

        Returns:
            Organization: The created organization with API key

        Raises:
            MuninnValidationError: If name or email is empty/invalid
            MuninnServerError: If the API returns an error

        Example:
            >>> org = client.organizations.create(
            ...     name="Acme Corp",
            ...     email="user@acme.com"
            ... )
            >>> print(org.api_key)
            muninn_live_xxx...
            >>> print(org.id)
            org_xxx
        """
        if not name or not name.strip():
            raise MuninnValidationError("Organization name cannot be empty")

        if not email or not email.strip():
            raise MuninnValidationError("Organization email cannot be empty")

        # Basic email validation
        if "@" not in email or "." not in email.split("@")[1]:
            raise MuninnValidationError("Invalid email format")

        if tier not in ("free", "pro", "enterprise"):
            raise MuninnValidationError("Tier must be: free, pro, or enterprise")

        payload = {
            "name": name,
            "email": email,
            "tier": tier,
        }

        response = self._client._request(
            "POST",
            "/organizations",
            json=payload,
            requires_auth=False,
        )

        org_data = response.get("organization", {})
        org_data["api_key"] = response.get("api_key")

        return Organization.from_dict(org_data)