/**
 * Tests for the Muninn SDK client initialization.
 */

import { describe, it, expect } from 'vitest';
import { MuninnClient } from '../src/client';
import {
  MuninnValidationError,
  MuninnAuthError,
  MuninnNotFoundError,
  MuninnRateLimitError,
  MuninnServerError,
  MuninnConnectionError,
} from '../src/errors';

describe('MuninnClient', () => {
  describe('initialization', () => {
    it('should initialize with API key', () => {
      const client = new MuninnClient({ apiKey: 'muninn_live_abc123' });
      expect(client.apiKey).toBe('muninn_live_abc123');
      expect(client.supabaseJwt).toBeUndefined();
    });

    it('should initialize with JWT', () => {
      const client = new MuninnClient({ supabaseJwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test' });
      expect(client.apiKey).toBeUndefined();
      expect(client.supabaseJwt).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');
    });

    it('should fail without credentials', () => {
      expect(() => new MuninnClient({})).toThrow(MuninnValidationError);
      expect(() => new MuninnClient({})).toThrow('Either apiKey or supabaseJwt must be provided');
    });

    it('should fail with both credentials', () => {
      expect(() => new MuninnClient({
        apiKey: 'muninn_live_abc',
        supabaseJwt: 'eyJabc',
      })).toThrow(MuninnValidationError);
      expect(() => new MuninnClient({
        apiKey: 'muninn_live_abc',
        supabaseJwt: 'eyJabc',
      })).toThrow('Cannot provide both apiKey and supabaseJwt');
    });

    it('should fail with invalid API key format', () => {
      expect(() => new MuninnClient({ apiKey: 'invalid_key' })).toThrow(MuninnValidationError);
      expect(() => new MuninnClient({ apiKey: 'invalid_key' })).toThrow("API key must start with 'muninn_live_'");
    });

    it('should fail with invalid JWT format', () => {
      expect(() => new MuninnClient({ supabaseJwt: 'invalid_jwt' })).toThrow(MuninnValidationError);
      expect(() => new MuninnClient({ supabaseJwt: 'invalid_jwt' })).toThrow("Supabase JWT must start with 'eyJ'");
    });

    it('should use custom base URL', () => {
      const client = new MuninnClient({
        apiKey: 'muninn_live_abc',
        baseUrl: 'https://custom-api.example.com',
      });
      expect(client.baseUrl).toBe('https://custom-api.example.com');
    });

    it('should use default base URL', () => {
      const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
      expect(client.baseUrl).toBe('https://muninn-supabase.vercel.app');
    });

    it('should use custom timeout', () => {
      const client = new MuninnClient({ apiKey: 'muninn_live_abc', timeout: 60 });
      expect(client.timeout).toBe(60);
    });

    it('should use default timeout', () => {
      const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
      expect(client.timeout).toBe(30);
    });
  });

  describe('resources', () => {
    it('should expose memories resource', () => {
      const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
      expect(client.memories).toBeDefined();
      expect(typeof client.memories.store).toBe('function');
      expect(typeof client.memories.search).toBe('function');
      expect(typeof client.memories.get).toBe('function');
      expect(typeof client.memories.delete).toBe('function');
    });

    it('should expose organizations resource', () => {
      const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
      expect(client.organizations).toBeDefined();
      expect(typeof client.organizations.create).toBe('function');
    });
  });
});

describe('MuninnError classes', () => {
  it('should create MuninnError with default status code', () => {
    const error = new MuninnValidationError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('MuninnValidationError');
  });

  it('should create MuninnAuthError with correct status code', () => {
    const error = new MuninnAuthError('Auth failed');
    expect(error.statusCode).toBe(401);
    expect(error.name).toBe('MuninnAuthError');
  });

  it('should create MuninnRateLimitError with correct status code', () => {
    const error = new MuninnRateLimitError('Rate limited');
    expect(error.statusCode).toBe(429);
    expect(error.name).toBe('MuninnRateLimitError');
  });

  it('should create MuninnNotFoundError with correct status code', () => {
    const error = new MuninnNotFoundError('Not found');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('MuninnNotFoundError');
  });

  it('should create MuninnServerError with correct status code', () => {
    const error = new MuninnServerError('Server error');
    expect(error.statusCode).toBe(500);
    expect(error.name).toBe('MuninnServerError');
  });

  it('should create MuninnConnectionError with status code 0', () => {
    const error = new MuninnConnectionError('Connection failed');
    expect(error.statusCode).toBe(0);
    expect(error.name).toBe('MuninnConnectionError');
  });
});

describe('MemoriesResource validation', () => {
  it('should validate empty content', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.memories.store({ content: '' })).rejects.toThrow('Content cannot be empty');
    await expect(client.memories.store({ content: '   ' })).rejects.toThrow('Content cannot be empty');
  });

  it('should validate salience range', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.memories.store({ content: 'test', salience: -0.1 })).rejects.toThrow('Salience must be between 0.0 and 1.0');
    await expect(client.memories.store({ content: 'test', salience: 1.1 })).rejects.toThrow('Salience must be between 0.0 and 1.0');
  });

  it('should validate empty query', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.memories.search({ query: '' })).rejects.toThrow('Query cannot be empty');
    await expect(client.memories.search({ query: '   ' })).rejects.toThrow('Query cannot be empty');
  });

  it('should validate limit range', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.memories.search({ query: 'test', limit: 0 })).rejects.toThrow('Limit must be between 1 and 100');
    await expect(client.memories.search({ query: 'test', limit: 101 })).rejects.toThrow('Limit must be between 1 and 100');
  });

  it('should validate empty memory ID', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.memories.get('')).rejects.toThrow('Memory ID cannot be empty');
    await expect(client.memories.delete('')).rejects.toThrow('Memory ID cannot be empty');
  });

  it('should validate memory ID format', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.memories.get('invalid')).rejects.toThrow('Invalid memory ID format');
    await expect(client.memories.delete('invalid')).rejects.toThrow('Invalid memory ID format');
  });
});

describe('OrganizationsResource validation', () => {
  it('should validate empty name', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.organizations.create({ name: '', email: 'test@test.com' })).rejects.toThrow('Organization name cannot be empty');
    await expect(client.organizations.create({ name: '   ', email: 'test@test.com' })).rejects.toThrow('Organization name cannot be empty');
  });

  it('should validate empty email', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.organizations.create({ name: 'Test', email: '' })).rejects.toThrow('Organization email cannot be empty');
    await expect(client.organizations.create({ name: 'Test', email: '   ' })).rejects.toThrow('Organization email cannot be empty');
  });

  it('should validate email format', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.organizations.create({ name: 'Test', email: 'invalid' })).rejects.toThrow('Invalid email format');
    await expect(client.organizations.create({ name: 'Test', email: 'invalid@' })).rejects.toThrow('Invalid email format');
  });

  it('should validate tier', async () => {
    const client = new MuninnClient({ apiKey: 'muninn_live_abc' });
    await expect(client.organizations.create({ name: 'Test', email: 'test@test.com', tier: 'invalid' as never })).rejects.toThrow('Tier must be: free, pro, or enterprise');
  });
});