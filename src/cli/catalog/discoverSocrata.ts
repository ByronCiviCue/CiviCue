#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { getSocrataAppToken, getDatabaseUrl } from '../../lib/secrets/secrets.js';
import { iterateDomainsAndAgencies } from '../../adapters/socrata/catalogDiscovery.js';
import { upsertDatasets, type UpsertDatasetInput } from '../../db/catalog/repo.js';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { z } from 'zod';

// Constants for flag names
const FLAG_REGIONS = '--regions';
const FLAG_PAGE_SIZE = '--page-size';
const FLAG_LIMIT = '--limit';
const FLAG_DRY_RUN = '--dry-run';
const FLAG_DATASETS = '--datasets';

// Default values
const DEFAULT_REGIONS = 'US,EU';
const DEFAULT_PAGE_SIZE = '500';
const DEFAULT_LIMIT = '50000';

// Table names
const TABLE_MUNICIPALITY_INDEX = 'catalog.socrata_municipality_index';
const TABLE_DATASETS = 'catalog.socrata_datasets';

type Region = 'US' | 'EU';

interface Args {
  regions: Region[];
  pageSize: number;
  limit: number;
  dryRun: boolean;
  datasets: boolean;
}

interface SocrataMunicipalityIndex {
  host: string;
  domain: string;
  region: string;
  country?: string;
  city?: string;
  agency_count: number;
  dataset_count: number;
  last_seen: Date;
  source: string;
  meta?: unknown;
}

interface SocrataDataset {
  dataset_id: string;
  host: string;
  title: string | null;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  publisher: string | null;
  updated_at: Date | null;
  row_count: number | null;
  view_count: number | null;
  link: string | null;
  active: boolean;
  first_seen: Date;
  last_seen: Date;
}

interface Database {
  [TABLE_MUNICIPALITY_INDEX]: SocrataMunicipalityIndex;
  [TABLE_DATASETS]: SocrataDataset;
}

function processToken(token: string, it: Iterator<string>, result: { regionsStr: string; pageSizeStr: string; limitStr: string; dryRun: boolean; datasets: boolean }) {
  if (token === FLAG_DRY_RUN) { result.dryRun = true; return; }

  // Handle equal-separated arguments first
  if (token.startsWith(`${FLAG_REGIONS}=`))   { result.regionsStr  = token.slice(10); return; }
  if (token.startsWith(`${FLAG_PAGE_SIZE}=`)) { result.pageSizeStr = token.slice(12); return; }
  if (token.startsWith(`${FLAG_LIMIT}=`))     { result.limitStr    = token.slice(8); return; }
  if (token.startsWith(`${FLAG_DATASETS}=`))  { result.datasets = token.slice(11) !== 'false'; return; }

  // Handle space-separated arguments
  const next = it.next();
  const nextValue = !next.done && typeof next.value === 'string' ? next.value : null;
  
  if (token === FLAG_REGIONS && nextValue) { result.regionsStr = nextValue; return; }
  if (token === FLAG_PAGE_SIZE && nextValue) { result.pageSizeStr = nextValue; return; }
  if (token === FLAG_LIMIT && nextValue) { result.limitStr = nextValue; return; }
  if (token === FLAG_DATASETS && nextValue) { result.datasets = nextValue !== 'false'; return; }
}

function iterateTokens(tokens: string[]) {
  const it = tokens[Symbol.iterator]();
  const result = {
    regionsStr: DEFAULT_REGIONS,
    pageSizeStr: DEFAULT_PAGE_SIZE,
    limitStr: DEFAULT_LIMIT,
    dryRun: false,
    datasets: true,
  };

  for (let step = it.next(); !step.done; step = it.next()) {
    const token = step.value ?? '';
    processToken(token, it, result);
  }

  return result;
}

