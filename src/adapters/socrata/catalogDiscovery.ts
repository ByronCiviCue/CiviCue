type Region = 'US' | 'EU';

function baseFor(region: Region): string {
  return region === 'EU'
    ? 'https://api.eu.socrata.com'
    : 'https://api.us.socrata.com';
}

/**
 * Iterate Socrata domains and agencies via Discovery API.
 * We deliberately collect only host/domain + agency names to compute counts.
 */
export async function* iterateDomainsAndAgencies(options: {
  regions: Region[];
  pageSize: number;
  limit?: number;
  appToken?: string;
}): AsyncGenerator<{ region: Region; host: string; domain: string; agency: string | null; meta?: unknown }> {
  const { regions, pageSize, limit, appToken } = options;
  const headers: Record<string,string> = { Accept: 'application/json' };
  if (appToken) headers['X-App-Token'] = appToken;

  // reset tick counter for this run
  tickCountRef = 0;

  for (const region of regions) {
    yield* iterateRegion(region, pageSize, headers, limit);
  }
}

function initialDomainsUrl(region: Region, pageSize: number): string {
  const base = baseFor(region);
  return `${base}/api/catalog/v1/domains?limit=${pageSize}`;
}

async function fetchDomainsPage(next: string, headers: Record<string, string>): Promise<{ results: Array<Record<string, unknown>>; nextUrl: string | null }> {
  const res = await fetch(next, { headers });
  if (!res.ok) throw new Error(`Discovery domains failed: ${res.status} ${await res.text()}`);
  const json: unknown = await res.json();
  const obj = (json && typeof json === 'object') ? (json as Record<string, unknown>) : {};
  const rawResults = obj.results;
  const results: Array<Record<string, unknown>> = Array.isArray(rawResults)
    ? rawResults.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    : [];
  const links = obj.links;
  const nextLink = (links && typeof links === 'object') ? (links as Record<string, unknown>).next : undefined;
  const nextUrl = typeof nextLink === 'string' ? nextLink : null;
  return { results, nextUrl };
}

function parseDomainRecord(rec: Record<string, unknown>): { host: string; domain: string; agencies: string[] } | null {
  const host = typeof rec.domain === 'string' ? rec.domain : (typeof rec.host === 'string' ? rec.host : '');
  if (!host) return null;
  const domain = host;
  const ag = rec.agencies;
  const agencies: string[] = Array.isArray(ag) ? ag.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  return { host, domain, agencies };
}

async function* iterateRegion(
  region: Region,
  pageSize: number,
  headers: Record<string, string>,
  limit: number | undefined
): AsyncGenerator<{ region: Region; host: string; domain: string; agency: string | null; meta?: unknown }> {
  let next: string | null = initialDomainsUrl(region, pageSize);
  while (next) {
    const { results, nextUrl } = await fetchDomainsPage(next, headers);
    for (const rec of results) {
      const parsed = parseDomainRecord(rec);
      if (!parsed) continue;
      const { host, domain, agencies } = parsed;
      for await (const row of agencyRows(region, host, domain, agencies, rec, limit)) {
        yield row;
      }
    }
    next = nextUrl;
  }
}

// Implement limit tracking without increasing cognitive complexity
let tickCountRef = 0;
function incrementAndReached(limit: number | undefined): boolean {
  tickCountRef += 1;
  return typeof limit === 'number' && tickCountRef >= limit;
}

async function* agencyRows(
  region: Region,
  host: string,
  domain: string,
  agencies: string[],
  meta: Record<string, unknown>,
  limit: number | undefined
): AsyncGenerator<{ region: Region; host: string; domain: string; agency: string | null; meta?: unknown }> {
  const toEmit: Array<string | null> = agencies.length === 0 ? [null] : agencies;
  for (const agency of toEmit) {
    if (agency === null) {
      yield { region, host, domain, agency: null, meta };
    } else {
      yield { region, host, domain, agency, meta: undefined };
    }
    if (incrementAndReached(limit)) return;
  }
}
