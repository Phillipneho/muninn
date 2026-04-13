# Muninn SDK

TypeScript SDK for **Muninn** — Agent memory system with **99.1% LOCOMO accuracy**.

## Installation

```bash
npm install muninn-sdk
```

## Quick Start

```typescript
import { MuninnClient } from "muninn-sdk";

const client = new MuninnClient({
  apiKey: "muninn_xxx"  // Get from https://muninn.au/dashboard
});

// Store a memory
await client.store("James works at TechCorp as a Senior Engineer");

// Search memories
const results = await client.search("James workplace");
console.log(results);
// [{ id: "...", content: "James works at TechCorp...", score: 0.95 }]
```

## API

### `store(content, options?)`

Store a memory in Muninn.

```typescript
await client.store("Content to remember", {
  type: "semantic",      // semantic, episodic, procedural
  metadata: { source: "conversation" }
});
```

### `search(query, options?)`

Search memories using hybrid search (keyword + semantic).

```typescript
const results = await client.search("James workplace", {
  limit: 10,
  searchType: "hybrid"   // keyword, hybrid
});
```

### `list(options?)`

List all memories.

```typescript
const memories = await client.list({ limit: 50 });
```

### `delete(memoryId)`

Delete a memory by ID.

```typescript
await client.delete("memory_id_here");
```

## Integration Examples

### LangChain

```typescript
import { MuninnClient } from "muninn-sdk";

const memory = new MuninnClient({ apiKey: "muninn_xxx" });

// Store conversation
await memory.store("User prefers React over Vue", {
  type: "semantic",
  metadata: { role: "preference", confidence: 0.9 }
});

// In your agent
const context = await memory.search("user preferences");
```

### Custom Agent

```typescript
class MyAgent {
  private memory: MuninnClient;
  
  constructor(apiKey: string) {
    this.memory = new MuninnClient({ apiKey });
  }
  
  async chat(message: string): Promise<string> {
    // Retrieve relevant context
    const context = await this.memory.search(message);
    
    // Generate response with context
    const response = await this.llm.generate({
      prompt: message,
      context: context.map(m => m.content)
    });
    
    // Store the conversation
    await this.memory.store(`User: ${message}\nAgent: ${response}`);
    
    return response;
  }
}
```

## Links

- **Documentation**: https://clawhub.ai/skill/muninn-skill
- **Dashboard**: https://muninn.au
- **GitHub**: https://github.com/Phillipneho/muninn

## License

MIT