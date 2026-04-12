/**
 * Main client module for the Muninn SDK.
 *
 * Provides the MuninnClient class for interacting with the Muninn API.
 */

import type { MuninnClientOptions, ApiResponse, HealthResponse } from './types';
import {
  MuninnError,
  MuninnAuthError,
  MuninnRateLimitError,
  MuninnNotFoundError,
  MuninnServerError,
  MuninnValidationError,
  MuninnConnectionError,
} from './errors';
import { MemoriesResource } from './resources/memories';
import { OrganizationsResource } from './resources/organizations';
import { FactsResource } from './resources/facts';

/**
 * Main client for interacting with the Muninn API.
 *
 * Supports authentication via API key or Supabase JWT token.
 *
 * @example
 * ```typescript
 * // Using API key
 * const client = new MuninnClient({ apiKey: 'muninn_live_xxx' });
 * const memory = await client.memories.store({ content: 'Hello world' });
 *
 * // Using Supabase JWT
 * const client = new MuninnClient({ supabaseJwt: 'eyJ...' });
 * const memories = await client.memories.search({ query: 'greetings' });
 * ```
 */
export class MuninnClient {
  /** Base URL of the Muninn API */
  public readonly baseUrl: string;

  /** Request timeout in seconds */
  public readonly timeout: number;

  /** The API key used for authentication (if set) */
  public readonly apiKey?: string;

  /** The Supabase JWT used for authentication (if set) */
  public readonly supabaseJwt?: string;

  /** Memories resource for interacting with memory endpoints */
  public readonly memories: MemoriesResource;

  /** Organizations resource for interacting with organization endpoints */
  public readonly organizations: OrganizationsResource;

  /** Default base URL for the Muninn API */
  public static readonly DEFAULT_BASE_URL = 'https://api.muninn.au';

  /**
   * Initialize the Muninn client.
   *
   * @param options - Client configuration options
   * @throws MuninnValidationError if neither apiKey nor supabaseJwt is provided
   * @throws MuninnValidationError if both credentials are provided
   * @throws MuninnValidationError if API key format is invalid
   * @throws MuninnValidationError if JWT format is invalid
   */
  constructor(options: MuninnClientOptions) {
    this.baseUrl = options.baseUrl ?? MuninnClient.DEFAULT_BASE_URL;
    this.timeout = options.timeout ?? 30;

    // Set authentication
    this.apiKey = options.apiKey;
    this.supabaseJwt = options.supabaseJwt;

    // Validate credentials
    if (!this.apiKey && !this.supabaseJwt) {
      throw new MuninnValidationError('Either apiKey or supabaseJwt must be provided');
    }

    if (this.apiKey && this.supabaseJwt) {
      throw new MuninnValidationError('Cannot provide both apiKey and supabaseJwt');
    }

    if (this.apiKey && !this.apiKey.startsWith('muninn_live_')) {
      throw new MuninnValidationError("API key must start with 'muninn_live_'");
    }

    if (this.supabaseJwt && !this.supabaseJwt.startsWith('eyJ')) {
      throw new MuninnValidationError("Supabase JWT must start with 'eyJ'");
    }

    // Initialize resources
    this.memories = new MemoriesResource(this);
    this.organizations = new OrganizationsResource(this);
    this.facts = new FactsResource(this);
  }

  /**
   * Get the authorization header value.
   */
  private getAuthHeader(): string {
    const token = this.apiKey ?? this.supabaseJwt;
    return `Bearer ${token}`;
  }

  /**
   * Make an HTTP request to the API.
   *
   * @param method - HTTP method (GET, POST, DELETE, etc.)
   * @param path - API endpoint path
   * @param json - JSON body for POST/PUT requests
   * @param params - Query parameters
   * @param requiresAuth - Whether this endpoint requires authentication
   * @returns Parsed JSON response from the API
   * @throws MuninnAuthError if authentication fails
   * @throws MuninnRateLimitError if rate limit is exceeded
   * @throws MuninnNotFoundError if resource is not found
   * @throws MuninnServerError if server returns an error
   * @throws MuninnConnectionError if connection fails
   */
  async request(
    method: string,
    path: string,
    json?: Record<string, unknown>,
    params?: Record<string, string | number | boolean | undefined>,
    requiresAuth: boolean = true
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (requiresAuth) {
      headers['Authorization'] = this.getAuthHeader();
    }

    // Build URL with query params if needed
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const filteredParams = Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
      if (filteredParams.length > 0) {
        url += `?${filteredParams.join('&')}`;
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: json ? JSON.stringify(json) : undefined,
        signal: AbortSignal.timeout(this.timeout * 1000),
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new MuninnConnectionError(`Request timed out after ${this.timeout}s`);
        }
        throw new MuninnConnectionError(`Failed to connect to Muninn API: ${error.message}`);
      }
      throw new MuninnConnectionError('Failed to connect to Muninn API');
    }

    return this.handleResponse(response) as Promise<ApiResponse>;
  }

  /**
   * Handle the HTTP response and convert errors to exceptions.
   *
   * @param response - The HTTP response object
   * @returns Parsed JSON response
   * @throws MuninnAuthError for 401 responses
   * @throws MuninnRateLimitError for 429 responses
   * @throws MuninnNotFoundError for 404 responses
   * @throws MuninnServerError for 5xx responses
   * @throws MuninnValidationError for 400 responses
   */
  private async handleResponse(response: Response): Promise<ApiResponse> {
    const status = response.status;
    let data: ApiResponse = {};

    try {
      data = (await response.json()) as ApiResponse;
    } catch {
      // Empty response is okay for some endpoints
    }

    if (status === 200 || status === 201) {
      return data;
    }

    const errorMessage = (data.error as string) ?? 'Unknown error occurred';

    if (status === 401) {
      throw new MuninnAuthError(errorMessage);
    } else if (status === 429) {
      throw new MuninnRateLimitError(errorMessage);
    } else if (status === 404) {
      throw new MuninnNotFoundError(errorMessage);
    } else if (status === 400) {
      throw new MuninnValidationError(errorMessage);
    } else if (status >= 500) {
      throw new MuninnServerError(errorMessage);
    } else {
      throw new MuninnError(errorMessage, status);
    }
  }

  /**
   * Check the health of the Muninn API.
   *
   * @returns Health check response with status and version
   *
   * @example
   * ```typescript
   * const health = await client.health();
   * console.log(health.status); // 'ok'
   * ```
   */
  async health(): Promise<HealthResponse> {
    const response = await this.request('GET', '/health', undefined, undefined, false);
    return {
      status: response.status as string,
      service: response.service as string | undefined,
      version: response.version as string | undefined,
    };
  }
}