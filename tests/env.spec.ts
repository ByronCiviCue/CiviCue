import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('env validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear NODE_ENV to ensure proper defaults
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should validate with minimal required variables', async () => {
    process.env.SOCRATA_APP_ID = 'test-app-id';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';

    const { env } = await import('../src/lib/env');

    expect(env.socrata.appId).toBe('test-app-id');
    expect(env.db.url).toBe('postgres://user:pass@localhost:5432/test');
    expect(env.db.vectorDim).toBe(1536);
    expect(env.ai.embeddingModel).toBe('text-embedding-3-large');
    expect(env.runtime.nodeEnv).toBe('development');
    expect(env.runtime.port).toBe(3000);
  });

  it('should fail when DATABASE_URL is missing', async () => {
    process.env.SOCRATA_APP_ID = 'test-app-id';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    delete process.env.DATABASE_URL;

    await expect(() => import('../src/lib/env')).rejects.toThrow(
      'Environment validation failed: db.url: Invalid input'
    );
  });

  it('should fail when SOCRATA_APP_ID is missing', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    delete process.env.SOCRATA_APP_ID;

    await expect(() => import('../src/lib/env')).rejects.toThrow(
      'Environment validation failed: socrata.appId: Invalid input'
    );
  });

  it('should fail when EMBEDDING_MODEL is missing', async () => {
    process.env.SOCRATA_APP_ID = 'test-app-id';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    delete process.env.EMBEDDING_MODEL;

    await expect(() => import('../src/lib/env')).rejects.toThrow(
      'Environment validation failed: ai.embeddingModel: Invalid input'
    );
  });

  it('should fail when PGVECTOR_DIM is not a positive integer', async () => {
    process.env.SOCRATA_APP_ID = 'test-app-id';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    process.env.PGVECTOR_DIM = '-5';

    await expect(() => import('../src/lib/env')).rejects.toThrow(
      'Environment validation failed'
    );
  });

  it('should not leak secret values in error messages', async () => {
    process.env.DATABASE_URL = 'postgres://secret:password@localhost:5432/test';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    delete process.env.SOCRATA_APP_ID;

    try {
      await import('../src/lib/env');
    } catch (error) {
      const errorMessage = (error as Error).message;
      expect(errorMessage).not.toContain('secret');
      expect(errorMessage).not.toContain('password');
      expect(errorMessage).toContain('Invalid input');
    }
  });

  it('should parse optional variables correctly', async () => {
    process.env.SOCRATA_APP_ID = 'test-app-id';
    process.env.SOCRATA_APP_SECRET = 'test-secret';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    process.env.PGVECTOR_DIM = '768';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    process.env.CKAN_BASE_URL = 'https://data.example.com';
    process.env.CKAN_API_KEY = 'ckan-key';
    process.env.ARCGIS_PORTAL_URL = 'https://portal.example.com';
    process.env.ARCGIS_API_KEY = 'arcgis-key';
    process.env.OPENAI_API_KEY = 'openai-key';
    process.env.NODE_ENV = 'production';
    process.env.PORT = '8080';

    const { env } = await import('../src/lib/env');

    expect(env.socrata.appSecret).toBe('test-secret');
    expect(env.db.vectorDim).toBe(768);
    expect(env.ckan.baseUrl).toBe('https://data.example.com');
    expect(env.ckan.apiKey).toBe('ckan-key');
    expect(env.arcgis.portalUrl).toBe('https://portal.example.com');
    expect(env.arcgis.apiKey).toBe('arcgis-key');
    expect(env.ai.openaiKey).toBe('openai-key');
    expect(env.runtime.nodeEnv).toBe('production');
    expect(env.runtime.port).toBe(8080);
  });

  it('should provide requireKey helper for ad-hoc needs', async () => {
    process.env.SOCRATA_APP_ID = 'test-app-id';
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-large';
    process.env.CUSTOM_KEY = 'custom-value';

    const { requireKey } = await import('../src/lib/env');

    expect(requireKey('CUSTOM_KEY')).toBe('custom-value');
    expect(() => requireKey('MISSING_KEY')).toThrow(
      'Required environment variable MISSING_KEY is not set'
    );
  });
});