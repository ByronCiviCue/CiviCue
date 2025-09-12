#!/usr/bin/env node
import { getDb } from '../src/db/kysely.js';
import { iterateDomainsAndAgencies } from '../src/adapters/socrata/catalogDiscovery.js';
import { isCI, getSocrataAppToken } from '../src/lib/secrets/secrets.js';

if (isCI()) {
  process.stderr.write('Refusing to run in CI.\n');
  process.exit(1);
}

function parseArgs() {
  const out = { regions: ['US','EU'], limit: undefined, pageSize: 500, dryRun: false, verbose: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--regions=')) out.regions = arg.split('=')[1].split(',').map(s=>s.trim());
    else if (arg.startsWith('--limit=')) out.limit = Number(arg.split('=')[1]) || undefined;
    else if (arg.startsWith('--page-size=')) out.pageSize = Number(arg.split('=')[1]) || 500;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--verbose') out.verbose = true;
  }
  return out;
}

async function main() {
  const { regions, limit, pageSize, dryRun, verbose } = parseArgs();
  const db = getDb();

  const appToken = getSocrataAppToken();

  const counts = new Map();

  let seen = 0;
  for await (const row of iterateDomainsAndAgencies({
    regions: regions,
    pageSize,
    limit,
    appToken
  })) {
    seen++;
    const key = row.host;
    const current = counts.get(key) ?? { host: row.host, domain: row.domain, region: row.region, agencies: new Set(), datasets: 0, country: null, city: null };
    if (row.agency) current.agencies.add(row.agency);
    counts.set(key, current);
    if (verbose && seen % 1000 === 0) process.stderr.write(`Scanned ${seen} items…\n`);
  }

  const rows = Array.from(counts.values()).map(v => ({
    host: v.host,
    domain: v.domain,
    region: v.region,
    country: v.country,
    city: v.city,
    agency_count: v.agencies.size,
    dataset_count: v.datasets,
    last_seen: new Date(),
    source: 'socrata',
    meta: null
  }));

  process.stdout.write(`Discovered hosts: ${rows.length}\n`);

  if (dryRun) {
    process.stdout.write(JSON.stringify({ hosts: rows.length, sample: rows.slice(0,5) }, null, 2) + '\n');
    return;
  }

  // UPSERT
  for (const r of rows) {
    await db
      .insertInto('catalog.socrata_municipality_index')
      .values(r)
      .onConflict((oc) =>
        oc.column('host').doUpdateSet({
          domain: (eb) => eb.ref('excluded.domain'),
          region: (eb) => eb.ref('excluded.region'),
          country: (eb) => eb.ref('excluded.country'),
          city: (eb) => eb.ref('excluded.city'),
          agency_count: (eb) => eb.ref('excluded.agency_count'),
          dataset_count: (eb) => eb.ref('excluded.dataset_count'),
          last_seen: (eb) => eb.ref('excluded.last_seen'),
          meta: (eb) => eb.ref('excluded.meta'),
          source: (eb) => eb.ref('excluded.source')
        })
      )
      .execute();
  }

  // Report
  const totals = { US: 0, EU: 0 };
  for (const r of rows) {
    if (r.region === 'EU') totals.EU = (totals.EU ?? 0) + 1;
    else totals.US = (totals.US ?? 0) + 1;
  }
  process.stdout.write(`Hosts by region: ${JSON.stringify(totals)}\n`);
}

main().catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
