import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
// Stub env provider to avoid loading real env logic; tests will override as needed
vi.mock('../src/lib/env-providers/socrata.js', () => ({
  socrataHeadersFor: vi.fn(() => ({})),
}));
import { SocrataRowClient } from '../src/adapters/socrata/rowsClient.js';
import { calculateBackoffDelay, parseRetryAfter } from '../src/adapters/socrata/http.js';
import { SocrataClientErrorImpl } from '../src/adapters/socrata/types.js';
import * as socrataProviders from '../src/lib/env-providers/socrata.js';

describe('SocrataRowClient', () => {
  let fetchSpy: any;
  let headersSpy: any;

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['setTimeout','setInterval','Date'], shouldAdvanceTime: false });
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    headersSpy = vi.spyOn(socrataProviders, 'socrataHeadersFor');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  describe('URL assembly and parameter encoding', () => {
    it('should build correct URL with dataset ID and default parameters', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      await client.fetchPage();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://data.sfgov.org/resource/abc-123.json?%24limit=1000&%24offset=0',
        expect.any(Object)
      );
    });

    it('should encode SoQL parameters correctly', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

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
      expect(fetchSpy).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });

    it('should include extra parameters', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        extra: {
          '$group': 'category',
          'custom_param': 'value'
        }
      });

      await client.fetchPage();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('%24group=category'),
        expect.any(Object)
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('custom_param=value'),
        expect.any(Object)
      );
    });

    it('should clamp limit to [1, 1000]', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));

      // Test lower bound
      const client1 = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        limit: -5
      });
      await client1.fetchPage();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('%24limit=1'),
        expect.any(Object)
      );

      fetchSpy.mockClear();

      // Test upper bound
      const client2 = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        limit: 5000
      });
      await client2.fetchPage();
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('%24limit=1000'),
        expect.any(Object)
      );
    });
  });

  describe('token header injection', () => {
    it('should include X-App-Token when env has token for host', async () => {
      headersSpy.mockReturnValue({ 'X-App-Token': 'test-token-123' });
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      await client.fetchPage();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        {
          headers: {
            Accept: 'application/json',
            'X-App-Token': 'test-token-123'
          }
        }
      );
    });

    it('should not include X-App-Token when no token configured', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      await client.fetchPage();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        {
          headers: {
            Accept: 'application/json'
          }
        }
      );
    });
  });

  describe('pagination', () => {
    it('should fetch multiple pages correctly', async () => {
      headersSpy.mockReturnValue({});
      
      // Page 1: 3 rows
      fetchSpy.mockResolvedValueOnce(new Response('[{"id":"1"},{"id":"2"},{"id":"3"}]', { status: 200 }));
      // Page 2: 3 rows  
      fetchSpy.mockResolvedValueOnce(new Response('[{"id":"4"},{"id":"5"},{"id":"6"}]', { status: 200 }));
      // Page 3: 1 row (less than limit, signals end)
      fetchSpy.mockResolvedValueOnce(new Response('[{"id":"7"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        limit: 3
      });

      const result = await client.fetchAll();

      expect(result).toHaveLength(7);
      expect(result[0]).toEqual({ id: '1' });
      expect(result[6]).toEqual({ id: '7' });
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should respect maxRows cap', async () => {
      headersSpy.mockReturnValue({});
      
      // Page 1: 3 rows
      fetchSpy.mockResolvedValueOnce(new Response('[{"id":"1"},{"id":"2"},{"id":"3"}]', { status: 200 }));
      // Page 2: 3 rows (but should be limited by maxRows)  
      fetchSpy.mockResolvedValueOnce(new Response('[{"id":"4"},{"id":"5"},{"id":"6"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        limit: 3,
        maxRows: 5
      });

      const result = await client.fetchAll();

      expect(result).toHaveLength(5);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle empty pages correctly', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      const result = await client.fetchAll();

      expect(result).toHaveLength(0);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('retry and backoff', () => {
    it('should retry on 429 with Retry-After integer seconds', async () => {
      headersSpy.mockReturnValue({});
      
      // First call: 429 with Retry-After
      const retryResponse = new Response('Rate Limited', { 
        status: 429,
        headers: { 'Retry-After': '2' }
      });
      Object.defineProperty(retryResponse, 'url', { value: 'https://test.com' });
      
      // Second call: success
      const successResponse = new Response('[{"id":"123"}]', { status: 200 });
      
      fetchSpy.mockResolvedValueOnce(retryResponse);
      fetchSpy.mockResolvedValueOnce(successResponse);

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        retries: 2,
        retryBaseMs: 100
      });

      const p = client.fetchPage();
      await vi.runAllTimersAsync();
      const result = await p;

      expect(result.rows).toEqual([{ id: '123' }]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should retry on 429 with Retry-After RFC-7231 date', async () => {
      headersSpy.mockReturnValue({});
      
      // First call: 429 with Retry-After date (1.5 seconds from system time)
      const futureDate = new Date('2025-01-01T00:00:01.500Z').toUTCString();
      const retryResponse = new Response('Rate Limited', { 
        status: 429,
        headers: { 'Retry-After': futureDate }
      });
      Object.defineProperty(retryResponse, 'url', { value: 'https://test.com' });
      
      // Second call: success
      const successResponse = new Response('[{"id":"123"}]', { status: 200 });
      
      fetchSpy.mockResolvedValueOnce(retryResponse);
      fetchSpy.mockResolvedValueOnce(successResponse);

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        retries: 2
      });

      const p = client.fetchPage();
      await vi.runAllTimersAsync();
      const result = await p;

      expect(result.rows).toEqual([{ id: '123' }]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx errors with exponential backoff', async () => {
      headersSpy.mockReturnValue({});
      
      // First call: 500 error
      const errorResponse1 = new Response('Server Error', { status: 500 });
      Object.defineProperty(errorResponse1, 'url', { value: 'https://test.com' });
      
      // Second call: 502 error
      const errorResponse2 = new Response('Bad Gateway', { status: 502 });
      Object.defineProperty(errorResponse2, 'url', { value: 'https://test.com' });
      
      // Third call: success
      const successResponse = new Response('[{"id":"123"}]', { status: 200 });
      
      fetchSpy.mockResolvedValueOnce(errorResponse1);
      fetchSpy.mockResolvedValueOnce(errorResponse2);
      fetchSpy.mockResolvedValueOnce(successResponse);

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        retries: 3,
        retryBaseMs: 50
      });

      const p = client.fetchPage();
      await vi.runAllTimersAsync();
      const result = await p;

      expect(result.rows).toEqual([{ id: '123' }]);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should throw RetryExhausted when all retries fail', async () => {
      headersSpy.mockReturnValue({});
      
      const errorResponse = new Response('Server Error', { status: 500 });
      Object.defineProperty(errorResponse, 'url', { value: 'https://data.sfgov.org/resource/abc-123.json' });
      
      fetchSpy.mockResolvedValue(errorResponse);

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        retries: 2
      });

      const p = client.fetchPage();
      await vi.runAllTimersAsync();
      await expect(p).rejects.toMatchObject({
        error: { kind: 'RetryExhausted', attempts: 3 }
      });
      
      expect(fetchSpy).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('error types', () => {
    it('should throw HttpError for 404 responses', async () => {
      headersSpy.mockReturnValue({});
      
      const errorResponse = new Response('Not Found', { status: 404 });
      Object.defineProperty(errorResponse, 'url', { value: 'https://data.sfgov.org/resource/abc-123.json' });
      
      fetchSpy.mockResolvedValue(errorResponse);

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      await expect(client.fetchPage()).rejects.toMatchObject({
        error: { kind: 'HttpError', status: 404, url: expect.stringContaining('abc-123.json') }
      });
    });

    it('should throw NetworkError for fetch failures', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockRejectedValue(new Error('Network failure'));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        retries: 1
      });

      await expect(client.fetchPage()).rejects.toMatchObject({
        error: { kind: 'RetryExhausted' }
      });
    });
  });

  describe('concurrency safety', () => {
    it('should handle concurrent fetchAll calls independently', async () => {
      headersSpy.mockReturnValue({});
      
      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        // Simulate different response data for each call to verify independence
        const data = [{ id: `call-${callCount}`, value: callCount }];
        return new Response(JSON.stringify(data), { status: 200 });
      });

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123',
        limit: 1
      });

      // Run two fetchAll calls concurrently
      const [result1, result2] = await Promise.all([
        client.fetchAll(),
        client.fetchAll()
      ]);

      // Verify they got independent results
      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
      expect(result1[0]).not.toEqual(result2[0]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('utility functions', () => {
    describe('calculateBackoffDelay', () => {
      it('should calculate exponential backoff with jitter', () => {
        const delay1 = calculateBackoffDelay(0, 100);
        const delay2 = calculateBackoffDelay(1, 100);
        const delay3 = calculateBackoffDelay(2, 100);

        // Base exponential component
        expect(delay1).toBeGreaterThanOrEqual(100); // 100 * 2^0 + jitter (0-100)
        expect(delay1).toBeLessThan(200);

        expect(delay2).toBeGreaterThanOrEqual(200); // 100 * 2^1 + jitter (0-100)
        expect(delay2).toBeLessThan(300);

        expect(delay3).toBeGreaterThanOrEqual(400); // 100 * 2^2 + jitter (0-100)
        expect(delay3).toBeLessThan(500);
      });
    });

    describe('parseRetryAfter', () => {
      it('should parse integer seconds', () => {
        expect(parseRetryAfter('5')).toBe(5000);
        expect(parseRetryAfter('30')).toBe(30000);
        expect(parseRetryAfter('60')).toBe(30000); // Capped at 30s
      });

      it('should parse RFC-7231 dates with deterministic time', () => {
        const futureDate = new Date('2025-01-01T00:00:05Z'); // 5 seconds from system time
        const result = parseRetryAfter(futureDate.toUTCString());
        expect(result).toBe(5000); // Should be 5000ms
      });

      it('should return undefined for invalid values', () => {
        expect(parseRetryAfter('invalid')).toBeUndefined();
        expect(parseRetryAfter('')).toBeUndefined();
      });

      it('should cap delays at 30 seconds', () => {
        expect(parseRetryAfter('60')).toBe(30000);
        const distantFuture = new Date('2025-01-01T00:01:00Z'); // 60 seconds from system time
        expect(parseRetryAfter(distantFuture.toUTCString())).toBe(30000);
      });
    });
  });

  describe('no console output verification', () => {
    let consoleLogSpy: any;
    let consoleWarnSpy: any;
    let consoleErrorSpy: any;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should not log to console during normal operations', async () => {
      headersSpy.mockReturnValue({});
      fetchSpy.mockResolvedValue(new Response('[{"id":"123"}]', { status: 200 }));

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      await client.fetchAll();

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should not log to console during error conditions', async () => {
      headersSpy.mockReturnValue({});
      const errorResponse = new Response('Not Found', { status: 404 });
      Object.defineProperty(errorResponse, 'url', { value: 'https://test.com' });
      fetchSpy.mockResolvedValue(errorResponse);

      const client = new SocrataRowClient({
        domain: 'data.sfgov.org',
        datasetId: 'abc-123'
      });

      try {
        await client.fetchPage();
      } catch {
        // Expected error
      }

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
