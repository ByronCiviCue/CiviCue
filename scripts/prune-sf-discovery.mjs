#!/usr/bin/env node

/**
 * Prune SF discovery directory into high-signal datasets.
 * Thin CLI wrapper around reusable helper in src/lib/discovery/prune.ts
 *
 * Input (default): data/sf/directory.json (Socrata directory payload)
 * Outputs:
 *  - data/sf/discovery.pruned.json  (kept datasets with reasons, score, retention)
 *  - data/sf/discovery.drop.csv     (id,name,reason)
 *  - data/sf/prune.summary.md       (counts + breakdown)
 *
 * Flags:
 *  --in=<path>
 *  --outDir=<dir>
 *  --verbose
 */

import fs from 'fs/promises';
import path from 'node:path';
// Import from built dist; ensure build step runs before invoking this CLI
import { pruneCatalog } from '../dist/src/lib/discovery/prune.js';

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = true] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
);

const INPUT_PATH = args.in || 'data/sf/directory.json';
const OUT_DIR = args.outDir || 'data/sf';
const VERBOSE = args.verbose === true || args.verbose === 'true';

function parseISODate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function monthsBetween(a, b) {
  const years = b.getFullYear() - a.getFullYear();
  const months = years * 12 + (b.getMonth() - a.getMonth());
  // approximate partial month by day
  return months + (b.getDate() - a.getDate()) / 30;
}

// Heuristic classifiers
const CAT_KEYWORDS = {
  governance: [/ethic/i, /lobby/i, /campaign/i, /election/i, /contract/i, /procure/i, /budget/i, /finance/i, /compliance/i],
  housing: [/permit/i, /housing/i, /rent/i, /evict/i, /parcel/i, /apn/i, /land\s*use/i, /zoning/i, /planning/i],
  safety: [/311/, /incident/i, /crime/i, /police/i, /fire/i, /emergency/i, /calls?/i],
  infrastructure: [/street/i, /public works/i, /utility/i, /sewer/i, /water/i, /paving/i, /tree/i, /sidewalk/i],
  finance: [/budget/i, /spend/i, /payroll/i, /vendor/i, /checkbook/i, /revenue/i, /tax/i],
  transit: [/transit/i, /muni/i, /sfmta/i, /bart/i, /sfo\b/i, /airport/i, /bus/i, /rail/i, /bike/i],
  boundaries: [/boundary/i, /zoning/i, /district/i, /tract/i, /block/i, /neighborhood/i, /supervisor/i]
};

const TRUSTED_OWNERS = [/^DataSF$/i, /City and County of San Francisco/i, /SFMTA/i, /San Francisco Police/i, /Controller/i, /Planning/i, /Ethics/i, /Treasurer/i, /Airport/i];

// eslint-disable-next-line no-unused-vars
function classifyRelevance(name, categories = [], tags = []) {
  const text = [name || '', ...categories, ...tags].join(' ').toLowerCase();
  const hits = Object.entries(CAT_KEYWORDS).filter(([, res]) => res.some((r) => r.test(text)));
  const cats = hits.map(([k]) => k);
  if (cats.length === 0) return { cats: [], relevance: 0 };
  // Strong match if multiple domains or exact keywords
  const relevance = Math.min(100, 40 + cats.length * 20);
  return { cats, relevance };
}

function isArchivedLike(name, tags = []) {
  const text = [name || '', ...(tags || [])].join(' ').toLowerCase();
  return /archive|archiv|deprecated|retired|superseded/.test(text);
}

function isGlobalIrrelevant(name, categories = [], tags = []) {
  const text = [name || '', ...categories, ...tags].join(' ').toLowerCase();
  // Keep SF-centric only; drop obviously global context that isn't SF specific
  const globalish = /\b(?:usa|united states|global|world|california)\b/.test(text);
  const sfHint = /(?:san\s*francisco|sf\b|sfgov|city and county)/.test(text);
  return globalish && !sfHint;
}

