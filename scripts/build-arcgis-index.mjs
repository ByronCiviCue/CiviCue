/**
 * Build a registry from an ArcGIS portal (ArcGIS Online or Enterprise).
 * Uses the REST search API to list Feature Layers/Services and maps to a uniform shape.
 *
 * Flags:
 *   --portal=<portal_base_url> (e.g., https://www.arcgis.com or https://<org>.maps.arcgis.com)
 *   --out=<output_path>
 *   --tokenEnv=<ENV_VAR_WITH_TOKEN> (optional; bearer token if required)
 *   --query=<search_query> (e.g., 'type:("Feature Service" OR "Feature Layer") AND owner:city')
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
    .map((a) => { const [k, v = ''] = a.replace(/^--/, '').split('='); return [k, v]; }),
);

const PORTAL = ((args.portal || process.env.ARCGIS_PORTAL_URL || '')).replace(/\/$/, '');
if (!PORTAL) {
  console.error('Missing --portal=<arcgis_portal_url> or ARCGIS_PORTAL_URL');
  process.exit(2);
}
const OUT_PATH = args.out || 'municipalities/ARCGIS/directory.arcgis.json';
const TOKEN_ENV = args.tokenEnv || 'ARCGIS_TOKEN';
const QUERY = args.query || 'type:("Feature Service" OR "Feature Layer")';
const TIMEOUT_MS = parseInt(process.env.HTTP_FETCH_TIMEOUT_MS || '20000', 10);

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

async function arcgisToken() {
  const apiKey = process.env.ARCGIS_API_KEY;
  if (apiKey) return apiKey;
  const cid = process.env.ARCGIS_CLIENT_ID;
  const csec = process.env.ARCGIS_CLIENT_SECRET;
  const tokenUrl = process.env.ARCGIS_OAUTH_TOKEN_URL || 'https://www.arcgis.com/sharing/rest/oauth2/token';
  if (!cid || !csec) return null;
  const body = new URLSearchParams({ client_id: cid, client_secret: csec, grant_type: 'client_credentials' });
  const res = await fetch(tokenUrl, { method: 'POST', body });
  const json = await res.json();
  return json.access_token || null;
}

async function fetchPage(start = 1, num = 100) {
  const url = new URL('/sharing/rest/search', PORTAL);
  url.searchParams.set('f', 'json');
  url.searchParams.set('q', QUERY);
  url.searchParams.set('start', String(start));
  url.searchParams.set('num', String(num));
  const headers = { 'Accept': 'application/json' };
  const token = process.env[TOKEN_ENV] || process.env.ARCGIS_TOKEN || (await arcgisToken());
  if (token) url.searchParams.set('token', token);
  return fetchJson(url, { headers, cache: 'no-store' });
}

async function buildRegistry() {
  const out = [];
  for (let start = 1; ; start += 100) {
    const data = await fetchPage(start, 100);
    const items = data.results || [];
    if (!items.length) break;
    for (const it of items) {
      const id = it.id;
      const name = it.title || it.name || id;
      const description = it.snippet || it.description || '';
      const url = it.url || '';
      if (!id || !url) continue;
      const resource_url = `${url.replace(/\/$/, '')}/query?where=1%3D1&f=json`;
      const portalOrigin = new URL(PORTAL).origin;
      const permalink = `${portalOrigin}/home/item.html?id=${id}`;
      const category = (it.categories && it.categories[0]) || null;
      const tags = it.tags || [];
      out.push({ id, name, description, resource_url, permalink, category, tags });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function hash(text) { return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12); }

async function main() {
  const assets = await buildRegistry();
  const json = JSON.stringify(assets, null, 2);
  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  let prev = ''; try { prev = await readFile(OUT_PATH, 'utf8'); } catch {}
  if (prev && prev === json) { console.log(`No changes (${assets.length} assets, hash ${hash(json)}) at ${OUT_PATH}`); return; }
  await writeFile(OUT_PATH, json);
  console.log(`Wrote ${assets.length} assets to ${OUT_PATH} (hash ${hash(json)})`);
}

main().catch((err) => { console.error(err); process.exit(1); });
