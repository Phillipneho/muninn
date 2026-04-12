// src/index.ts
var MuninnClient = class {
  apiKey;
  organizationId;
  baseUrl;
  constructor(options) {
    this.apiKey = options.apiKey;
    this.organizationId = options.organizationId || "default";
    this.baseUrl = options.baseUrl || "https://api.muninn.au";
  }
  /**
   * Store a memory in Muninn.
   */
  async store(content, options) {
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
    return response.json();
  }
  /**
   * Search memories in Muninn.
   */
  async search(query, options) {
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
  async list(options) {
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
  async delete(memoryId) {
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
};
var VERSION = "2.0.0";
export {
  MuninnClient,
  VERSION
};
