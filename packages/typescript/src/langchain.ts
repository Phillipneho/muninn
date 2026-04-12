/**
 * LangChain integration for Muninn memory system.
 *
 * Provides memory classes for LangChain agents to persist
 * conversation history and entity knowledge across sessions.
 */

import { BaseMemory, InputValues, MemoryVariables, OutputValues } from "langchain/memory";
import { MuninnClient } from "./client";

/**
 * LangChain memory backed by Muninn.
 *
 * Usage:
 * ```typescript
 * import { MuninnMemory } from "muninn-sdk/langchain";
 * import { initializeAgent } from "langchain/agents";
 *
 * const memory = new MuninnMemory({
 *   apiKey: "muninn_xxx",
 *   organizationId: "my-agent"
 * });
 *
 * const agent = initializeAgent({
 *   tools,
 *   llm,
 *   memory
 * });
 * ```
 */
export class MuninnMemory extends BaseMemory {
  private client: MuninnClient;
  private memoryType: string;

  constructor(options: {
    apiKey: string;
    organizationId?: string;
    baseUrl?: string;
    memoryType?: string;
  }) {
    super();
    this.client = new MuninnClient({
      apiKey: options.apiKey,
      organizationId: options.organizationId || "default",
      baseUrl: options.baseUrl || "https://api.muninn.au"
    });
    this.memoryType = options.memoryType || "conversational";
  }

  get memoryKeys(): string[] {
    return ["history", "entities"];
  }

  async loadMemoryVariables(inputs: InputValues): Promise<MemoryVariables> {
    const inputStr = String(inputs.input || inputs);

    // Search for relevant memories
    const memories = await this.client.memories.search({
      query: inputStr,
      limit: 10
    });

    // Format as conversation history
    const history: Array<{ role: string; content: string }> = [];
    const entities = new Set<string>();

    for (const memory of memories) {
      const content = memory.content || "";
      const metadata = memory.metadata || {};

      history.push({
        role: metadata.role || "user",
        content
      });

      // Track entities
      for (const entity of memory.entities || []) {
        entities.add(entity);
      }
    }

    return {
      history,
      entities: Array.from(entities)
    };
  }

  async saveContext(
    inputs: InputValues,
    outputs: OutputValues
  ): Promise<void> {
    // Save user input
    const userInput = String(inputs.input || inputs);
    if (userInput) {
      await this.client.memories.store({
        content: userInput,
        type: this.memoryType,
        metadata: { role: "user", source: "langchain" }
      });
    }

    // Save AI output
    const aiOutput = outputs.output || String(outputs);
    if (aiOutput) {
      await this.client.memories.store({
        content: String(aiOutput),
        type: this.memoryType,
        metadata: { role: "assistant", source: "langchain" }
      });
    }
  }

  async clear(): Promise<void> {
    // Intentional no-op - we don't want to delete memories
  }
}

/**
 * Entity-focused memory for LangChain.
 *
 * Stores and retrieves facts about entities mentioned in conversation.
 * Best for agents that need to remember specific information about
 * people, organizations, or concepts.
 */
export class MuninnEntityMemory extends BaseMemory {
  private client: MuninnClient;

  constructor(options: {
    apiKey: string;
    organizationId?: string;
    baseUrl?: string;
  }) {
    super();
    this.client = new MuninnClient({
      apiKey: options.apiKey,
      organizationId: options.organizationId || "default",
      baseUrl: options.baseUrl || "https://api.muninn.au"
    });
  }

  get memoryKeys(): string[] {
    return ["entity_facts"];
  }

  async loadMemoryVariables(inputs: InputValues): Promise<MemoryVariables> {
    const inputStr = String(inputs.input || inputs);

    // Search for facts
    const facts = await this.client.facts.search({
      query: inputStr,
      limit: 20
    });

    // Group by entity
    const entityFacts: Record<string, Array<{
      predicate: string;
      object: string;
      confidence: number;
    }>> = {};

    for (const fact of facts) {
      const subject = fact.subject || "unknown";
      if (!entityFacts[subject]) {
        entityFacts[subject] = [];
      }
      entityFacts[subject].push({
        predicate: fact.predicate || "",
        object: fact.object || "",
        confidence: fact.confidence || 1.0
      });
    }

    return { entity_facts: entityFacts };
  }

  async saveContext(
    inputs: InputValues,
    outputs: OutputValues
  ): Promise<void> {
    // Store combined conversation for extraction
    const combined = `User: ${inputs.input || inputs}\nAssistant: ${outputs.output || outputs}`;
    await this.client.memories.store({
      content: combined,
      type: "conversational",
      metadata: { source: "langchain_entity" }
    });
  }

  async clear(): Promise<void> {
    // Intentional no-op
  }
}