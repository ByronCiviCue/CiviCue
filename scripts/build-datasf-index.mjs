// Build a registry of Socrata datasets into a city directory JSON.
// Defaults to DataSF but accepts flags:
//   --domain=<socrata_domain>
//   --out=<output_path>
//   --pageSize=<page_size>
//   --dryRun
//   --verbose
// Usage examples:
//   node scripts/build-datasf-index.mjs --help
//   node scripts/build-datasf-index.mjs --dryRun
//   SOCRATA_APP_TOKEN=... node scripts/build-datasf-index.mjs --domain=data.sfgov.org

// Socrata API client for Task 7.2
// Note: .mjs requires compiled JS from dist/ (NodeNext .js suffix maps to .ts source)
import { socrataFetch } from '../dist/src/lib/http/socrata.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Frozen schema for Socrata dataset registry objects.
 * @typedef {Object} SocrataDatasetRecord
 * @property {string} id - Dataset unique identifier
 * @property {string} name - Human readable dataset name
 * @property {string} type - Dataset type (e.g., "dataset", "chart")
 * @property {string} domain - Socrata domain hosting this dataset
 * @property {string} permalink - Direct link to dataset on Socrata portal
 * @property {string} createdAt - ISO timestamp when dataset was created
 * @property {string} updatedAt - ISO timestamp of last dataset modification
 * @property {string[]} tags - Array of dataset tags
 * @property {string[]} categories - Array of domain categories
 * @property {string} owner - Dataset owner/author
 * @property {string|null} license - Dataset license information
 */

// Helper functions for retry logic and retention
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateBackoff(attempt, baseMs = 100, maxMs = 30000) {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = Math.random() * 0.3 * exponential; // 30% jitter
  return Math.min(exponential + jitter, maxMs);
}

function getDefaultSince() {
  const date = new Date();
  date.setMonth(date.getMonth() - 24);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

async function fetchWithRetry(url, options = {}, maxAttempts = 6) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await socrataFetch(url, options);
      
      if (response.ok) {
        return response;
      }
      
      // Handle 429 Rate Limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : calculateBackoff(attempt);
        const cappedDelay = Math.min(delayMs, 30000);
        if (options.verbose) {
          console.log(`Rate limited. Waiting ${Math.round(cappedDelay/1000)}s...`);
        }
        await sleep(cappedDelay);
        continue;
      }
      
      // Handle 5xx errors with exponential backoff
      if (response.status >= 500) {
        const delayMs = calculateBackoff(attempt);
        if (options.verbose) {
          console.log(`Server error ${response.status}. Retry ${attempt + 1}/${maxAttempts} after ${Math.round(delayMs)}ms`);
        }
        await sleep(delayMs);
        continue;
      }
      
      // Fail fast on other 4xx errors
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      
    } catch (error) {
      // Handle network errors (ECONNRESET, etc)
      if (attempt < maxAttempts - 1 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
        const delayMs = calculateBackoff(attempt);
        if (options.verbose) {
          console.log(`Network error. Retry ${attempt + 1}/${maxAttempts} after ${Math.round(delayMs)}ms`);
        }
        await sleep(delayMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Failed after ${maxAttempts} attempts`);
}

async function fetchAll(domain, pageSize, { verbose, since, until }) {
  const baseUrl = `https://${domain}/api/views`;
  const allResults = [];
  const seenIds = new Set(); // Track seen IDs to detect duplicates
  let offset = 0;
  let pageCount = 0;
  let duplicateCount = 0;
  
  // Determine retention horizon
  const effectiveSince = since || getDefaultSince();
  const effectiveUntil = until || new Date().toISOString().split('T')[0];
  
  if (verbose) {
    console.log(`Fetching datasets from ${domain}`);
    console.log(`Retention horizon: ${effectiveSince} to ${effectiveUntil}`);
  }
  
  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set('limit', String(pageSize));
    url.searchParams.set('offset', String(offset));
    
    const response = await fetchWithRetry(url.toString(), { verbose });
    const results = await response.json();
    
    if (!Array.isArray(results) || results.length === 0) {
      break; // No more results
    }
    
    // Filter out duplicates and add new items
    const newResults = [];
    for (const item of results) {
      if (item?.id && !seenIds.has(item.id)) {
        seenIds.add(item.id);
        newResults.push(item);
      } else if (item?.id) {
        duplicateCount++;
      }
    }
    
    // If we got all duplicates, we've reached the end
    if (newResults.length === 0) {
      if (verbose) {
        console.log(`Page ${pageCount + 1}: all ${results.length} items were duplicates, stopping`);
      }
      break;
    }
    
    allResults.push(...newResults);
    pageCount++;
    offset += results.length; // Still advance by full page size for API offset
    
    if (verbose) {
      console.log(`Page ${pageCount}: fetched ${results.length} items, ${newResults.length} new (total: ${allResults.length})`);
    }
    
    // Stop if we got fewer results than requested (last page)
    if (results.length < pageSize) {
      break;
    }
    
    // Safety valve: stop if we've seen too many duplicates (likely at end)
    if (duplicateCount > pageSize) {
      if (verbose) {
        console.log(`Stopping due to excessive duplicates (${duplicateCount})`);
      }
      break;
    }
  }
  
  if (verbose) {
    console.log(`Completed: ${pageCount} pages, ${allResults.length} total items (${duplicateCount} duplicates filtered)`);
  }
  
  return allResults;
}

/**
 * Convert epoch timestamp to ISO string
 * @param {number|string|null} timestamp - Epoch seconds or null
 * @returns {string|null} - ISO string or null
 */
function epochToIso(timestamp) {
  if (!timestamp) return null;
  const epochMs = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(epochMs)) return null;
  return new Date(epochMs * 1000).toISOString();
}

