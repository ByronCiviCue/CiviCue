/**
 * Merge all municipality Socrata registries into a single global JSON.
 * - Scans municipalities/<STATE>/<CITY>/directory.json
 * - Dedupe by (domain, id)
 * - Adds state/city fields
 * - Writes registries/socrata.json only if content changed
 *
 * Usage: node scripts/merge-registries.mjs
 */
import { readdir, readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const MUNICIPALITIES_DIR = 'municipalities';
const OUT_PATH = 'registries/socrata.json';

/** @returns {Promise<string[]>} */
async function listDirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name));
}

/** @returns {Promise<boolean>} */
async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * @typedef {Object} SocrataAsset
 * @property {string} id - 4x4 dataset identifier
 * @property {string} name
 * @property {string} description
 * @property {string} resource_url - Direct API endpoint
 * @property {string} permalink - Portal page
 * @property {string|null} category
 * @property {string[]} tags
 * @property {string} [state]
 * @property {string} [city]
 * @property {string} [domain]
 * @property {string} [source] - socrata|ckan|arcgis
 */

/** @returns {Promise<SocrataAsset[]>} */
async function gather() {
  const out = [];
  if (!(await exists(MUNICIPALITIES_DIR))) return out;
  for (const stateDir of await listDirs(MUNICIPALITIES_DIR)) {
    for (const cityDir of await listDirs(stateDir)) {
      // Pick up any directory*.json to support multiple sources (socrata, ckan, arcgis)
      const files = (await readdir(cityDir)).filter((f) => /^directory(?:\.[a-z]+)?\.json$/.test(f));
      if (!files.length) continue;
      const rel = path.relative(MUNICIPALITIES_DIR, cityDir).split(path.sep);
      const [state, city] = rel;
      for (const f of files) {
        const file = path.join(cityDir, f);
        const raw = await readFile(file, 'utf8');
        /** @type {SocrataAsset[]} */
        const assets = JSON.parse(raw);
        const source = f.endsWith('.ckan.json') ? 'ckan' : f.endsWith('.arcgis.json') ? 'arcgis' : 'socrata';
        for (const a of assets) {
          const domain = new URL(a.resource_url).host;
          out.push({ ...a, state, city, domain, source });
        }
      }
    }
  }
  return out;
}

/** @param {SocrataAsset[]} assets */
function dedupe(assets) {
  const map = new Map();
  for (const a of assets) {
    const key = `${a.domain}:${a.id}`;
    if (!map.has(key)) map.set(key, a);
  }
  return Array.from(map.values());
}

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
}

async function main() {
  const all = await gather();
  const unique = dedupe(all).sort((a, b) => {
    const d = a.domain.localeCompare(b.domain);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  const json = JSON.stringify(unique, null, 2);

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  let prev = '';
  try {
    prev = await readFile(OUT_PATH, 'utf8');
  } catch {}

  const newHash = hash(json);
  const oldHash = prev ? hash(prev) : null;
  if (prev && prev === json) {
    console.log(`No changes (${unique.length} assets, hash ${newHash}) at ${OUT_PATH}`);
    return;
  }
  await writeFile(OUT_PATH, json);
  console.log(
    `Merged ${unique.length} assets into ${OUT_PATH} (hash ${newHash}${oldHash ? `, was ${oldHash}` : ''})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