function ownerTrustScore(owner) {
  if (!owner) return 20;
  if (TRUSTED_OWNERS.some((re) => re.test(owner))) return 100;
  // Named owner gives some trust
  if (owner && owner.trim().length > 0) return 70;
  return 20;
}

function joinabilityScore(name, tags = []) {
  const text = [name || '', ...(tags || [])].join(' ').toLowerCase();
  const joinKeys = [/\b(?:apn|parcel|block|lot|block\s*lot|case|permit|incident|neighborhood|tract|district)\b/];
  const strong = joinKeys.some((r) => r.test(text));
  return strong ? 100 : 60;
}

function cadenceScore(name, categories = [], tags = []) {
  const text = [name || '', ...categories, ...tags].join(' ').toLowerCase();
  if (/(?:311|crime|incident|calls?|service request)/.test(text)) return 100; // daily
  if (/(?:permit|inspection|transit|muni|sfo|airport)/.test(text)) return 85; // weekly
  if (/(?:budget|finance|ethics|lobby)/.test(text)) return 70; // monthly/quarterly
  return 50; // unknown/low cadence
}

function sizeSanityScore(name) {
  const text = (name || '').toLowerCase();
  if (/summary|aggregate|rollup/.test(text)) return 100;
  if (/all time|all records/.test(text)) return 40;
  return 70;
}

function freshnessScore(updatedAt) {
  if (!updatedAt) return 30;
  const now = new Date();
  const d = parseISODate(updatedAt);
  if (!d) return 30;
  const m = monthsBetween(d, now);
  if (m <= 6) return 100;
  if (m <= 12) return 85;
  if (m <= 36) return 70;
  if (m <= 60) return 55;
  if (m <= 120) return 40;
  return 20;
}

// eslint-disable-next-line no-unused-vars
function relevanceAllowed(cats) {
  const allowed = new Set(['governance', 'housing', 'safety', 'infrastructure', 'finance', 'transit', 'boundaries']);
  return cats.some((c) => allowed.has(c));
}

// eslint-disable-next-line no-unused-vars
function categoryRetention(cats) {
  // Returns descriptive retention window
  if (cats.includes('safety') || cats.includes('governance') && /311/.test(cats.join(','))) return '36m';
  if (cats.includes('housing')) return '10y';
  if (cats.includes('finance') || cats.includes('governance')) return '12y';
  if (cats.includes('transit')) return '10y';
  if (cats.includes('boundaries')) return 'current+previous';
  if (cats.includes('infrastructure')) return '5y';
  return 'unspecified';
}

// eslint-disable-next-line no-unused-vars
function computeScore({ relevance, updatedAt, owner, name, tags, categories }) {
  const freshness = freshnessScore(updatedAt);
  const ownerTrust = ownerTrustScore(owner);
  const joinability = joinabilityScore(name, tags);
  const cadence = cadenceScore(name, categories, tags);
  const sizeSanity = sizeSanityScore(name);
  const priority = Math.round(
    relevance * 3 +
    freshness * 2 +
    ownerTrust * 1.5 +
    joinability * 1.5 +
    cadence * 1 +
    sizeSanity * 1
  );
  const denom = 3 + 2 + 1.5 + 1.5 + 1 + 1; // 10
  const score = Math.round(priority / denom);
  return { score, components: { relevance, freshness, ownerTrust, joinability, cadence, sizeSanity } };
}

// eslint-disable-next-line no-unused-vars
function shouldDropBasic(item) {
  const reasons = [];
  if (!item) { reasons.push('invalid-item'); return reasons; }
  const type = (item.type || '').toLowerCase();
  const name = item.name || '';
  const tags = item.tags || [];
  if (type === 'href') reasons.push('type:href');
  if (isArchivedLike(name, tags)) reasons.push('archived/deprecated');
  if (isGlobalIrrelevant(name, item.categories, tags)) reasons.push('global/irrelevant');
  return reasons;
}

