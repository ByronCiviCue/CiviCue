/**
 * Build a registry from a CKAN portal.
 * Maps CKAN resources with datastore_active=true to a uniform shape.
 *
 * Flags:
 *   --base=<ckan_base_url> (e.g., https://data.sandiego.gov)
 *   --out=<output_path> (default: municipalities/CKAN/directory.ckan.json)
 *   --tokenEnv=<ENV_VAR_WITH_API_KEY> (optional)
 *
 * Output shape per entry:
 *   { id, name, description, resource_url, permalink, category, tags }
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = ''] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
);

const BASE = ((args.base || process.env.CKAN_BASE_URL || '')).replace(/\/$/, '');
if (!BASE) {
  console.error('Missing --base=<ckan_base_url> or CKAN_BASE_URL');
  process.exit(2);
}
const OUT_PATH = args.out || 'municipalities/CKAN/directory.ckan.json';
const TOKEN_ENV = args.tokenEnv || 'CKAN_API_KEY';
const ORG = args.org || process.env.CKAN_ORG || '';
const VERIFY_SSL = String(process.env.CKAN_VERIFY_SSL || 'true').toLowerCase() !== 'false';
const TIMEOUT_MS = parseInt(process.env.HTTP_FETCH_TIMEOUT_MS || '20000', 10);

if (!VERIFY_SSL) {
  // Allow self-signed dev portals when CKAN_VERIFY_SSL=false
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

/** @param {number} start */
async function fetchPage(start = 0, rows = 100) {
  const url = new URL('/api/3/action/package_search', BASE);
  url.searchParams.set('rows', String(rows));
  url.searchParams.set('start', String(start));
  const headers = { 'Accept': 'application/json' };
  const token = process.env[TOKEN_ENV] || process.env.CKAN_API_KEY || process.env.CKAN_API_TOKEN;
  if (token) headers['X-CKAN-API-Key'] = token;
  if (ORG) url.searchParams.set('fq', `organization:${ORG}`);
  const j = await fetchJson(url, { headers, cache: 'no-store' });
  if (!j.success) throw new Error(`CKAN: package_search not successful`);
  return j.result;
}

async function buildRegistry() {
  const out = [];
  for (let start = 0; ; start += 100) {
    const result = await fetchPage(start, 100);
    const pkgs = result.results || [];
    if (!pkgs.length) break;
    for (const p of pkgs) {
      const tags = (p.tags || []).map((t) => t.display_name || t.name).filter(Boolean);
      const category = (p.groups && p.groups[0] && (p.groups[0].title || p.groups[0].name)) || null;
      for (const r of p.resources || []) {
        if (!r.datastore_active) continue; // Only include queryable datastore resources
        const id = r.id; // resource_id
        const name = r.name || p.title || r.id;
        const description = r.description || p.notes || '';
        const resource_url = new URL(`/api/3/action/datastore_search?resource_id=${id}`, BASE).toString();
        const permalink = p.url || new URL(`/dataset/${p.name}`, BASE).toString();
        out.push({ id, name, description, resource_url, permalink, category, tags });
      }
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

async function main() {
  const assets = await buildRegistry();
  const json = JSON.stringify(assets, null, 2);
  const outDir = path.dirname(OUT_PATH);
  await mkdir(outDir, { recursive: true });
  let prev = '';
  try { prev = await readFile(OUT_PATH, 'utf8'); } catch {}
  if (prev && prev === json) {
    console.log(`No changes (${assets.length} assets, hash ${hash(json)}) at ${OUT_PATH}`);
    return;
  }
  await writeFile(OUT_PATH, json);
  console.log(`Wrote ${assets.length} assets to ${OUT_PATH} (hash ${hash(json)})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
