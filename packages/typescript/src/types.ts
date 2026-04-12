/**
 * Type definitions for the Muninn SDK.
 */

/**
 * Types of memories that can be stored.
 */
export type MemoryType = 'semantic' | 'episodic' | 'procedural';

/**
 * Visibility level for memories.
 */
export type Visibility = 'organization' | 'private' | 'shared';

/**
 * Subscription tier for organizations.
 */
export type Tier = 'free' | 'pro' | 'enterprise';

/**
 * Search type used for querying memories.
 */
export type SearchType = 'semantic' | 'keyword';

/**
 * Represents an entity in the knowledge graph.
 */
export interface Entity {
  /** Unique identifier for the entity */
  id: string;
  /** Name of the entity */
  name: string;
  /** Type of entity (person, org, concept, location, etc.) */
  type: string;
  /** Alternative names/aliases for this entity */
  aliases?: string[];
  /** Summary description of the entity */
  summary?: string;
  /** Timestamp when the entity was created */
  created_at?: string;
}

/**
 * Represents a fact about an entity.
 */
export interface Fact {
  /** Unique identifier for the fact */
  id: string;
  /** Subject entity ID or name */
  subject?: string;
  /** Predicate/relationship (e.g., 'works_at', 'knows') */
  predicate?: string;
  /** Object entity or value */
  object?: string;
  /** Confidence score (0.0 to 1.0) */
  confidence?: number;
  /** When this fact became true */
  valid_from?: string;
  /** When this fact stopped being true */
  valid_until?: string;
  /** Source episode where this fact was extracted */
  source_episode_id?: string;
  /** Timestamp when the fact was created */
  created_at?: string;
}

/**
 * Represents a stored memory in Muninn.
 */
export interface Memory {
  /** Unique identifier for the memory */
  id: string;
  /** The actual content of the memory */
  content: string;
  /** Type of memory (semantic, episodic, procedural) */
  type: MemoryType;
  /** Additional metadata stored with the memory */
  metadata?: Record<string, unknown>;
  /** List of entity identifiers associated with this memory */
  entities?: string[];
  /** Importance/relevance score (0.0 to 1.0) */
  salience?: number;
  /** Visibility level (organization, private, shared) */
  visibility?: Visibility;
  /** Timestamp when the memory was created */
  created_at?: string;
  /** Whether an embedding was successfully generated */
  embedding_generated?: boolean;
}

/**
 * Represents an organization in Muninn.
 */
export interface Organization {
  /** Unique identifier for the organization */
  id: string;
  /** Name of the organization */
  name: string;
  /** Subscription tier (free, pro, enterprise) */
  tier?: Tier;
  /** Timestamp when the organization was created */
  created_at?: string;
  /** API key for the organization (only returned on creation) */
  api_key?: string;
  /** Contact email for the organization */
  email?: string;
}

/**
 * Represents a search result from memory query.
 */
export interface SearchResult {
  /** List of memories matching the query */
  results: Memory[];
  /** Total number of results */
  count: number;
  /** The original search query */
  query: string;
  /** Type of search performed (semantic or keyword) */
  search_type: SearchType;
}

/**
 * Parameters for storing a new memory.
 */
export interface StoreMemoryParams {
  /** The content of the memory (required) */
  content: string;
  /** Type of memory - semantic, episodic, or procedural (default: semantic) */
  type?: MemoryType;
  /** Additional metadata to store with the memory */
  metadata?: Record<string, unknown>;
  /** List of entity identifiers associated with this memory */
  entities?: string[];
  /** Importance/relevance score from 0.0 to 1.0 (default: 0.5) */
  salience?: number;
  /** Visibility level - organization, private, or shared (default: organization) */
  visibility?: Visibility;
  /** Source of the memory (default: user_input) */
  source_type?: string;
}

/**
 * Parameters for searching memories.
 */
export interface SearchParams {
  /** The search query string (required) */
  query: string;
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Optional memory type filter (semantic, episodic, procedural) */
  type?: MemoryType;
  /** Similarity threshold for semantic search (default: 0.3) */
  threshold?: number;
}

/**
 * Parameters for creating an organization.
 */
export interface CreateOrganizationParams {
  /** Name of the organization (required) */
  name: string;
  /** Contact email for the organization (required) */
  email: string;
  /** Subscription tier - free, pro, or enterprise (default: free) */
  tier?: Tier;
}

/**
 * Client configuration options.
 */
export interface MuninnClientOptions {
  /** Muninn API key starting with 'muninn_live_' */
  apiKey?: string;
  /** Supabase JWT token starting with 'eyJ...' */
  supabaseJwt?: string;
  /** Base URL for the API (defaults to production) */
  baseUrl?: string;
  /** Request timeout in seconds (default: 30) */
  timeout?: number;
}

/**
 * Internal response from the API.
 */
export interface ApiResponse {
  [key: string]: unknown;
}

/**
 * Health check response.
 */
export interface HealthResponse {
  status: string;
  service?: string;
  version?: string;
}