// eslint-disable-next-line no-unused-vars
function dropArcGisConnectorDupes(items) {
  // Heuristic: if multiple items have similar names and one has permalink to arcgis.com, drop that one.
  // Build index by normalized name key
  const keyFor = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const byKey = new Map();
  for (const it of items) {
    const k = keyFor(it.name);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  }
  const dropIds = new Set();
  for (const group of byKey.values()) {
    if (group.length <= 1) continue;
    const hasCurated = group.some((g) => /(?:datasf|data\.sfgov\.org|open ?data)/i.test(g.domain || 'data.sfgov.org') || TRUSTED_OWNERS.some((re) => re.test(g.owner || '')));
    if (!hasCurated) continue;
    const arcgisLike = group.filter((g) => /arcgis\.com/i.test(g.permalink || ''));
    for (const g of arcgisLike) dropIds.add(g.id);
  }
  return dropIds;
}

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8').catch((e) => {
    console.error(`❌ Cannot read ${INPUT_PATH}: ${e.message}`);
    process.exit(1);
  });
  const payload = JSON.parse(raw);
  const { kept, dropped } = pruneCatalog(payload, {
    domainHint: 'data.sfgov.org',
    boundaryKeepTwo: true,
    minScore: 60,
    retentionMonths: {
      safety: 36,
      housing: 120,
      finance: 144,
      governance: 144,
      transit: 120,
      infrastructure: 60
    }
  });

  // Write outputs
  await fs.mkdir(OUT_DIR, { recursive: true });

  const prunedPath = path.join(OUT_DIR, 'discovery.pruned.json');
  const dropCsvPath = path.join(OUT_DIR, 'discovery.drop.csv');
  const summaryPath = path.join(OUT_DIR, 'prune.summary.md');

  const prunedPayload = {
    source: payload.source || 'socrata',
    domain: payload.domain || 'data.sfgov.org',
    generatedAt: new Date().toISOString(),
    keptCount: kept.length,
    droppedCount: dropped.length,
    kept
  };

  await fs.writeFile(prunedPath, JSON.stringify(prunedPayload, null, 2));

  const csv = ['id,name,reason']
    .concat(dropped.map((d) => {
      const name = (d.name || '').replaceAll('"', '""');
      return `${d.id},"${name}",${d.reason}`;
    }))
    .join('\n');
  await fs.writeFile(dropCsvPath, csv + '\n');

  // Build summary
  const byReason = new Map();
  for (const d of dropped) {
    for (const r of String(d.reason).split('|')) {
      byReason.set(r, (byReason.get(r) || 0) + 1);
    }
  }

  const byOwner = new Map();
  const byCats = new Map();
  for (const k of kept) {
    const owner = k.owner || 'unknown';
    byOwner.set(owner, (byOwner.get(owner) || 0) + 1);
    for (const c of k._prune.categories || []) {
      byCats.set(c, (byCats.get(c) || 0) + 1);
    }
  }

  const topEntries = (m) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const summary = [
    `# SF Discovery Prune Summary`,
    '',
    `Input: ${INPUT_PATH}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `Kept: ${kept.length}`,
    `Dropped: ${dropped.length}`,
    '',
    `## Drop reasons`,
    ...topEntries(byReason).map(([r, n]) => `- ${r}: ${n}`),
    '',
    `## Kept by owner (top)`,
    ...topEntries(byOwner).map(([o, n]) => `- ${o}: ${n}`),
    '',
    `## Kept by category (heuristic)`,
    ...topEntries(byCats).map(([c, n]) => `- ${c}: ${n}`),
  ].join('\n');

  await fs.writeFile(summaryPath, summary + '\n');

  // Console summary
  console.log(`✅ Prune complete`);
  console.log(`Kept: ${kept.length}  Dropped: ${dropped.length}`);
  if (VERBOSE) {
    console.log(`Written:\n- ${prunedPath}\n- ${dropCsvPath}\n- ${summaryPath}`);
  } else {
    console.log(`${path.relative(process.cwd(), prunedPath)}`);
    console.log(`${path.relative(process.cwd(), dropCsvPath)}`);
    console.log(`${path.relative(process.cwd(), summaryPath)}`);
  }
}

main().catch((err) => {
  console.error('❌ Prune failed:', err.message);
  process.exit(1);
});
