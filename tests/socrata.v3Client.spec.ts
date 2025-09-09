import { describe, it, expect, vi } from 'vitest';
import { v3PostQuery, isV3Unavailable } from '../src/adapters/socrata/v3Client.js';
import { withCassette } from './helpers/httpCassette.js';

vi.mock('../src/lib/env-providers/socrata.js', async () => {
  const actual = await vi.importActual<any>('../src/lib/env-providers/socrata.js');
  return {
    ...actual,
    socrataHeadersFor: (host: string) => (host.includes('token') ? { 'X-App-Token': 'tok' } : {}),
  };
});

describe('v3PostQuery', () => {
  const domain = 'data.sfgov.org';
  const datasetId = 'abcd-1234';

  it('posts with proper body and headers; no auth when env missing', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await v3PostQuery({ domain, datasetId, soql: 'select id', pageNumber: 1, pageSize: 1 });
    expect(res.rows).toEqual([{ id: 1 }]);
    const [calledUrl, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(`/api/v3/views/${datasetId}/query.json`);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ query: 'select id', page: { pageNumber: 1, pageSize: 1 }, includeSynthetic: true });
    expect((init.headers as any)['Authorization']).toBeUndefined();
    fetch.mockRestore();
  });

  it('adds Basic auth when env provides keys', async () => {
    // Patch env for this test
    (process.env as any)[`SOCRATA__${domain}__V3_KEY_ID`] = 'kid';
    (process.env as any)[`SOCRATA__${domain}__V3_KEY_SECRET`] = 'ksec';
    const fetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await v3PostQuery({ domain, datasetId, soql: 'select *', pageNumber: 1, pageSize: 1 });
    const init = fetch.mock.calls[0][1] as RequestInit;
    const auth = (init.headers as any)['Authorization'];
    expect(auth).toMatch(/^Basic /);
    fetch.mockRestore();
    delete (process.env as any)[`SOCRATA__${domain}__V3_KEY_ID`];
    delete (process.env as any)[`SOCRATA__${domain}__V3_KEY_SECRET`];
  });

  it('computes nextPageNumber when page is full', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response(JSON.stringify({ data: [{}, {}] }), { status: 200 }));
    const r = await v3PostQuery({ domain, datasetId, soql: 'select *', pageNumber: 2, pageSize: 2 });
    expect(r.nextPageNumber).toBe(3);
    fetch.mockRestore();
  });

  it('v3PostAll paginates until short page and concatenates', async () => {
    const pages = [
      { data: [{ id: 1 }, { id: 2 }] },
      { data: [{ id: 3 }, { id: 4 }] },
      { data: [{ id: 5 }] },
    ];
    let call = 0;
    const fetch = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(async () => {
      const body = JSON.stringify(pages[Math.min(call, pages.length - 1)]);
      call++;
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const all = await (await import('../src/adapters/socrata/v3Client.js')).v3PostAll(domain, datasetId, { query: 'select id', pageSize: 2 });
    expect(all).toHaveLength(5);
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockRestore();
  });

  it('clamps pageSize to 1..1000 in request body', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch' as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }));

    // pageSize above max clamps to 1000
    await v3PostQuery({ domain, datasetId, soql: 'select *', pageSize: 5000 });
    let sent = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(sent.page.pageSize).toBe(1000);

    // pageSize below min clamps to 1
    await v3PostQuery({ domain, datasetId, soql: 'select *', pageSize: 0 });
    sent = JSON.parse((fetch.mock.calls[1][1] as RequestInit).body as string);
    expect(sent.page.pageSize).toBe(1);

    fetch.mockRestore();
  });

  it('supports AbortSignal and yields AbortError without partial results', async () => {
    const controller = new AbortController();
    vi.stubGlobal('fetch', ((_: string, init: any) => {
      const sig = init.signal as AbortSignal | undefined;
      if (sig?.aborted) {
        const err: any = new Error('Aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }
      // Never resolve to simulate long request; caller will abort
      return new Promise((_resolve: any, reject: any) => {
        sig?.addEventListener('abort', () => {
          const err: any = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    }) as any);
    const p = v3PostQuery({ domain, datasetId, soql: 'select *' }, controller.signal);
    controller.abort();
    await expect(p).rejects.toHaveProperty('name', 'AbortError');
    vi.unstubAllGlobals();
  });

  it('never leaks secrets in errors', async () => {
    const kid = 'myKeyId';
    const ksec = 'mySecret';
    (process.env as any)[`SOCRATA__${domain}__V3_KEY_ID`] = kid;
    (process.env as any)[`SOCRATA__${domain}__V3_KEY_SECRET`] = ksec;
    const fetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const p = v3PostQuery({ domain, datasetId, soql: 'select *' });
    await expect(p).rejects.toMatchObject({ error: { kind: 'HttpError', status: 403 } });
    try { await p; } catch (e: any) {
      const s = JSON.stringify(e);
      const basic = Buffer.from(`${kid}:${ksec}`).toString('base64');
      expect(s).not.toContain(kid);
      expect(s).not.toContain(ksec);
      expect(s).not.toContain(basic);
    }
    fetch.mockRestore();
    delete (process.env as any)[`SOCRATA__${domain}__V3_KEY_ID`];
    delete (process.env as any)[`SOCRATA__${domain}__V3_KEY_SECRET`];
  });

  it('flags v3 unavailable errors for graceful fallback', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const p = v3PostQuery({ domain, datasetId, soql: 'select *' });
    await expect(p).rejects.toMatchObject({ error: { kind: 'HttpError', status: 403 } });
    try { await p; } catch (e) { expect(isV3Unavailable(e)).toBe(true); }
    fetch.mockRestore();
  });

  it('replays a basic v3 POST page via cassette', async () => {
    const result = await withCassette('v3-client-basic', async () => {
      const r = await v3PostQuery({ domain: 'data.cassette.test', datasetId: 'abcd-1234', soql: 'select id' });
      return r.rows;
    }, { mode: 'replay' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(3);
    for (const row of result as any[]) {
      expect(row).toHaveProperty('id');
    }
    // Stable-field checks to avoid snapshot brittleness
    const ids = (result as any[]).map(r => r.id);
    expect(ids).toEqual([1, 2, 3]);
  });
});
