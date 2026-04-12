"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  MuninnClient: () => MuninnClient,
  VERSION: () => VERSION
});
module.exports = __toCommonJS(index_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MuninnClient,
  VERSION
});