/**
 * Normalize a single Dataset API item to our frozen schema
 * @param {Object} item - Raw Dataset API result item
 * @param {string} domain - CLI domain argument to use for all items
 * @param {string} effectiveSince - ISO date string for retention filtering
 * @param {string} effectiveUntil - ISO date string for retention filtering  
 * @param {boolean} includeStale - Whether to include stale datasets
 * @returns {Object|null} - Normalized item or null if filtered out
 */
function normalize(item, domain, effectiveSince, effectiveUntil, includeStale = false) {
  if (!item?.id) {
    return null; // Skip items without valid ID
  }

  // Date extraction for retention gate (day-level comparison)
  const rawUpdated = item.rowsUpdatedAt ?? item.createdAt ?? null;
  const candidateDay = rawUpdated ? epochToIso(rawUpdated)?.slice(0, 10) : null; // YYYY-MM-DD
  
  // Determine filter field
  let filterField = 'none';
  if (item.rowsUpdatedAt) {
    filterField = 'updatedAt';
  } else if (item.indexUpdatedAt) {
    filterField = 'indexUpdatedAt';
  }
  
  // Retention gate - day-level comparison
  if (!includeStale && candidateDay && candidateDay < effectiveSince) {
    return null; // Filter out stale dataset
  }
  
  // Defensive posture: include datasets with missing metadata
  
  return {
    id: item.id,
    name: item.name ?? null,
    type: item.viewType ?? item.type ?? null,
    domain: domain, // Use CLI domain argument
    permalink: `https://${domain}/d/${item.id}`,
    createdAt: epochToIso(item.createdAt),
    updatedAt: epochToIso(item.rowsUpdatedAt ?? item.createdAt),
    tags: item.tags ?? [],
    categories: item.category ? [item.category] : [],
    owner: item.owner?.displayName ?? item.owner?.id ?? null,
    license: item.metadata?.license ?? item.license ?? null,
    retention: {
      normalizedSince: effectiveSince,
      normalizedUntil: effectiveUntil,
      filter: filterField
    }
  };
}

/**
 * Normalize all Dataset API results with retention filtering and deduplication
 * @param {Array} items - Raw Dataset API results
 * @param {string} domain - CLI domain argument
 * @param {string} effectiveSince - ISO date for retention start
 * @param {string} effectiveUntil - ISO date for retention end
 * @param {boolean} includeStale - Whether to skip stale filtering
 * @param {boolean} verbose - Whether to show diagnostics
 * @returns {Object} - { normalized: Array, stats: Object }
 */
