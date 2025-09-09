import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveSocrataRegion, REGION_US, REGION_EU, shouldFailover, clearSocrataRegionCache } from '../src/adapters/socrata/regions.js';
import { discoveryFetch } from '../src/adapters/socrata/discoveryClient.js';

describe('Socrata regions', () => {
  beforeEach(() => {
    clearSocrataRegionCache();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it('env precedence and defaults', () => {
    // global EU
    vi.stubEnv('SOCRATA_REGION', 'EU');
    expect(resolveSocrataRegion('example.com')).toBe(REGION_EU);

    // host wins
    vi.stubEnv('SOCRATA__data.sfgov.org__REGION', 'US');
    expect(resolveSocrataRegion('data.sfgov.org')).toBe(REGION_US);

    // invalid ignored; default US
    vi.stubEnv('SOCRATA_REGION', 'ASIA');
    expect(resolveSocrataRegion('another.host')).toBe(REGION_US);
  });

  it('caches per-host resolution', () => {
    vi.stubEnv('SOCRATA_REGION', 'EU');
    const first = resolveSocrataRegion('data.sfgov.org');
    expect(first).toBe(REGION_EU);

    // Now change env to US; cached result should remain EU
    vi.stubEnv('SOCRATA_REGION', 'US');
    const second = resolveSocrataRegion('data.sfgov.org');
    expect(second).toBe(REGION_EU);
  });

  it('failover rules', () => {
    expect(shouldFailover(503, false)).toBe(true);
    expect(shouldFailover(200, false)).toBe(false);
    expect(shouldFailover(401, false)).toBe(false);
    expect(shouldFailover(undefined, true)).toBe(true);
  });

  describe('discovery integration with failover', () => {
    it('503 on primary then 200 on secondary', async () => {
      vi.stubEnv('SOCRATA_REGION', 'US');
      const fetchMock = vi.spyOn(globalThis, 'fetch' as any)
        .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
        .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
      const res = await discoveryFetch('data.sfgov.org', '/api/catalog/v1?limit=1');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((fetchMock.mock.calls[0][0] as string)).toContain('api.us.socrata.com');
      expect((fetchMock.mock.calls[1][0] as string)).toContain('api.eu.socrata.com');
      expect(res.status).toBe(200);
    });

    it('401 on primary does not failover', async () => {
      vi.stubEnv('SOCRATA_REGION', 'EU');
      const fetchMock = vi.spyOn(globalThis, 'fetch' as any)
        .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
      const res = await discoveryFetch('data.sfgov.org', '/api/catalog/v1');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][0] as string)).toContain('api.eu.socrata.com');
      expect(res.status).toBe(401);
    });

    it('network error triggers single failover', async () => {
      vi.stubEnv('SOCRATA_REGION', 'US');
      const fetchMock = vi.spyOn(globalThis, 'fetch' as any)
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
      const res = await discoveryFetch('data.sfgov.org', '/api/catalog/v1');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((fetchMock.mock.calls[0][0] as string)).toContain('api.us.socrata.com');
      expect((fetchMock.mock.calls[1][0] as string)).toContain('api.eu.socrata.com');
      expect(res.status).toBe(200);
    });
  });
});
