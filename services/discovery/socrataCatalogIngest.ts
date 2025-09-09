import { Pool } from 'pg';
import { getEnv } from '../../src/lib/env.js';
import { socrataDiscoveryBase, otherRegion, shouldFailover, type SocrataRegion } from '../../src/adapters/socrata/regions.js';

export interface IngestOptions {
  regions?: SocrataRegion[];
  host?: string;
  limit?: number;
  dryRun?: boolean;
  verbose?: boolean;
}

interface SocrataAgency {
  name: string;
  type: string;
}

interface SocrataDomain {
  domain: string;
  country: string;
  agencies?: SocrataAgency[];
}

async function getDbClient(): Promise<Pool> {
  const env = getEnv();
  return new Pool({
    connectionString: env.db.url,
  });
}

async function upsertHost(client: Pool, host: string, region: SocrataRegion) {
  const query = `
    INSERT INTO socrata_hosts (host, region, last_seen) VALUES ($1, $2, NOW())
    ON CONFLICT (host) DO UPDATE SET region = $2, last_seen = NOW();
  `;
  await client.query(query, [host, region]);
}

async function upsertDomain(client: Pool, domain: SocrataDomain, region: SocrataRegion) {
  const query = `
    INSERT INTO socrata_domains (domain, country, region, last_seen) VALUES ($1, $2, $3, NOW())
    ON CONFLICT (domain) DO UPDATE SET country = $2, region = $3, last_seen = NOW();
  `;
  await client.query(query, [domain.domain, domain.country, region]);
}

async function upsertAgency(client: Pool, host: string, agency: SocrataAgency) {
  const query = `
    INSERT INTO socrata_agencies (host, name, type) VALUES ($1, $2, $3)
    ON CONFLICT (host, name) DO NOTHING;
  `;
  await client.query(query, [host, agency.name, agency.type]);
}

async function fetchWithFailover(url: URL, region: SocrataRegion): Promise<Response> {
  try {
    const res = await fetch(url.toString());
    if (!shouldFailover(res.status, false)) return res;
    const failoverUrl = new URL(url.pathname, socrataDiscoveryBase(otherRegion(region)));
    failoverUrl.search = url.search;
    return await fetch(failoverUrl.toString());
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    const failoverUrl = new URL(url.pathname, socrataDiscoveryBase(otherRegion(region)));
    failoverUrl.search = url.search;
    return await fetch(failoverUrl.toString());
  }
}

async function processDomain(client: Pool | null, domain: SocrataDomain, region: SocrataRegion): Promise<void> {
  if (!client) return;
  
  await upsertHost(client, domain.domain, region);
  await upsertDomain(client, domain, region);
  
  if (domain.agencies) {
    for (const agency of domain.agencies) {
      await upsertAgency(client, domain.domain, agency);
    }
  }
}

async function fetchDomainsPage(region: SocrataRegion, cursor: string | undefined, pageSize: number) {
  const base = socrataDiscoveryBase(region);
  const url = new URL('/api/discovery/v1/domains', base);
  url.searchParams.set('limit', String(pageSize));
  if (cursor) url.searchParams.set('cursor', cursor);

  const response = await fetchWithFailover(url, region);
  return (await response.json()) as { results?: SocrataDomain[]; metadata?: { next_cursor?: string } };
}

async function ingestRegion(region: SocrataRegion, opts: IngestOptions, client: Pool | null, write: (s: string) => void): Promise<void> {
  const { host, limit = 10000 } = opts;
  
  write(`Fetching domains for region: ${region}\n`);
  let accumulated = 0;
  let cursor: string | undefined;
  const pageSize = Math.min(500, limit);

  while (accumulated < limit) {
    const data = await fetchDomainsPage(region, cursor, pageSize);

    if (!data.results || data.results.length === 0) {
      write(`No more results for region: ${region}\n`);
      break;
    }

    const domains = host ? data.results.filter(d => d.domain === host) : data.results;

    for (const domain of domains) {
      write(`Processing domain: ${domain.domain}\n`);
      await processDomain(client, domain, region);
    }

    accumulated += data.results.length;
    cursor = data.metadata?.next_cursor;
    if (!cursor) break;
  }
}

export async function ingestCatalog(opts: IngestOptions): Promise<void> {
  const { regions = ['US', 'EU'], dryRun = false } = opts;
  const client = dryRun ? null : await getDbClient();
  const write: (s: string) => void = opts?.verbose
    ? (s: string) => process.stdout.write(s)
    : () => {};

  for (const region of regions) {
    await ingestRegion(region, opts, client, write);
  }

  if (client) {
    await client.end();
  }
  write('Catalog ingest finished.\n');
}
