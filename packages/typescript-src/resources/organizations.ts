/**
 * Organizations resource for the Muninn SDK.
 *
 * Provides methods to create and manage organizations.
 * Note: Organization creation does not require authentication.
 */

import type { MuninnClient } from '../client';
import type { Organization, CreateOrganizationParams, Tier } from '../types';
import { MuninnValidationError } from '../errors';

/**
 * Resource for interacting with organization endpoints.
 *
 * Provides methods to create and manage organizations.
 * Note: Organization creation does not require authentication.
 */
export class OrganizationsResource {
  private client: MuninnClient;

  /**
   * Initialize the organizations resource.
   *
   * @param client - The MuninnClient instance
   */
  constructor(client: MuninnClient) {
    this.client = client;
  }

  /**
   * Create a new organization and generate an API key.
   *
   * Note: This is the only endpoint that doesn't require authentication.
   * The returned API key should be stored securely - it won't be shown again.
   *
   * @param params - Parameters for creating the organization
   * @returns The created organization with API key
   * @throws MuninnValidationError if name or email is empty/invalid
   * @throws MuninnServerError if the API returns an error
   *
   * @example
   * ```typescript
   * const org = await client.organizations.create({
   *   name: 'Acme Corp',
   *   email: 'user@acme.com'
   * });
   * console.log(org.api_key); // Store this securely!
   * console.log(org.id); // 'org_xxx'
   * ```
   */
  async create(params: CreateOrganizationParams): Promise<Organization> {
    const { name, email, tier = 'free' } = params;

    if (!name || !name.trim()) {
      throw new MuninnValidationError('Organization name cannot be empty');
    }

    if (!email || !email.trim()) {
      throw new MuninnValidationError('Organization email cannot be empty');
    }

    // Basic email validation
    if (!email.includes('@') || !email.split('@')[1]?.includes('.')) {
      throw new MuninnValidationError('Invalid email format');
    }

    if (!['free', 'pro', 'enterprise'].includes(tier)) {
      throw new MuninnValidationError('Tier must be: free, pro, or enterprise');
    }

    const payload: Record<string, unknown> = {
      name,
      email,
      tier,
    };

    const response = await this.client.request(
      'POST',
      '/organizations',
      payload,
      undefined,
      false // Does not require auth
    );

    // Extract organization data from response
    const orgData = (response.organization as Record<string, unknown>) ?? response;
    const apiKey = response.api_key as string | undefined;

    return {
      id: orgData.id as string,
      name: orgData.name as string,
      tier: (orgData.tier as Tier) ?? 'free',
      created_at: orgData.created_at as string | undefined,
      api_key: apiKey,
      email: orgData.email as string | undefined,
    };
  }
}