/**
 * LlamaIndex integration for Muninn memory system.
 *
 * Provides memory classes for LlamaIndex agents to persist
 * conversation history and knowledge across sessions.
 */

import { ChatMemory, ChatMessage } from "llamaindex/memory";
import { MuninnClient } from "./client";

/**
 * LlamaIndex chat memory backed by Muninn.
 *
 * Usage:
 * ```typescript
 * import { MuninnChatMemory } from "muninn-sdk/llamaindex";
 * import { AgentRunner } from "llamaindex/agent";
 *
 * const memory = new MuninnChatMemory({
 *   apiKey: "muninn_xxx",
 *   organizationId: "my-agent"
 * });
 *
 * const agent = AgentRunner.fromLLM({
 *   llm,
 *   memory
 * });
 * ```
 */
export class MuninnChatMemory implements ChatMemory {
  private client: MuninnClient;
  private tokenLimit: number;

  constructor(options: {
    apiKey: string;
    organizationId?: string;
    baseUrl?: string;
    tokenLimit?: number;
  }) {
    this.client = new MuninnClient({
      apiKey: options.apiKey,
      organizationId: options.organizationId || "default",
      baseUrl: options.baseUrl || "https://api.muninn.au"
    });
    this.tokenLimit = options.tokenLimit || 3000;
  }

  async get(input?: string): Promise<ChatMessage[]> {
    const query = input || "";

    // Search for relevant memories
    const memories = await this.client.memories.search({
      query,
      limit: 20
    });

    // Convert to ChatMessage format
    const messages: ChatMessage[] = [];
    for (const memory of memories) {
      const content = memory.content || "";
      const metadata = memory.metadata || {};
      const role = metadata.role || "user";

      messages.push({
        role: role as "user" | "assistant",
        content,
        additionalKwargs: { memory_id: memory.id }
      } as ChatMessage);
    }

    return messages;
  }

  async getAll(): Promise<ChatMessage[]> {
    return this.get("");
  }

  async put(message: ChatMessage): Promise<void> {
    const role = message.role === "user" ? "user" : "assistant";

    await this.client.memories.store({
      content: message.content,
      type: "conversational",
      metadata: {
        role,
        source: "llamaindex"
      }
    });
  }

  async set(messages: ChatMessage[]): Promise<void> {
    for (const message of messages) {
      await this.put(message);
    }
  }

  async reset(): Promise<void> {
    // Intentional no-op - we don't want to delete memories
  }
}

/**
 * Vector-based memory for LlamaIndex using Muninn.
 *
 * Provides semantic search over stored memories.
 * Best for RAG applications where you need to find
 * relevant context from past conversations.
 */
export class MuninnVectorMemory {
  private client: MuninnClient;
  private similarityThreshold: number;

  constructor(options: {
    apiKey: string;
    organizationId?: string;
    baseUrl?: string;
    similarityThreshold?: number;
  }) {
    this.client = new MuninnClient({
      apiKey: options.apiKey,
      organizationId: options.organizationId || "default",
      baseUrl: options.baseUrl || "https://api.muninn.au"
    });
    this.similarityThreshold = options.similarityThreshold || 0.7;
  }

  async add(content: string, metadata?: Record<string, any>): Promise<string> {
    const result = await this.client.memories.store({
      content,
      type: "semantic",
      metadata: metadata || {}
    });
    return result.id || "";
  }

  async retrieve(query: string, limit: number = 10): Promise<Array<{
    content: string;
    score: number;
    metadata: Record<string, any>;
    id: string;
  }>> {
    const results = await this.client.memories.search({
      query,
      limit,
      search_type: "hybrid" // Uses both keyword and vector search
    });

    // Filter by similarity threshold
    return results
      .filter((r: any) => (r.score || 1.0) >= this.similarityThreshold)
      .map((r: any) => ({
        content: r.content || "",
        score: r.score || 1.0,
        metadata: r.metadata || {},
        id: r.id || ""
      }));
  }

  async delete(memoryId: string): Promise<boolean> {
    try {
      await this.client.delete(memoryId);
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    // Intentional no-op
  }
}

/**
 * Knowledge graph memory for LlamaIndex.
 *
 * Stores and retrieves facts as entity-relationship triples.
 * Best for agents that need structured knowledge about
 * entities and their relationships.
 */
export class MuninnKnowledgeGraphMemory {
  private client: MuninnClient;

  constructor(options: {
    apiKey: string;
    organizationId?: string;
    baseUrl?: string;
  }) {
    this.client = new MuninnClient({
      apiKey: options.apiKey,
      organizationId: options.organizationId || "default",
      baseUrl: options.baseUrl || "https://api.muninn.au"
    });
  }

  async getEntityFacts(entityName: string, limit: number = 50): Promise<Array<{
    predicate: string;
    object: string;
    confidence: number;
  }>> {
    try {
      const facts = await this.client.facts.getEntityFacts(entityName);
      return facts.slice(0, limit);
    } catch {
      return [];
    }
  }

  async queryRelation(subject: string, predicate: string): Promise<Array<{
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }>> {
    try {
      const results = await this.client.facts.search({
        query: `${subject} ${predicate}`,
        limit: 10
      });
      return results.filter(
        (r: any) => r.subject === subject && r.predicate === predicate
      );
    } catch {
      return [];
    }
  }

  async addFact(
    subject: string,
    predicate: string,
    obj: string,
    confidence: number = 1.0
  ): Promise<string> {
    const result = await this.client.memories.store({
      content: `${subject} ${predicate} ${obj}`,
      type: "semantic",
      metadata: {
        subject,
        predicate,
        object: obj,
        confidence
      }
    });
    return result.id || "";
  }
}