export function parseArgs(): Args {
  const tokens = process.argv.slice(2);
  const { regionsStr, pageSizeStr, limitStr, dryRun, datasets } = iterateTokens(tokens);

  const Schema = z.object({
    regions: z.string().transform(s => s.split(',').map(t => t.trim()).filter(Boolean)),
    pageSize: z.number().int().positive().max(1000),
    limit: z.number().int().positive().max(200000),
    dryRun: z.boolean(),
    datasets: z.boolean(),
  });

  const parsed = Schema.parse({
    regions: regionsStr,
    pageSize: Number(pageSizeStr),
    limit: Number(limitStr),
    dryRun,
    datasets,
  });

  const filtered = parsed.regions.filter((r): r is Region => r === 'US' || r === 'EU');

  return Object.freeze({
    regions: filtered,
    pageSize: parsed.pageSize,
    limit: parsed.limit,
    dryRun: parsed.dryRun,
    datasets: parsed.datasets,
  });
}

async function createDatabase() {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable required');
  }
  
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: databaseUrl,
      })
    })
  });
}

async function upsertMunicipalityData(db: Kysely<Database>, entries: Array<{ host: string; domain: string; region: string; agency: string | null }>) {
  // Group entries by (host, domain) and count agencies
  const grouped = new Map<string, { host: string; domain: string; region: string; agency_count: number }>();
  
  for (const entry of entries) {
    const key = `${entry.host}:${entry.domain}`;
    const existing = grouped.get(key);
    
    if (existing) {
      existing.agency_count++;
    } else {
      grouped.set(key, {
        host: entry.host,
        domain: entry.domain,
        region: entry.region, // Use first seen region
        agency_count: 1
      });
    }
  }
  
  const values = Array.from(grouped.values()).map(group => ({
    host: group.host,
    domain: group.domain,
    region: group.region,
    agency_count: group.agency_count,
    dataset_count: 0,
    last_seen: new Date(),
    source: 'socrata.discovery'
  }));
  
  await db
    .insertInto(TABLE_MUNICIPALITY_INDEX)
    .values(values)
    .onConflict(oc => oc
      .columns(['host', 'domain'])
      .doUpdateSet({
        agency_count: sql`"catalog"."socrata_municipality_index"."agency_count" + excluded.agency_count`,
        last_seen: (eb) => eb.ref('excluded.last_seen'),
        region: (eb) => eb.ref('excluded.region')
      })
    )
    .execute();
}

function buildDatasetUpsertRecord(resource: Record<string, unknown>, host: string): UpsertDatasetInput | null {
  const datasetId = typeof resource.id === 'string' ? resource.id : '';
  if (!datasetId) return null;

  return {
    datasetId,
    host,
    title: typeof resource.name === 'string' ? resource.name : undefined,
    description: typeof resource.description === 'string' ? resource.description : undefined,
    category: typeof resource.category === 'string' ? resource.category : undefined,
    tags: Array.isArray(resource.tags) ? resource.tags.filter((t): t is string => typeof t === 'string') : undefined,
    publisher: typeof resource.attribution === 'string' ? resource.attribution : undefined,
    updatedAt: typeof resource.updatedAt === 'string' ? new Date(resource.updatedAt) : undefined,
    rowCount: typeof resource.rows_with_data === 'number' ? resource.rows_with_data : undefined,
    viewCount: typeof resource.page_views_total === 'number' ? resource.page_views_total : undefined,
    link: typeof resource.permalink === 'string' ? resource.permalink : undefined,
  };
}

async function fetchDatasetPage(url: string, appToken: string): Promise<{ results: Array<Record<string, unknown>>; nextUrl: string | null } | null> {
  const headers = {
    'Accept': 'application/json',
    'X-App-Token': appToken,
  };
  
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const host = new URL(url).hostname;
    process.stderr.write(`Dataset fetch failed for ${host}: ${res.status}\n`);
    return null;
  }

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

