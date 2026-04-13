/**
 * Muninn SDK - TypeScript client for the Muninn memory API.
 *
 * Agent memory system with 99.1% LOCOMO accuracy.
 * Edge-native, persistent memory for AI agents.
 *
 * @packageDocumentation
 */

/**
 * Represents a stored memory in Muninn.
 */
export interface Memory {
  /** Unique identifier for the memory */
  id: string;
  /** Content of the memory */
  content: string;
  /** Type of memory (semantic, episodic, procedural) */
  type?: string;
  /** Metadata associated with the memory */
  metadata?: Record<string, any>;
  /** Entities mentioned in the memory */
  entities?: string[];
  /** Salience score (0.0 to 1.0) */
  salience?: number;
  /** Timestamp when the memory was created */
  created_at?: string;
}

/**
 * Client options for Muninn SDK.
 */
export interface MuninnClientOptions {
  /** API key for authentication */
  apiKey: string;
  /** Organization ID (optional) */
  organizationId?: string;
  /** Base URL for the Muninn API */
  baseUrl?: string;
}

/**
 * Search result from Muninn.
 */
export interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata?: Record<string, any>;
}

/**
 * Muninn Client - Main client for the Muninn memory API.
 *
 * Usage:
 * ```typescript
 * import { MuninnClient } from "muninn-sdk";
 *
 * const client = new MuninnClient({
 *   apiKey: "muninn_xxx"
 * });
 *
 * // Store a memory
 * const memory = await client.store("Remember that James works at TechCorp");
 *
 * // Search memories
 * const results = await client.search("James workplace");
 * ```
 */
export class MuninnClient {
  private apiKey: string;
  private organizationId: string;
  private baseUrl: string;

  constructor(options: MuninnClientOptions) {
    this.apiKey = options.apiKey;
    this.organizationId = options.organizationId || "default";
    this.baseUrl = options.baseUrl || "https://api.muninn.au";
  }

  /**
   * Store a memory in Muninn.
   */
  async store(content: string, options?: {
    type?: string;
    metadata?: Record<string, any>;
  }): Promise<Memory> {
    const response = await fetch(`${this.baseUrl}/api/memories`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "X-Organization-ID": this.organizationId
      },
      body: JSON.stringify({
        content,
        type: options?.type || "semantic",
        metadata: options?.metadata || {}
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to store memory: ${response.statusText}`);
    }

    return response.json() as Promise<Memory>;
  }

  /**
   * Search memories in Muninn.
   */
  async search(query: string, options?: {
    limit?: number;
    searchType?: "keyword" | "hybrid";
  }): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      limit: String(options?.limit || 10),
      search_type: options?.searchType || "hybrid"
    });

    const response = await fetch(`${this.baseUrl}/api/memories?${params}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "X-Organization-ID": this.organizationId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to search memories: ${response.statusText}`);
    }

    const data = await response.json();
    return data.memories || [];
  }

  /**
   * Get all memories.
   */
  async list(options?: { limit?: number }): Promise<Memory[]> {
    const params = new URLSearchParams({
      limit: String(options?.limit || 50)
    });

    const response = await fetch(`${this.baseUrl}/api/memories?${params}`, {
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "X-Organization-ID": this.organizationId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to list memories: ${response.statusText}`);
    }

    const data = await response.json();
    return data.memories || [];
  }

  /**
   * Delete a memory by ID.
   */
  async delete(memoryId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories/${memoryId}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "X-Organization-ID": this.organizationId
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to delete memory: ${response.statusText}`);
    }
  }
}

// Version
export const VERSION = "2.0.0";