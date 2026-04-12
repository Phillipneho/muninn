"""
Example: Creating an organization with the Muninn SDK.

This demonstrates how to create a new organization and get an API key.
Note: Organization creation doesn't require authentication.
"""

from muninn import MuninnClient
from muninn.exceptions import MuninnValidationError


def main():
    # To create an organization, we need to provide any valid-looking 
    # credentials (they're ignored for this endpoint)
    # In practice, you'd use the SDK without a valid key just for org creation
    
    # Create a minimal client (the org creation endpoint doesn't validate auth)
    client = MuninnClient(api_key="muninn_placeholder")

    print("=" * 50)
    print("Creating a new organization")
    print("=" * 50)

    try:
        org = client.organizations.create(
            name="My SaaS Company",
            email="admin@mysaas.com",
            tier="free",  # free, pro, or enterprise
        )

        print(f"✓ Organization created!")
        print(f"  Organization ID: {org.id}")
        print(f"  Name: {org.name}")
        print(f"  Tier: {org.tier}")
        print()
        print(f"  >>> API KEY: {org.api_key} <<<")
        print()
        print("  ⚠️  IMPORTANT: Store this API key securely!")
        print("      It will not be shown again.")

    except MuninnValidationError as e:
        print(f"Validation error: {e}")
    except Exception as e:
        print(f"Error: {e}")

    client.close()


if __name__ == "__main__":
    main()