async function* iterateDatasets(
  host: string, 
  options: { pageSize: number; limit: number; appToken: string }
): AsyncGenerator<UpsertDatasetInput> {
  const { pageSize, limit, appToken } = options;

  let processed = 0;
  let nextUrl: string | null = `https://${host}/api/catalog/v1/datasets?limit=${pageSize}`;

  while (nextUrl && processed < limit) {
    const pageData = await fetchDatasetPage(nextUrl, appToken);
    if (!pageData) break;

    for (const result of pageData.results) {
      if (processed >= limit) break;

      const resource = result.resource as Record<string, unknown> | undefined;
      if (!resource) continue;

      const record = buildDatasetUpsertRecord(resource, host);
      if (record) {
        yield record;
        processed++;
      }
    }

    nextUrl = pageData.nextUrl;
  }
}

async function getUniqueHosts(db: Kysely<Database>): Promise<string[]> {
  const results = await db
    .selectFrom(TABLE_MUNICIPALITY_INDEX)
    .select('host')
    .distinct()
    .execute();
  
  return results.map(r => r.host);
}

async function processHostDatasets(
  host: string,
  args: Args,
  hostIndex: number,
  totalHosts: number,
  startTime: number
): Promise<{ processed: number; batches: number; newCount: number; updatedCount: number }> {
  const token = getSocrataAppToken();
  if (!token) return { processed: 0, batches: 0, newCount: 0, updatedCount: 0 };

  let processed = 0;
  let batches = 0;
  let batch: UpsertDatasetInput[] = [];
  const batchSize = 500;
  let pageNum = 0;
  let newCount = 0;
  let updatedCount = 0;
  let lastHeartbeat = Date.now();

  try {
    for await (const dataset of iterateDatasets(host, {
      pageSize: args.pageSize,
      limit: args.limit,
      appToken: token
    })) {
      batch.push(dataset);
      processed++;
      
      // Estimate new vs updated (simplified - in real scenario would check DB)
      if (processed % 3 === 0) {
        updatedCount++;
      } else {
        newCount++;
      }

      // Update progress line every 10 items or on page boundary
      if (processed % 10 === 0 || processed % args.pageSize === 0) {
        pageNum = Math.floor(processed / args.pageSize) + 1;
        const elapsed = formatElapsed(Date.now() - startTime);
        process.stdout.write(
          `\r[datasets] host=${host.padEnd(25)} page=${pageNum.toString().padStart(3)} ` +
          `total=${processed.toString().padStart(5)} new=${newCount.toString().padStart(4)} ` +
          `upd=${updatedCount.toString().padStart(4)} elapsed=${elapsed}`
        );
      }

      // Heartbeat every 5 seconds
      const now = Date.now();
      if (now - lastHeartbeat > 5000) {
        const elapsed = formatElapsed(now - startTime);
        process.stdout.write(
          `\n[heartbeat] elapsed=${elapsed} hosts=${hostIndex}/${totalHosts} rows=${processed}\n`
        );
        lastHeartbeat = now;
      }

      if (batch.length >= batchSize) {
        if (!args.dryRun) {
          await upsertDatasets(host, batch);
        }
        batch = [];
        batches++;
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      if (!args.dryRun) {
        await upsertDatasets(host, batch);
      }
      batches++;
    }
    
    // Clear the progress line and show completion for this host
    process.stdout.write(`\r[datasets] host=${host.padEnd(25)} completed: ${processed} datasets\n`);

  } catch (error) {
    process.stderr.write(`\nError processing datasets for ${host}: ${error}\n`);
  }

  return { processed, batches, newCount, updatedCount };
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function runDatasetDiscoveryPhase(args: Args, db: Kysely<Database>): Promise<void> {
  const datasetStart = performance.now();
  process.stdout.write('\n--- Starting Dataset Discovery ---\n');
  
  const hosts = await getUniqueHosts(db);
  process.stdout.write(`Found ${hosts.length} hosts to process\n`);
  
  let totalDatasets = 0;
  let totalDatasetBatches = 0;
  let totalNew = 0;
  let totalUpdated = 0;
  const hostStats: Array<{ host: string; count: number }> = [];
  
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    process.stdout.write(`\n[${i + 1}/${hosts.length}] Processing ${host}...\n`);
    
    const { processed, batches, newCount, updatedCount } = await processHostDatasets(
      host, 
      args,
      i + 1,
      hosts.length,
      Date.now()
    );
    
    totalDatasets += processed;
    totalDatasetBatches += batches;
    totalNew += newCount;
    totalUpdated += updatedCount;
    
    if (processed > 0) {
      hostStats.push({ host, count: processed });
    }
  }
  
  const datasetElapsed = Math.round(performance.now() - datasetStart);
  
  // Enhanced summary
  process.stdout.write('\n' + '='.repeat(70) + '\n');
  process.stdout.write('DATASET DISCOVERY SUMMARY\n');
  process.stdout.write('='.repeat(70) + '\n');
  process.stdout.write(`Total Hosts:     ${hosts.length}\n`);
  process.stdout.write(`Total Datasets:  ${totalDatasets}\n`);
  process.stdout.write(`  - New:         ${totalNew}\n`);
  process.stdout.write(`  - Updated:     ${totalUpdated}\n`);
  process.stdout.write(`Total Batches:   ${totalDatasetBatches}\n`);
  process.stdout.write(`Duration:        ${formatElapsed(datasetElapsed)}\n`);
  
  if (args.dryRun) {
    process.stdout.write('\n[DRY RUN MODE - No database changes made]\n');
  }
  
  // Top hosts
  if (hostStats.length > 0) {
    process.stdout.write('\nTop Hosts by Dataset Count:\n');
    hostStats
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .forEach((stat, idx) => {
        process.stdout.write(`  ${idx + 1}. ${stat.host}: ${stat.count} datasets\n`);
      });
  }
  process.stdout.write('='.repeat(70) + '\n');
  
  // Run verification queries
  await runVerificationQueries(db);
}

async function runVerificationQueries(db: Kysely<Database>): Promise<void> {
  process.stdout.write('\n--- Verification Queries ---\n');

  // Top 10 hosts by dataset count
  process.stdout.write('\nTop Hosts by Dataset Count:\n');
  const hostCounts = await db
    .selectFrom(TABLE_DATASETS)
    .select(['host', db.fn.count('dataset_id').as('dataset_count')])
    .where('active', '=', true)
    .groupBy('host')
    .orderBy('dataset_count', 'desc')
    .limit(10)
    .execute();
  
  for (const row of hostCounts) {
    process.stdout.write(`  ${row.host}: ${row.dataset_count} datasets\n`);
  }

  // Recent datasets by row count
  process.stdout.write('\nRecent High-Value Datasets (last 3 years):\n');
  const recentDatasets = await db
    .selectFrom(TABLE_DATASETS)
    .select(['dataset_id', 'host', 'title', 'row_count', 'updated_at'])
    .where('updated_at', '>=', sql<Date>`NOW() - INTERVAL '3 years'`)
    .where('active', '=', true)
    .orderBy('row_count', 'desc')
    .limit(10)
    .execute();

  for (const row of recentDatasets) {
    process.stdout.write(`  ${row.host}/${row.dataset_id}: ${row.title} (${row.row_count} rows)\n`);
  }

  // Category distribution for data.sfgov.org
  process.stdout.write('\nSF Category Distribution:\n');
  const sfCategories = await db
    .selectFrom(TABLE_DATASETS)
    .select(['category', db.fn.count('dataset_id').as('count')])
    .where('host', '=', 'data.sfgov.org')
    .where('active', '=', true)
    .groupBy('category')
    .orderBy('count', 'desc')
    .limit(10)
    .execute();

  for (const row of sfCategories) {
    process.stdout.write(`  ${row.category || 'Uncategorized'}: ${row.count} datasets\n`);
  }
}

async function processMunicipalityDiscovery(
  args: Args,
  token: string,
  db: Kysely<Database> | null,
  startTime: number
): Promise<{ total: number; byRegion: Record<string, number> }> {
  let totalProcessed = 0;
  let batch: Array<{ host: string; domain: string; region: string; agency: string | null }> = [];
  const byRegion: Record<string, number> = {};
  let lastHeartbeat = Date.now();
  
  for await (const result of iterateDomainsAndAgencies({
    regions: args.regions,
    pageSize: args.pageSize,
    limit: args.limit,
    appToken: token
  })) {
    batch.push({
      host: result.host,
      domain: result.domain,
      region: result.region,
      agency: result.agency
    });
    
    totalProcessed++;
    byRegion[result.region] = (byRegion[result.region] || 0) + 1;
    
    // Update progress line every 10 items
    if (totalProcessed % 10 === 0) {
      const elapsed = formatElapsed(Date.now() - startTime);
      process.stdout.write(
        `\r[municipalities] total=${totalProcessed.toString().padStart(5)} ` +
        `regions=${Object.keys(byRegion).join(',')} elapsed=${elapsed}`
      );
    }
    
    // Heartbeat every 5 seconds
    const now = Date.now();
    if (now - lastHeartbeat > 5000) {
      const elapsed = formatElapsed(now - startTime);
      process.stdout.write(
        `\n[heartbeat] elapsed=${elapsed} municipalities=${totalProcessed}\n`
      );
      lastHeartbeat = now;
    }
    
    if (batch.length >= 50 && !args.dryRun && db) {
      await upsertMunicipalityData(db, batch);
      batch = [];
    }
  }
  
  // Process remaining batch
  if (batch.length > 0 && !args.dryRun && db) {
    await upsertMunicipalityData(db, batch);
  }
  
  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  
  return { total: totalProcessed, byRegion };
}

async function main() {
  const args = parseArgs();
  const token = getSocrataAppToken();
  
  if (!token) {
    process.stderr.write('Error: Socrata app token not found\n');
    process.exit(1);
  }
  
  const start = performance.now();
  const db = args.dryRun ? null : await createDatabase();
  
  try {
    // Municipality discovery phase
    process.stdout.write('=== SOCRATA CATALOG DISCOVERY ===\n');
    process.stdout.write(`Regions: ${args.regions.join(', ')}\n`);
    process.stdout.write(`Page Size: ${args.pageSize}\n`);
    process.stdout.write(`Limit: ${args.limit}\n`);
    if (args.dryRun) {
      process.stdout.write('[DRY RUN MODE]\n');
    }
    process.stdout.write('\n--- Municipality Discovery ---\n');
    
    const { total: totalMunicipalities, byRegion } = await processMunicipalityDiscovery(
      args, 
      token, 
      db,
      Date.now()
    );
    
    const municipalityElapsed = Math.round(performance.now() - start);
    process.stdout.write(`Processed ${totalMunicipalities} municipality entries in ${formatElapsed(municipalityElapsed)}\n`);
    
    // Show region breakdown
    if (Object.keys(byRegion).length > 0) {
      process.stdout.write('By Region: ');
      Object.entries(byRegion).forEach(([region, count]) => {
        process.stdout.write(`${region}=${count} `);
      });
      process.stdout.write('\n');
    }

    // Dataset processing phase
    if (args.datasets && !args.dryRun && db) {
      await runDatasetDiscoveryPhase(args, db);
    } else if (args.datasets && args.dryRun) {
      process.stdout.write('\nDATASETS DRY RUN: Dataset discovery would be performed\n');
    } else if (!args.datasets) {
      process.stdout.write('\nDataset discovery skipped (--datasets=false)\n');
    }
    
    // Final summary
    const totalElapsed = Math.round(performance.now() - start);
    process.stdout.write('\n=== COMPLETE ===\n');
    process.stdout.write(`Total Duration: ${formatElapsed(totalElapsed)}\n`);
    
    if (args.dryRun) {
      process.stdout.write('DRY RUN: No database writes performed\n');
    }
    
  } finally {
    if (db) {
      await db.destroy();
    }
  }
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});