function normalizeAll(items, domain, effectiveSince, effectiveUntil, includeStale = false, verbose = false) {
  const stats = {
    preCount: items.length,
    postCount: 0,
    excludedStaleCount: 0,
    filterFieldStats: { updatedAt: 0, indexUpdatedAt: 0, none: 0 }
  };
  
  // Map for deduplication (latest wins)
  const byId = new Map();
  
  for (const item of items) {
    const result = normalize(item, domain, effectiveSince, effectiveUntil, includeStale);
    
    if (result) {
      // Deduplication logic - latest updatedAt wins
      const existing = byId.get(result.id);
      if (!existing) {
        // First occurrence
        byId.set(result.id, result);
        stats.filterFieldStats[result.retention.filter]++;
      } else {
        // Handle collision - keep latest updatedAt
        const resultDay = result.updatedAt ? String(result.updatedAt).slice(0, 10) : null;
        const existingDay = existing.updatedAt ? String(existing.updatedAt).slice(0, 10) : null;
        
        if (resultDay && (!existingDay || resultDay > existingDay)) {
          // New result is newer, replace
          byId.set(result.id, result);
          // Stats already counted the existing one, adjust for new filter field
          if (existing.retention.filter !== result.retention.filter) {
            stats.filterFieldStats[existing.retention.filter]--;
            stats.filterFieldStats[result.retention.filter]++;
          }
        }
        // If existing is newer or equal, keep it (no changes needed)
      }
    } else if (item?.id) {
      // Item was filtered out due to staleness
      stats.excludedStaleCount++;
      // Track which field would have been used for stats
      if (item.rowsUpdatedAt) {
        stats.filterFieldStats.updatedAt++;
      } else if (item.indexUpdatedAt) {
        stats.filterFieldStats.indexUpdatedAt++;
      } else {
        stats.filterFieldStats.none++;
      }
    }
  }
  
  // Convert to array and apply stable sort
  const normalized = Array.from(byId.values());
  normalized.sort((a, b) => 
    (a.name?.localeCompare(b.name ?? '') ?? 0) || a.id.localeCompare(b.id)
  );
  
  stats.postCount = normalized.length;
  
  if (verbose) {
    console.log(`Normalization stats:`);
    console.log(`  Pre-normalization: ${stats.preCount} items`);
    console.log(`  Stale excluded: ${stats.excludedStaleCount}`);
    console.log(`  Post-normalization: ${stats.postCount} items (after dedup)`);
    console.log(`  Filter fields: updatedAt=${stats.filterFieldStats.updatedAt}, indexUpdatedAt=${stats.filterFieldStats.indexUpdatedAt}, none=${stats.filterFieldStats.none}`);
    if (includeStale) {
      console.log(`  Stale filtering disabled (--includeStale)`);
    }
  }
  
  return { normalized, stats };
}

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = true] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
);

// CLI argument defaults and validation
const DOMAIN = args.domain || 'data.sfgov.org';
const OUT_PATH = args.out || 'municipalities/CA/SF/directory.json';
const PAGE_SIZE = Math.max(1, Math.min(1000, parseInt(args.pageSize || '1000', 10)));
const DRY_RUN = args.dryRun === true || args.dryRun === 'true';
const VERBOSE = args.verbose === true || args.verbose === 'true';
const SINCE = args.since || null;  // YYYY-MM-DD format
const UNTIL = args.until || null;  // YYYY-MM-DD format
const INCLUDE_STALE = args.includeStale === true || args.includeStale === 'true';

