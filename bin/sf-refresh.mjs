#!/usr/bin/env node

import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { socrataDiscoveryBase, shouldFailover, otherRegion } from '../src/adapters/socrata/regions.ts';
import { isCI, getSocrataAppToken, getDatabaseUrl } from '../src/lib/secrets/secrets.js';

// CI Guard
if (isCI()) {
  process.stderr.write('This script is not intended to be run in a CI environment.\n');
  process.exit(1);
}

// Environment checks
// Environment checks (via secrets facade)
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
    host: 'data.sfgov.org',
    limit: 100000,
    pageSize: 500,
    out: 'municipalities/CA/SF/directory.json'
  };

  for (const arg of args) {
    if (arg.startsWith('--host=')) {
      options.host = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--page-size=')) {
      options.pageSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--out=')) {
      options.out = arg.split('=')[1];
    }
  }

  return options;
}

async function ensureDataDir() {
  const dir = '__data__/sf';
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

async function fetchWithFailover(url) {
  try {
    const res = await fetch(url.toString());
    if (!shouldFailover(res.status, false)) return res;
    
    // Try the other region
    const base = socrataDiscoveryBase(otherRegion('US'));
    const failoverUrl = new URL(url.pathname, base);
    failoverUrl.search = url.search;
    return await fetch(failoverUrl.toString());
  } catch {
    const base = socrataDiscoveryBase(otherRegion('US'));
    const failoverUrl = new URL(url.pathname, base);
    failoverUrl.search = url.search;
    return await fetch(failoverUrl.toString());
  }
}

async function fetchDatasets(host, options) {
  process.stdout.write(`Fetching datasets for host: ${host}\n`);
  
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const auditFile = `__data__/sf/sf-datasets-${today}.jsonl`;
  
  let accumulated = 0;
  let cursor = undefined;
  const datasets = [];
  const auditLines = [];

  while (accumulated < options.limit) {
    const base = socrataDiscoveryBase('US');
    const url = new URL('/api/catalog/v1', base);
    url.searchParams.set('domains', host);
    url.searchParams.set('limit', String(options.pageSize));
    if (cursor) url.searchParams.set('scroll_id', cursor);

    const response = await fetchWithFailover(url);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      process.stdout.write(`No more results for host: ${host}\n`);
      break;
    }

    // Write audit line
    auditLines.push(JSON.stringify(data));

    // Process datasets
    for (const item of data.results) {
      if (item.resource && item.resource.type === 'dataset') {
        datasets.push(item);
      }
    }

    accumulated += data.results.length;
    cursor = data.scroll_id;
    if (!cursor) break;

    process.stdout.write(`Fetched ${accumulated} items so far...\n`);
  }

  // Write audit file
  if (auditLines.length > 0) {
    await writeFile(auditFile, auditLines.join('\n') + '\n');
    process.stdout.write(`Wrote audit to ${auditFile}\n`);
  }

  return datasets;
}

function transformToDirectory(datasets) {
  const categories = new Set();
  
  const directoryItems = datasets.map(item => {
    const resource = item.resource;
    const metadata = item.metadata || {};
    
    // Track categories
    if (metadata.categories) {
      metadata.categories.forEach(cat => categories.add(cat));
    }
    if (metadata.tags) {
      metadata.tags.forEach(tag => categories.add(tag));
    }

    return {
      id: resource.id,
      name: resource.name || 'Untitled Dataset',
      description: resource.description || '',
      url: `https://${resource.domain}/d/${resource.id}`,
      apiUrl: `https://${resource.domain}/resource/${resource.id}.json`,
      owner: metadata.owner || 'Unknown',
      agency: metadata.department || metadata.owner || 'Unknown',
      categories: metadata.categories || [],
      tags: metadata.tags || [],
      created: resource.created_at,
      updated: resource.updated_at,
      rowCount: resource.row_count || 0,
      columns: resource.columns_name || []
    };
  });

  return {
    municipality: 'San Francisco',
    state: 'CA',
    country: 'US',
    generatedAt: new Date().toISOString(),
    totalDatasets: directoryItems.length,
    categories: Array.from(categories).sort(),
    datasets: directoryItems.sort((a, b) => a.name.localeCompare(b.name))
  };
}

async function main() {
  const options = parseArgs();
  
  process.stdout.write('SF Directory Refresh Starting...\n');
  process.stdout.write(`Options: ${JSON.stringify(options)}\n`);
  
  try {
    await ensureDataDir();
    
    // Fetch datasets
    const datasets = await fetchDatasets(options.host, options);
    
    // Transform to directory format
    const directory = transformToDirectory(datasets);
    
    // Write directory file
    await writeFile(options.out, JSON.stringify(directory, null, 2));
    
    // Display statistics
    process.stdout.write('\n=== Statistics ===\n');
    process.stdout.write(`Datasets found: ${datasets.length}\n`);
    process.stdout.write(`Datasets written: ${directory.totalDatasets}\n`);
    process.stdout.write(`Categories present: ${directory.categories.length}\n`);
    process.stdout.write(`Output file: ${options.out}\n`);
    
    process.stdout.write('\n=== SF Directory Refresh Complete ===\n');
    
  } catch (error) {
    const msg = (error && typeof error === 'object' && 'message' in error) ? String(error.message) : String(error);
    process.stderr.write(`Error during SF refresh: ${msg}\n`);
    process.exit(1);
  }
}

main();
