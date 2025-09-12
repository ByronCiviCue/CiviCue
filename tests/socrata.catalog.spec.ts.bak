import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { ingestCatalog } from '../services/discovery/socrataCatalogIngest.js';
import page1 from './fixtures/socrata-catalog-page1.json' with { type: 'json' };
import page2 from './fixtures/socrata-catalog-page2.json' with { type: 'json' };

vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const mockPool = {
    query: mockQuery,
    end: mockEnd,
  };
  return {
    Pool: vi.fn(() => mockPool),
  };
});

describe('Socrata catalog ingest', () => {
  const mockFetch = (response: any, options: ResponseInit = { status: 200 }) => {
    const body = typeof response === 'string' ? response : JSON.stringify(response);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(body, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers }
    })));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    // Ensure all globals are unstubbed between tests
    // Optional chaining guards older Vitest versions
    // and avoids console noise.
    vi.unstubAllGlobals?.();
  });

  afterAll(() => {
    vi.useRealTimers?.();
  });

  it('should handle pagination', async () => {
    const { Pool } = await import('pg');
    const mockPool = new Pool();
    
    // Mock pagination with cursor - first page has cursor, second doesn't
    let callCount = 0;
    const fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(new Response(JSON.stringify(page1), { 
          status: 200, 
          headers: { 'content-type': 'application/json' } 
        }));
      } else {
        return Promise.resolve(new Response(JSON.stringify(page2), { 
          status: 200, 
          headers: { 'content-type': 'application/json' } 
        }));
      }
    });
    vi.stubGlobal('fetch', fetch);

    await ingestCatalog({ regions: ['US'], verbose: false });

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetch.mock.calls[0][0]);
    const secondUrl = new URL(fetch.mock.calls[1][0]);
    expect(firstUrl.searchParams.get('limit')).toBe('500');
    expect(secondUrl.searchParams.get('cursor')).toBe('page2');
    expect(mockPool.end).toHaveBeenCalledOnce();
  });

  it('should handle failover', async () => {
    const { Pool } = await import('pg');
    const mockPool = new Pool();
    
    // Create fixed response without cursor to avoid infinite pagination
    const successResponse = {
      results: [
        {
          domain: "data.sfgov.org",
          country: "United States",
          agencies: [
            {
              name: "San Francisco MTA",
              type: "City Agency"
            }
          ]
        }
      ]
    };
    
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('Internal Server Error', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(successResponse), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);

    await ingestCatalog({ regions: ['US'], verbose: false });

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetch.mock.calls[0][0]);
    const secondUrl = new URL(fetch.mock.calls[1][0]);
    expect(firstUrl.hostname).toBe('api.us.socrata.com');
    expect(secondUrl.hostname).toBe('api.eu.socrata.com');
    expect(mockPool.end).toHaveBeenCalledOnce();
  });

  it('should filter by host', async () => {
    const { Pool } = await import('pg');
    const mockPool = new Pool();
    
    // Return page1 without cursor to stop pagination
    mockFetch({
      results: [
        {
          domain: "data.sfgov.org",
          country: "United States",
          agencies: [
            {
              name: "San Francisco MTA",
              type: "City Agency"
            }
          ]
        }
      ]
    });

    await ingestCatalog({ host: 'data.sfgov.org', verbose: false });

    expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('socrata_hosts'), ['data.sfgov.org', 'US']);
  });

  it('should not write to db on dry-run', async () => {
    const { Pool } = await import('pg');
    const mockPool = new Pool();
    
    // Return page1 without cursor to stop pagination
    mockFetch({
      results: [
        {
          domain: "data.sfgov.org",
          country: "United States",
          agencies: [
            {
              name: "San Francisco MTA", 
              type: "City Agency"
            }
          ]
        }
      ]
    });

    await ingestCatalog({ dryRun: true, verbose: false });

    expect(mockPool.query).not.toHaveBeenCalled();
    expect(mockPool.end).not.toHaveBeenCalled();
  });
});
