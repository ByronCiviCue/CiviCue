import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';

vi.mock('../src/lib/env-providers/socrata.js', () => ({
  socrataHeadersFor: () => ({ 'X-App-Token': 'test-token' }),
}));

import { SocrataRowClient } from '../src/adapters/socrata/rowsClient.js';
import { calculateBackoffDelay, parseRetryAfter } from '../src/adapters/socrata/http.js';
import { freezeTime, advance, restoreTime } from './_helpers/time.js';
import { rfc7231Date } from './_helpers/http.js';

describe('SocrataRowClient', () => {
  beforeAll(() => { freezeTime(); });
  afterEach(() => { vi.clearAllTimers(); vi.clearAllMocks(); });
  afterAll(() => { restoreTime(); });

  const mockFetch = (response: any, options: ResponseInit = { status: 200 }) => {
    const body = typeof response === 'string' ? response : JSON.stringify(response);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(body, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers }
    })));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  describe('URL assembly and parameter encoding', () => {
    it('should build correct URL with dataset ID and default parameters', async () => {
      const fetch = mockFetch([{ id: '123' }]);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123' });
      await client.fetchPage();
      expect(fetch).toHaveBeenCalledWith(
        'https://data.sfgov.org/resource/abc-123.json?%24limit=1000&%24offset=0',
        expect.any(Object)
      );
    });

    it('should encode SoQL parameters correctly', async () => {
      const fetch = mockFetch([{ id: '123' }]);
      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        limit: 500,
        where: 'status = "APPROVED"',
        order: 'date DESC',
        select: 'id,name,status'
      });
      await client.fetchPage(50);
      const expectedUrl = 'https://data.sfgov.org/resource/abc-123.json?%24limit=500&%24offset=50&%24where=status+%3D+%22APPROVED%22&%24order=date+DESC&%24select=id%2Cname%2Cstatus';
      expect(fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    it('should include extra parameters', async () => {
      const fetch = mockFetch([{ id: '123' }]);
      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        extra: { '$group': 'category', 'custom_param': 'value' }
      });
      await client.fetchPage();
      expect(fetch.mock.calls[0][0]).toContain('%24group=category');
      expect(fetch.mock.calls[0][0]).toContain('custom_param=value');
    });

    it('should clamp limit to [1, 1000]', async () => {
      const fetch = mockFetch([]);
      const client1 = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', limit: -5 });
      await client1.fetchPage();
      expect(fetch.mock.calls[0][0]).toContain('%24limit=1');

      const client2 = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', limit: 5000 });
      await client2.fetchPage();
      expect(fetch.mock.calls[1][0]).toContain('%24limit=1000');
    });
  });

  describe('token header injection', () => {
    it('should include X-App-Token from mock', async () => {
      const fetch = mockFetch([{ id: '123' }]);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123' });
      await client.fetchPage();
      expect(fetch).toHaveBeenCalledWith(expect.any(String), {
        headers: { Accept: 'application/json', 'X-App-Token': 'test-token' }
      });
    });
  });

  describe('pagination', () => {
    it('should fetch multiple pages correctly', async () => {
      const pages = [
        JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]),
        JSON.stringify([{ id: 4 }, { id: 5 }, { id: 6 }]),
        JSON.stringify([{ id: 7 }]),
      ];
      let call = 0;
      const fetch = vi.fn(async () => {
        const body = pages[Math.min(call, pages.length - 1)];
        call++;
        return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
      });
      vi.stubGlobal('fetch', fetch);

      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', limit: 3 });
      const result = await client.fetchAll();

      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ id: 1 });
      expect(result[6]).toEqual({ id: 7 });
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should respect maxRows cap', async () => {
      const fetch = mockFetch([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', limit: 3, maxRows: 5 });
      const result = await client.fetchAll();
      expect(result).toHaveLength(5);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle empty pages correctly', async () => {
      const fetch = mockFetch([]);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123' });
      const result = await client.fetchAll();
      expect(result).toHaveLength(0);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry and backoff', () => {
    it('should retry on 429 with Retry-After integer seconds', async () => {
      const fetch = vi.fn()
        .mockResolvedValueOnce(new Response('Rate Limited', { status: 429, headers: { 'Retry-After': '2' } }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '123' }]), { status: 200 }));
      vi.stubGlobal('fetch', fetch);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', retries: 2 });
      const p = client.fetchPage();
      await advance(2000);
      const result = await p;
      expect(result.rows).toMatchObject([{ id: '123' }]);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 with Retry-After RFC-7231 date', async () => {
      const header = rfc7231Date(Date.now() + 1500);

      const fetch = vi.fn()
        .mockResolvedValueOnce(new Response('Rate Limited', { status: 429, headers: { 'Retry-After': header } }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '123' }]), { status: 200, headers: { 'content-type': 'application/json' } }));
      vi.stubGlobal('fetch', fetch);

      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', retries: 2 });
      const p = client.fetchPage();

      await advance(1600); // header delay + epsilon
      const result = await p;

      expect(result.rows).toMatchObject([{ id: '123' }]);
      expect(fetch).toHaveBeenCalledTimes(2);
    }, 10000);

    it('should retry on 5xx errors with exponential backoff', async () => {
      const fetch = vi.fn()
        .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
        .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
        .mockResolvedValueOnce(new Response(JSON.stringify([{ id: '123' }]), { status: 200 }));
      vi.stubGlobal('fetch', fetch);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', retries: 3, retryBaseMs: 50 });
      const p = client.fetchPage();
      await advance(1000);
      const result = await p;
      expect(result.rows).toMatchObject([{ id: '123' }]);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should throw RetryExhausted when all retries fail', async () => {
      const fetch = mockFetch('Server Error', { status: 500 });
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', retries: 2, retryBaseMs: 10 });
      const p = client.fetchPage();
      const rejection = expect(p).rejects.toMatchObject({ error: { kind: 'RetryExhausted' }});
      await advance(35000);
      await rejection;
      expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('error types', () => {
    it('should throw immediately for 400 without retries', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response('Bad Request', { status: 400 }));
      vi.stubGlobal('fetch', fetch);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', retries: 3 });
      await expect(client.fetchPage()).rejects.toMatchObject({ error: { kind: 'HttpError', status: 400 } });
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('should throw HttpError for 404 responses', async () => {
      mockFetch('Not Found', { status: 404 });
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123' });
      await expect(client.fetchPage()).rejects.toMatchObject({ error: { kind: 'HttpError', status: 404 } });
    });

    it('should throw RetryExhausted for fetch failures', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('Network failure'));
      vi.stubGlobal('fetch', fetch);
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123', retries: 1, retryBaseMs: 10 });
      const p = client.fetchPage();
      const rejection = expect(p).rejects.toMatchObject({ error: { kind: 'RetryExhausted' }});
      await advance(35000);
      await rejection;
    });
  });

  describe('utility functions', () => {
    describe('calculateBackoffDelay', () => {
      it('should calculate exponential backoff with jitter', () => {
        const delay1 = calculateBackoffDelay(0, 100);
        expect(delay1).toBeGreaterThanOrEqual(100);
        expect(delay1).toBeLessThan(200);
      });
    });

    describe('parseRetryAfter', () => {
      // Reset system time before each test to ensure deterministic deltas
      beforeEach(() => {
        vi.setSystemTime(new Date(Date.UTC(2025, 0, 1, 0, 0, 0)));
      });
      it('should parse integer seconds', () => {
        expect(parseRetryAfter('5')).toBe(5000);
      });
      it('should parse RFC-7231 dates with deterministic time', () => {
        // Test suite sets fake timers and system time in beforeAll.
        const header = new Date(Date.now() + 5000).toUTCString(); // RFC-7231 HTTP-date
        expect(parseRetryAfter(header)).toBe(5000);
      });
      it('should return undefined for invalid values', () => {
        expect(parseRetryAfter('invalid')).toBeUndefined();
      });
      it('should cap delays at 30 seconds', () => {
        expect(parseRetryAfter('60')).toBe(30000);
      });
    });
  });

  describe('no console output verification', () => {
    let consoleErrorSpy: any;
    beforeAll(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterAll(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should not log errors during normal or error conditions', async () => {
      mockFetch('Not Found', { status: 404 });
      const client = new SocrataRowClient({ domain: 'data.sfgov.org', datasetId: 'abc-123' });
      await expect(client.fetchPage()).rejects.toBeDefined();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
