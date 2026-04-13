/**
 * Memories resource for the Muninn SDK.
 *
 * Provides methods to store, search, retrieve, and delete memories.
 */

import type { MuninnClient } from '../client';
import type { Memory, SearchResult, StoreMemoryParams, SearchParams, MemoryType, Visibility, SearchType } from '../types';
import {
  MuninnError,
  MuninnValidationError,
  MuninnNotFoundError,
} from '../errors';

/**
 * Resource for interacting with memory endpoints.
 *
 * Provides methods to store, search, retrieve, and delete memories.
 */
export class MemoriesResource {
  private client: MuninnClient;

  /**
   * Initialize the memories resource.
   *
   * @param client - The MuninnClient instance
   */
  constructor(client: MuninnClient) {
    this.client = client;
  }

  /**
   * Store a new memory in Muninn.
   *
   * @param params - Parameters for storing the memory
   * @returns The created memory object
   * @throws MuninnValidationError if content is empty or parameters are invalid
   * @throws MuninnAuthError if authentication fails
   * @throws MuninnServerError if the API returns an error
   *
   * @example
   * ```typescript
   * const memory = await client.memories.store({
   *   content: 'User prefers dark mode',
   *   type: 'preference',
   *   entities: ['user_123'],
   *   metadata: { category: 'ui' }
   * });
   * console.log(memory.id);
   * ```
   */
  async store(params: StoreMemoryParams): Promise<Memory> {
    const { content, type = 'semantic', metadata, entities, salience = 0.5, visibility = 'organization', source_type = 'user_input' } = params;

    if (!content || !content.trim()) {
      throw new MuninnValidationError('Content cannot be empty');
    }

    if (salience < 0.0 || salience > 1.0) {
      throw new MuninnValidationError('Salience must be between 0.0 and 1.0');
    }

    const payload: Record<string, unknown> = {
      content,
      type,
      metadata: metadata ?? {},
      entities: entities ?? [],
      salience,
      visibility,
      source_type,
    };

    const response = await this.client.request('POST', '/memories', payload);
    return this.parseMemory(response);
  }

  /**
   * Search for memories using semantic or keyword search.
   *
   * @param params - Search parameters
   * @returns Object containing matching memories and metadata
   * @throws MuninnValidationError if query is empty
   * @throws MuninnAuthError if authentication fails
   * @throws MuninnServerError if the API returns an error
   *
   * @example
   * ```typescript
   * const results = await client.memories.search({
   *   query: 'user preferences',
   *   limit: 10
   * });
   * for (const memory of results.results) {
   *   console.log(memory.content);
   * }
   * ```
   */
  async search(params: SearchParams): Promise<SearchResult> {
    const { query, limit = 10, type, threshold = 0.3 } = params;

    if (!query || !query.trim()) {
      throw new MuninnValidationError('Query cannot be empty');
    }

    if (limit < 1 || limit > 100) {
      throw new MuninnValidationError('Limit must be between 1 and 100');
    }

    const queryParams: Record<string, string | number | undefined> = {
      q: query,
      limit,
      threshold,
      type,
    };

    const response = await this.client.request('GET', '/memories', undefined, queryParams);
    return this.parseSearchResult(response);
  }

  /**
   * Retrieve a single memory by ID.
   *
   * @param memoryId - The unique identifier of the memory
   * @returns The requested memory object
   * @throws MuninnValidationError if memoryId is empty
   * @throws MuninnNotFoundError if the memory doesn't exist
   * @throws MuninnAuthError if authentication fails
   * @throws MuninnServerError if the API returns an error
   *
   * @example
   * ```typescript
   * const memory = await client.memories.get('m_xxx');
   * console.log(memory.content);
   * ```
   */
  async get(memoryId: string): Promise<Memory> {
    if (!memoryId) {
      throw new MuninnValidationError('Memory ID cannot be empty');
    }

    if (!memoryId.startsWith('m_')) {
      throw new MuninnValidationError('Invalid memory ID format');
    }

    try {
      const response = await this.client.request('GET', `/memories/${memoryId}`);
      return this.parseMemory(response);
    } catch (error) {
      if (error instanceof MuninnError && error.statusCode === 404) {
        throw new MuninnNotFoundError(`Memory not found: ${memoryId}`);
      }
      throw error;
    }
  }

  /**
   * Delete a memory by ID.
   *
   * @param memoryId - The unique identifier of the memory to delete
   * @returns True if deletion was successful
   * @throws MuninnValidationError if memoryId is empty
   * @throws MuninnNotFoundError if the memory doesn't exist
   * @throws MuninnAuthError if authentication fails
   * @throws MuninnServerError if the API returns an error
   *
   * @example
   * ```typescript
   * await client.memories.delete('m_xxx');
   * ```
   */
  async delete(memoryId: string): Promise<boolean> {
    if (!memoryId) {
      throw new MuninnValidationError('Memory ID cannot be empty');
    }

    if (!memoryId.startsWith('m_')) {
      throw new MuninnValidationError('Invalid memory ID format');
    }

    try {
      const response = await this.client.request('DELETE', `/memories/${memoryId}`);
      return (response.deleted as boolean) ?? false;
    } catch (error) {
      if (error instanceof MuninnError && error.statusCode === 404) {
        throw new MuninnNotFoundError(`Memory not found: ${memoryId}`);
      }
      throw error;
    }
  }

  /**
   * Parse an API response into a Memory object.
   */
  private parseMemory(data: Record<string, unknown>): Memory {
    return {
      id: data.id as string,
      content: data.content as string,
      type: (data.type as MemoryType) ?? 'semantic',
      metadata: data.metadata as Record<string, unknown> | undefined,
      entities: data.entities as string[] | undefined,
      salience: data.salience as number | undefined,
      visibility: data.visibility as Visibility | undefined,
      created_at: data.created_at as string | undefined,
      embedding_generated: data.embedding_generated as boolean | undefined,
    };
  }

  /**
   * Parse an API response into a SearchResult object.
   */
  private parseSearchResult(data: Record<string, unknown>): SearchResult {
    const results = (data.results as Record<string, unknown>[]) ?? [];
    return {
      results: results.map((r) => this.parseMemory(r)),
      count: (data.count as number) ?? 0,
      query: (data.query as string) ?? '',
      search_type: (data.search_type as SearchType) ?? 'keyword',
    };
  }
}