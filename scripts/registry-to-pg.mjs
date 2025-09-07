// Load one or more municipality registry files into Postgres (registry.socrata_assets).
// Example:
//   node scripts/registry-to-pg.mjs --files=municipalities/CA/SF/directory.json,municipalities/MI/Detroit/directory.json
// Uses PG* env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
/**
 * Load one or more municipality registry JSON files into Postgres.
 * Table: registry.socrata_assets (created if absent).
 * Flags:
 *   --files=path1,path2
 */
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { Client } from 'pg';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);

/** @returns {{files: string}} */
function parseArgs() {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith('--'))
      .map((a) => {
        const [k, v = ''] = a.replace(/^--/, '').split('=');
        return [k, v];
      }),
  );
  if (!args.files) {
    console.error('Missing --files=path1,path2');
    process.exit(2);
  }
  return args;
}

/** @param {string} input */
function sha(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** @param {string} p */
function parseCityStateFromPath(p) {
  // Expecting municipalities/<STATE>/<City>/directory.json
  const parts = p.split('/');
  const i = parts.indexOf('municipalities');
  if (i >= 0 && parts.length >= i + 4) {
    return { state: parts[i + 1], city: parts[i + 2] };
  }
  return { state: null, city: null };
}

/** @param {import('pg').Client} client */
async function ensureSchema(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS registry;`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS registry.socrata_assets (
      domain TEXT NOT NULL,
      id TEXT NOT NULL,
      name TEXT,
      description TEXT,
      resource_url TEXT NOT NULL,
      permalink TEXT,
      category TEXT,
      tags JSONB,
      state TEXT,
      city TEXT,
      source TEXT,
      content_hash TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (domain, id)
    );
  `);
  await client.query(`ALTER TABLE registry.socrata_assets ADD COLUMN IF NOT EXISTS source TEXT;`);
}

/**
 * @param {import('pg').Client} client
 * @param {string[]} files
 */
async function loadFiles(client, files) {
  const upsert = `
    INSERT INTO registry.socrata_assets
      (domain, id, name, description, resource_url, permalink, category, tags, state, city, source, content_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (domain, id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      resource_url = EXCLUDED.resource_url,
      permalink = EXCLUDED.permalink,
      category = EXCLUDED.category,
      tags = EXCLUDED.tags,
      state = EXCLUDED.state,
      city = EXCLUDED.city,
      source = EXCLUDED.source,
      content_hash = EXCLUDED.content_hash,
      updated_at = now()
    WHERE registry.socrata_assets.content_hash IS DISTINCT FROM EXCLUDED.content_hash;
  `;

  let total = 0;
  for (const file of files) {
    const { state, city } = parseCityStateFromPath(file);
    const raw = await readFile(file, 'utf8');
    const list = JSON.parse(raw);
    for (const item of list) {
      const domain = new URL(item.resource_url).host;
      const contentHash = sha(JSON.stringify({
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        tags: item.tags,
        resource_url: item.resource_url,
        permalink: item.permalink,
      }));

      await client.query(upsert, [
        domain,
        item.id,
        item.name,
        item.description,
        item.resource_url,
        item.permalink,
        item.category,
        JSON.stringify(item.tags ?? []),
        state,
        city,
        item.source || null,
        contentHash,
      ]);
      total++;
    }
  }
  return total;
}

async function main() {
  const { files } = parseArgs();
  const list = files.split(',').map((s) => s.trim()).filter(Boolean);
  const snapshotId = nano();

  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'dev',
    password: process.env.PGPASSWORD || 'dev',
    database: process.env.PGDATABASE || 'civicue',
  });

  await client.connect();
  try {
    await ensureSchema(client);
    const count = await loadFiles(client, list);
    console.log(`Snapshot ${snapshotId}: upserted ${count} records into registry.socrata_assets`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
