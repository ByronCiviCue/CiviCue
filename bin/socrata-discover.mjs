#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Pool } from 'pg';
import { ingestCatalog } from '../services/discovery/socrataCatalogIngest.ts';
import { socrataDiscoveryBase } from '../src/adapters/socrata/regions.ts';
import { isCI, getSocrataAppToken, getDatabaseUrl } from '../src/lib/secrets/secrets.js';

// CI Guard
if (isCI()) {
  process.stderr.write('This script is not intended to be run in a CI environment.\n');
  process.exit(1);
}

// Environment checks
if (!getSocrataAppToken()) {
  process.stderr.write('SOCRATA_APP_TOKEN environment variable is required\n');
  process.exit(1);
}
try { getDatabaseUrl(); } catch {
  process.stderr.write('DATABASE_URL environment variable is required\n');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    limit: 50000,
    pageSize: 500,
    regions: ['US', 'EU'],
    dryRun: false
  };

  for (const arg of args) {
    if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--page-size=')) {
      options.pageSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--regions=')) {
      options.regions = arg.split('=')[1].split(',');
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

async function ensureDataDir() {
  const dir = '__data__/catalog/socrata';
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function fetchPageData(region, cursor, pageSize) {
  const base = socrataDiscoveryBase(region);
  const url = new URL('/api/discovery/v1/domains', base);
  url.searchParams.set('limit', String(pageSize));
  if (cursor) url.searchParams.set('cursor', cursor);

  const response = await fetch(url.toString());
  return await response.json();
}

async function writeJsonlSnapshot(region, options) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const fileName = `__data__/catalog/socrata/${region.toLowerCase()}-domains-${today}.jsonl`;
  
  process.stdout.write(`Writing JSONL snapshot for ${region} to ${fileName}\n`);
  
  let accumulated = 0;
  let cursor = undefined;
  const lines = [];

  while (accumulated < options.limit) {
    const data = await fetchPageData(region, cursor, options.pageSize);
    
    if (!data.results || data.results.length === 0) {
      break;
    }

    // Write each page as a JSON line
    lines.push(JSON.stringify(data));
    
    accumulated += data.results.length;
    cursor = data.metadata?.next_cursor;
    if (!cursor) break;
  }

  if (lines.length > 0) {
    await writeFile(fileName, lines.join('\n') + '\n');
    process.stdout.write(`Wrote ${lines.length} pages (${accumulated} domains) to ${fileName}\n`);
  }
}

async function runSanityQueries() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  
  try {
    process.stdout.write('\n=== Database Sanity Checks ===\n');
    
    // Query 1: Hosts by region
    const hostsResult = await pool.query(
      'SELECT region, COUNT(*) AS hosts FROM socrata_hosts GROUP BY region ORDER BY region'
    );
    process.stdout.write('\nHosts by region:\n');
    hostsResult.rows.forEach(row => {
      process.stdout.write(`  ${row.region}: ${row.hosts}\n`);
    });

    // Query 2: Top agencies by host
    const agenciesResult = await pool.query(
      'SELECT host, COUNT(*) AS agencies FROM socrata_agencies GROUP BY host ORDER BY agencies DESC LIMIT 10'
    );
    process.stdout.write('\nTop 10 hosts by agency count:\n');
    agenciesResult.rows.forEach(row => {
      process.stdout.write(`  ${row.host}: ${row.agencies}\n`);
    });
    
  } catch (error) {
    const msg = (error && typeof error === 'object' && 'message' in error) ? String(error.message) : String(error);
    process.stderr.write(`Error running sanity queries: ${msg}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

async function main() {
  const options = parseArgs();
  
  process.stdout.write('Extended Socrata Discovery Starting...\n');
  process.stdout.write(`Options: ${JSON.stringify(options)}\n`);
  
  try {
    await ensureDataDir();
    
    // Run ingest for each region
    for (const region of options.regions) {
      process.stdout.write(`\n=== Processing region: ${region} ===\n`);
      
      // Run the catalog ingest
      await ingestCatalog({
        regions: [region],
        limit: options.limit,
        dryRun: options.dryRun,
        verbose: true
      });
      
      // Write JSONL snapshot
      if (!options.dryRun) {
        await writeJsonlSnapshot(region, options);
      }
    }
    
    // Run sanity queries if not dry run
    if (!options.dryRun) {
      await runSanityQueries();
    }
    
    process.stdout.write('\n=== Discovery Complete ===\n');
    
  } catch (error) {
    const msg = (error && typeof error === 'object' && 'message' in error) ? String(error.message) : String(error);
    process.stderr.write(`Error during discovery: ${msg}\n`);
    process.exit(1);
  }
}

main();
