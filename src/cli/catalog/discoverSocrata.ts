#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { getSocrataAppToken, getDatabaseUrl } from '../../lib/secrets/secrets.js';
import { iterateDomainsAndAgencies } from '../../adapters/socrata/catalogDiscovery.js';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { z } from 'zod';

type Region = 'US' | 'EU';

interface Args {
  regions: Region[];
  pageSize: number;
  limit: number;
  dryRun: boolean;
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

interface Database {
  'catalog.socrata_municipality_index': SocrataMunicipalityIndex;
}

function processToken(token: string, it: Iterator<string>, result: { regionsStr: string; pageSizeStr: string; limitStr: string; dryRun: boolean }) {
  if (token === '--dry-run') { result.dryRun = true; return; }

  // Handle equal-separated arguments first
  if (token.startsWith('--regions='))   { result.regionsStr  = token.slice(10); return; }
  if (token.startsWith('--page-size=')) { result.pageSizeStr = token.slice(12); return; }
  if (token.startsWith('--limit='))     { result.limitStr    = token.slice(8); return; }

  // Handle space-separated arguments
  const next = it.next();
  const nextValue = !next.done && typeof next.value === 'string' ? next.value : null;
  
  if (token === '--regions' && nextValue) { result.regionsStr = nextValue; return; }
  if (token === '--page-size' && nextValue) { result.pageSizeStr = nextValue; return; }
  if (token === '--limit' && nextValue) { result.limitStr = nextValue; return; }
}

function iterateTokens(tokens: string[]) {
  const it = tokens[Symbol.iterator]();
  const result = {
    regionsStr: 'US,EU',
    pageSizeStr: '500',
    limitStr: '50000',
    dryRun: false,
  };

  for (let step = it.next(); !step.done; step = it.next()) {
    const token = step.value ?? '';
    processToken(token, it, result);
  }

  return result;
}

function parseArgs(): Args {
  const tokens = process.argv.slice(2);
  const { regionsStr, pageSizeStr, limitStr, dryRun } = iterateTokens(tokens);

  const Schema = z.object({
    regions: z.string().transform(s => s.split(',').map(t => t.trim()).filter(Boolean)),
    pageSize: z.number().int().positive().max(1000),
    limit: z.number().int().positive().max(200000),
    dryRun: z.boolean(),
  });

  const parsed = Schema.parse({
    regions: regionsStr,
    pageSize: Number(pageSizeStr),
    limit: Number(limitStr),
    dryRun,
  });

  const filtered = parsed.regions.filter((r): r is Region => r === 'US' || r === 'EU');

  return Object.freeze({
    regions: filtered,
    pageSize: parsed.pageSize,
    limit: parsed.limit,
    dryRun: parsed.dryRun,
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
    .insertInto('catalog.socrata_municipality_index')
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

async function main() {
  const args = parseArgs();
  const token = getSocrataAppToken();
  
  if (!token) {
    process.stderr.write('Error: Socrata app token not found\n');
    process.exit(1);
  }
  
  const start = performance.now();
  let totalProcessed = 0;
  let batch: Array<{ host: string; domain: string; region: string; agency: string | null }> = [];
  
  const db = args.dryRun ? null : await createDatabase();
  
  try {
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
      
      if (totalProcessed % 100 === 0) {
        process.stdout.write('.');
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
    
    const elapsed = Math.round(performance.now() - start);
    process.stdout.write(`\nProcessed ${totalProcessed} entries in ${elapsed}ms\n`);
    
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