function printHelp() {
  console.log(`
Usage: node scripts/build-datasf-index.mjs [options]

Options:
  --domain=<host>        Socrata domain (default: data.sfgov.org)
  --out=<path>          Output file path (default: municipalities/CA/SF/directory.json)
  --pageSize=<num>      Page size 1-1000 (default: 1000)
  --since=<YYYY-MM-DD>  Start date for retention filter (default: 24 months ago)
  --until=<YYYY-MM-DD>  End date for retention filter (default: today)
  --includeStale        Include stale datasets in output (skip retention filtering)
  --dryRun              Parse args and show plan only, no network/disk I/O
  --verbose             Enable verbose logging
  --help                Show this help

Examples:
  node scripts/build-datasf-index.mjs --help
  node scripts/build-datasf-index.mjs --dryRun
  SOCRATA_APP_TOKEN=xyz node scripts/build-datasf-index.mjs
  SOCRATA__data.sfgov.org__APP_TOKEN=xyz node scripts/build-datasf-index.mjs
  node scripts/build-datasf-index.mjs --domain=data.detroitmi.gov --out=municipalities/MI/Detroit/directory.json

Environment:
  SOCRATA_APP_TOKEN     Global app token for Socrata API rate limit increases
  SOCRATA__<HOST>__APP_TOKEN  Host-specific token override (e.g., SOCRATA__data.sfgov.org__APP_TOKEN)
  SOCRATA_APP_ID        Legacy token name (still supported by resolver)
`);
}

async function main() {
  if (args.help) {
    printHelp();
    return;
  }

  console.log(`SF Socrata Registry Builder (Task 7.2)`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Output: ${OUT_PATH}`);
  console.log(`Page Size: ${PAGE_SIZE}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  
  const effectiveSince = SINCE || getDefaultSince();
  const effectiveUntil = UNTIL || new Date().toISOString().split('T')[0];
  
  if (VERBOSE) {
    console.log(`Verbose mode enabled`);
  }

  if (DRY_RUN) {
    console.log(`
DRY RUN PLAN:
1. Connect to Socrata Dataset API: https://${DOMAIN}/api/views
2. Use offset/limit pagination (limit=${PAGE_SIZE} per page)
3. Retention horizon: ${effectiveSince} to ${effectiveUntil}
4. Transform results to frozen schema: id,name,type,domain,permalink,createdAt,updatedAt,tags[],categories[],owner,license
5. Sort by name for stable diffs
6. Write to: ${OUT_PATH}

No network calls or file writes performed in this dry-run mode.
`);
    return;
  }

  const rawResults = await fetchAll(DOMAIN, PAGE_SIZE, { 
    verbose: VERBOSE, 
    since: effectiveSince,
    until: effectiveUntil 
  });
  console.log(`Fetched ${rawResults.length} catalog items from ${DOMAIN} since ${effectiveSince}`);

  // Normalize results with retention enforcement at catalog level
  const { normalized, stats } = normalizeAll(rawResults, DOMAIN, effectiveSince, effectiveUntil, INCLUDE_STALE, VERBOSE);
  console.log(`Normalized ${normalized.length} items (${stats.excludedStaleCount} stale excluded)`);

  // Build payload with frozen schema
  const payload = {
    schemaVersion: 1,
    source: 'socrata',
    domain: DOMAIN,
    generatedAt: new Date().toISOString(),
    retention: { since: effectiveSince, until: effectiveUntil },
    totalCount: normalized.length,
    datasets: normalized
  };

  // Safety threshold check
  if (normalized.length < 200 && !INCLUDE_STALE) {
    console.error(`Safety threshold not met: only ${normalized.length} datasets (minimum 200 required).`);
    console.error('Use --includeStale to override this safety check.');
    process.exit(1);
  }

  // Ensure directory exists
  const outputDir = path.dirname(OUT_PATH);
  await fs.mkdir(outputDir, { recursive: true });

  // Atomic write
  const tempPath = `${OUT_PATH}.tmp`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(payload, null, 2));
    await fs.rename(tempPath, OUT_PATH);
    console.log(`Wrote ${OUT_PATH} with ${normalized.length} datasets (horizon ${effectiveSince}..${effectiveUntil})`);
  } catch (err) {
    // Clean up temp file on error
    try {
      await fs.unlink(tempPath);
    } catch {}
    throw err;
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});