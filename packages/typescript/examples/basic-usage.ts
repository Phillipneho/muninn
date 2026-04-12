/**
 * Example usage of the Muninn SDK.
 *
 * This file demonstrates various features of the Muninn TypeScript SDK.
 * Run with: npx tsx examples/basic-usage.ts
 */

import { MuninnClient, MuninnError } from '../src';
import type { MemoryType } from '../src';

async function main() {
  // Initialize the client with your API key
  // Get your API key from: https://muninn-supabase.vercel.app
  const API_KEY = 'muninn_live_your_key_here';

  // Create client
  const client = new MuninnClient({ apiKey: API_KEY });

  try {
    // ========================================
    // Example 1: Store a memory
    // ========================================
    console.log('='.repeat(50));
    console.log('Example 1: Storing a memory');
    console.log('='.repeat(50));

    const memory = await client.memories.store({
      content: 'User prefers dark mode in the application settings',
      type: 'semantic' as MemoryType,
      entities: ['user_123'],
      metadata: { category: 'ui_preference', source: 'settings_page' },
    });

    console.log(`✓ Stored memory with ID: ${memory.id}`);
    console.log(`  Content: ${memory.content}`);
    console.log(`  Type: ${memory.type}`);
    console.log(`  Embedding generated: ${memory.embedding_generated}`);
    console.log();

    // Store another memory
    const memory2 = await client.memories.store({
      content: 'User frequently asks about pricing plans',
      type: 'episodic' as MemoryType,
      entities: ['user_123', 'pricing'],
      metadata: { frequency: 'high' },
    });

    console.log(`✓ Stored another memory with ID: ${memory2.id}`);
    console.log();

    // ========================================
    // Example 2: Search memories
    // ========================================
    console.log('='.repeat(50));
    console.log('Example 2: Searching memories');
    console.log('='.repeat(50));

    const results = await client.memories.search({
      query: 'user interface preferences',
      limit: 10,
      threshold: 0.3,
    });

    console.log(`Found ${results.count} results (search type: ${results.search_type})`);
    for (const mem of results.results) {
      console.log(`  - [${mem.type}] ${mem.content.slice(0, 50)}...`);
    }
    console.log();

    // ========================================
    // Example 3: Get single memory
    // ========================================
    console.log('='.repeat(50));
    console.log('Example 3: Getting a single memory');
    console.log('='.repeat(50));

    const fetched = await client.memories.get(memory.id);
    console.log(`✓ Fetched memory: ${fetched.id}`);
    console.log(`  Content: ${fetched.content}`);
    console.log(`  Metadata: ${JSON.stringify(fetched.metadata)}`);
    console.log(`  Created: ${fetched.created_at}`);
    console.log();

    // ========================================
    // Example 4: Filter by type
    // ========================================
    console.log('='.repeat(50));
    console.log('Example 4: Filtering by memory type');
    console.log('='.repeat(50));

    const episodicResults = await client.memories.search({
      query: 'user interaction',
      type: 'episodic',
      limit: 5,
    });

    console.log(`Found ${episodicResults.count} episodic memories`);
    console.log();

    // ========================================
    // Example 5: Delete a memory
    // ========================================
    console.log('='.repeat(50));
    console.log('Example 5: Deleting a memory');
    console.log('='.repeat(50));

    const deleted = await client.memories.delete(memory2.id);
    console.log(`✓ Deleted memory ${memory2.id}: ${deleted}`);
    console.log();

    // ========================================
    // Example 6: Health check
    // ========================================
    console.log('='.repeat(50));
    console.log('Example 6: Health check');
    console.log('='.repeat(50));

    const health = await client.health();
    console.log(`Status: ${health.status}`);
    console.log(`Service: ${health.service}`);
    console.log(`Version: ${health.version}`);
    console.log();

    console.log('✓ All examples completed successfully!');
  } catch (error) {
    if (error instanceof MuninnError) {
      console.error(`Muninn Error [${error.statusCode}]: ${error.message}`);
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

main();