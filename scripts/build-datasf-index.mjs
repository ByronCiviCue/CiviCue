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

// Wired for Task 7.2 (not used in scaffold)
// Note: .mjs requires compiled JS from dist/ (NodeNext .js suffix maps to .ts source)
// eslint-disable-next-line no-unused-vars
import { socrataFetch } from '../dist/src/lib/http/socrata.js';
import { resolveSocrataAppToken } from '../dist/src/lib/env-providers/socrata.js';

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

function printHelp() {
  console.log(`
Usage: node scripts/build-datasf-index.mjs [options]

Options:
  --domain=<host>        Socrata domain (default: data.sfgov.org)
  --out=<path>          Output file path (default: municipalities/CA/SF/directory.json)
  --pageSize=<num>      Page size 1-1000 (default: 1000)
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

  console.log(`SF Socrata Registry Builder (Task 7.1 Scaffold)`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Output: ${OUT_PATH}`);
  console.log(`Page Size: ${PAGE_SIZE}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  
  if (VERBOSE) {
    const token = resolveSocrataAppToken(DOMAIN);
    const tokenStatus = token ? 'configured' : 'not configured';
    console.log(`Verbose mode enabled`);
    console.log(`App Token: ${tokenStatus}`);
  }

  if (DRY_RUN) {
    console.log(`
DRY RUN PLAN:
1. Connect to Socrata Discovery API: https://api.us.socrata.com/api/catalog/v1
2. Filter by domain: ${DOMAIN}
3. Paginate with limit=${PAGE_SIZE}
4. Transform results to frozen schema: id,name,type,domain,permalink,createdAt,updatedAt,tags[],categories[],owner,license
5. Sort by name for stable diffs
6. Write to: ${OUT_PATH}

No network calls or file writes performed in this scaffold version.
Next: Implement actual fetching in Task 7.2
`);
    return;
  }

  // TODO: Task 7.2 will implement actual fetching with socrataFetch()
  // const results = await fetchAllPages();
  // await writeRegistry(results);
  
  console.log('Live mode not implemented yet. Use --dryRun for now.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});