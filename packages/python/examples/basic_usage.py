"""
Example usage of the Muninn SDK.

This file demonstrates various features of the Muninn Python SDK.
Run with: python examples/basic_usage.py
"""

from muninn import MuninnClient
from muninn.exceptions import MuninnError
from muninn.types import MemoryType, Visibility


def main():
    # Initialize the client with your API key
    # Get your API key from: https://muninn-supabase.vercel.app
    API_KEY = "muninn_live_your_key_here"

    # Create client
    client = MuninnClient(api_key=API_KEY)

    # ========================================
    # Example 1: Store a memory
    # ========================================
    print("=" * 50)
    print("Example 1: Storing a memory")
    print("=" * 50)

    memory = client.memories.store(
        content="User prefers dark mode in the application settings",
        type=MemoryType.SEMANTIC,
        entities=["user_123"],
        metadata={"category": "ui_preference", "source": "settings_page"},
    )

    print(f"✓ Stored memory with ID: {memory.id}")
    print(f"  Content: {memory.content}")
    print(f"  Type: {memory.type}")
    print(f"  Embedding generated: {memory.embedding_generated}")
    print()

    # Store another memory
    memory2 = client.memories.store(
        content="User frequently asks about pricing plans",
        type=MemoryType.EPISODIC,
        entities=["user_123", "pricing"],
        metadata={"frequency": "high"},
    )

    print(f"✓ Stored another memory with ID: {memory2.id}")
    print()

    # ========================================
    # Example 2: Search memories
    # ========================================
    print("=" * 50)
    print("Example 2: Searching memories")
    print("=" * 50)

    results = client.memories.search(
        query="user interface preferences",
        limit=10,
        threshold=0.3,
    )

    print(f"Found {results.count} results (search type: {results.search_type})")
    for mem in results.results:
        print(f"  - [{mem.type.value}] {mem.content[:50]}...")
    print()

    # ========================================
    # Example 3: Get single memory
    # ========================================
    print("=" * 50)
    print("Example 3: Getting a single memory")
    print("=" * 50)

    fetched = client.memories.get(memory.id)
    print(f"✓ Fetched memory: {fetched.id}")
    print(f"  Content: {fetched.content}")
    print(f"  Metadata: {fetched.metadata}")
    print(f"  Created: {fetched.created_at}")
    print()

    # ========================================
    # Example 4: Filter by type
    # ========================================
    print("=" * 50)
    print("Example 4: Filtering by memory type")
    print("=" * 50)

    episodic_results = client.memories.search(
        query="user interaction",
        type=MemoryType.EPISODIC,
        limit=5,
    )

    print(f"Found {episodic_results.count} episodic memories")
    print()

    # ========================================
    # Example 5: Delete a memory
    # ========================================
    print("=" * 50)
    print("Example 5: Deleting a memory")
    print("=" * 50)

    deleted = client.memories.delete(memory2.id)
    print(f"✓ Deleted memory {memory2.id}: {deleted}")
    print()

    # ========================================
    # Example 6: Health check
    # ========================================
    print("=" * 50)
    print("Example 6: Health check")
    print("=" * 50)

    health = client.health()
    print(f"Status: {health.get('status')}")
    print(f"Service: {health.get('service')}")
    print(f"Version: {health.get('version')}")
    print()

    # Clean up
    client.close()
    print("✓ All examples completed successfully!")


if __name__ == "__main__":
    main()