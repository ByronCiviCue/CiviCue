// Build a registry of Socrata datasets into a city directory JSON.
// Defaults to DataSF but accepts flags:
//   --domain=<socrata_domain>
//   --out=<output_path>
//   --tokenEnv=<ENV_VAR_NAME_WITH_APP_ID>
// Usage examples:
//   SOCRATA_APP_ID=... node scripts/build-datasf-index.mjs
//   SOCRATA_APP_ID=... node scripts/build-datasf-index.mjs --domain=data.detroitmi.gov --out=municipalities/MI/Detroit/directory.json --tokenEnv=SOCRATA_APP_ID
/**
 * Build a registry of Socrata datasets for a given domain.
 * Flags:
 *   --domain=<socrata_domain> (default: data.sfgov.org)
 *   --out=<output_path> (default: municipalities/CA/SF/directory.json)
 *   --tokenEnv=<ENV_VAR_WITH_APP_ID> (default: SOCRATA_APP_ID)
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = ''] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
);

const DOMAIN = args.domain || 'data.sfgov.org';
const OUT_PATH = args.out || 'municipalities/CA/SF/directory.json';
const TOKEN_ENV = args.tokenEnv || 'SOCRATA_APP_ID';
const PAGE = 100; // Socrata Discovery API page size

/**
 * @param {number} [offset]
 * @returns {Promise<any>}
 */
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

async function fetchPage(offset = 0) {
  const url = new URL('https://api.us.socrata.com/api/catalog/v1');
  url.searchParams.set('domains', DOMAIN);
  url.searchParams.set('limit', String(PAGE));
  url.searchParams.set('offset', String(offset));

  const headers = {};
  const token = process.env[TOKEN_ENV] || process.env.SOCRATA_APP_ID || process.env.SFDATA_APP_ID;
  if (token) headers['X-App-Token'] = token;

  return fetchJson(url, { headers, cache: 'no-store' });
}

/** @returns {Promise<any[]>} */
async function buildRegistry() {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const data = await fetchPage(offset);
    const results = data?.results ?? [];
    if (!results.length) break;

    for (const r of results) {
      const id = r?.resource?.id;
      const name = r?.resource?.name ?? '';
      const description = r?.resource?.description ?? '';
      const permalink = r?.permalink ?? `https://${DOMAIN}/d/${id}`;
      const category = r?.classification?.domain_category ?? null;
      const tags = r?.classification?.domain_tags ?? [];
      if (!id) continue;
      out.push({
        id,
        name,
        description,
        resource_url: `https://${DOMAIN}/resource/${id}.json`,
        permalink,
        category,
        tags,
      });
    }
  }
  // Sort for stable diffs
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

async function main() {
  const assets = await buildRegistry();
  const json = JSON.stringify(assets, null, 2);

  // Ensure destination folder exists
  const outDir = OUT_PATH.split('/').slice(0, -1).join('/');
  if (outDir) await mkdir(outDir, { recursive: true });

  // Avoid rewriting unchanged files; print hashes for quick checks
  let prev = '';
  try {
    prev = await readFile(OUT_PATH, 'utf8');
  } catch {}

  const newHash = crypto.createHash('sha256').update(json).digest('hex').slice(0, 12);
  const oldHash = prev ? crypto.createHash('sha256').update(prev).digest('hex').slice(0, 12) : null;

  if (prev && prev === json) {
    console.log(`No changes (${assets.length} assets, hash ${newHash}) at ${OUT_PATH}`);
    return;
  }

  await writeFile(OUT_PATH, json);
  console.log(
    `Wrote ${assets.length} assets to ${OUT_PATH} (hash ${newHash}${oldHash ? `, was ${oldHash}` : ''})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
