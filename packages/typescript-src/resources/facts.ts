/**
 * Facts resource for the Muninn SDK.
 *
 * Provides methods to search facts and retrieve entity facts
 * from the Muninn knowledge graph.
 */

import type { MuninnClient } from "./client";
import type { Fact } from "../types";

export class FactsResource {
  private client: MuninnClient;

  constructor(client: MuninnClient) {
    this.client = client;
  }

  /**
   * Search facts by query.
   */
  async search(params: {
    query: string;
    limit?: number;
    organizationId?: string;
  }): Promise<Fact[]> {
    const response = await this.client.request<{
      facts: Fact[];
    }>("/api/facts/search", {
      method: "POST",
      body: JSON.stringify(params)
    });
    return response.facts || [];
  }

  /**
   * Get all facts for an entity.
   */
  async getEntityFacts(entityName: string, params?: {
    limit?: number;
    organizationId?: string;
  }): Promise<Fact[]> {
    const response = await this.client.request<{
      facts: Fact[];
    }>(`/api/entities/${encodeURIComponent(entityName)}/facts`, {
      method: "GET"
    });
    return response.facts || [];
  }
}