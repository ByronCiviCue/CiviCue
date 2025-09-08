#!/usr/bin/env node

// Validation script for SF Socrata directory.json
// Task 7.5: Strict schema validation with deterministic exit codes
// Usage:
//   node scripts/validate-datasf-index.mjs
//   node scripts/validate-datasf-index.mjs --file=path/to/directory.json --domain=data.sfgov.org
//   node scripts/validate-datasf-index.mjs --allowLowCount  # WARNING: turns threshold failure into warning

import { z } from 'zod';
import fs from 'fs/promises';

// Parse CLI arguments
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v = true] = a.replace(/^--/, '').split('=');
      return [k, v];
    }),
);

// CLI defaults
const FILE_PATH = args.file || 'municipalities/CA/SF/directory.json';
const EXPECTED_DOMAIN = args.domain || 'data.sfgov.org';
const ALLOW_LOW_COUNT = args.allowLowCount === true || args.allowLowCount === 'true';
const THRESHOLD = 200;

// Frozen schema for dataset records (7.3 normalized shape)
const DatasetRecordSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  domain: z.string(),
  permalink: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  tags: z.array(z.string()),
  categories: z.array(z.string()),
  owner: z.string().nullable(),
  license: z.string().nullable(),
  retention: z.object({
    normalizedSince: z.string(),
    normalizedUntil: z.string(),
    filter: z.string()
  })
}).strict(); // No extra keys allowed

// Frozen payload schema
const PayloadSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal('socrata'),
  domain: z.string(),
  generatedAt: z.string(),
  retention: z.object({
    since: z.string(),
    until: z.string()
  }),
  totalCount: z.number(),
  datasets: z.array(DatasetRecordSchema)
}).strict(); // No extra keys allowed

// ISO 8601 date validation
function isValidISO8601(dateStr) {
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && date.toISOString() === dateStr;
}

// YYYY-MM-DD date validation
function isValidDateFormat(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function compareDates(since, until) {
  return new Date(since) <= new Date(until);
}

async function main() {
  const errors = [];
  
  console.log(`SF Socrata Registry Validator (Task 7.5)`);
  console.log(`File: ${FILE_PATH}`);
  console.log(`Expected domain: ${EXPECTED_DOMAIN}`);
  console.log(`Threshold: ${THRESHOLD} datasets (${ALLOW_LOW_COUNT ? 'warning mode' : 'strict'})`);
  console.log();

  try {
    // Read file
    const fileContent = await fs.readFile(FILE_PATH, 'utf8');
    const data = JSON.parse(fileContent);

    // Validate schema structure
    const parseResult = PayloadSchema.safeParse(data);
    if (!parseResult.success) {
      errors.push(`Schema validation failed: ${parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')}`);
    }

    // Validate header fields
    if (data.schemaVersion !== 1) {
      errors.push(`Invalid schemaVersion: expected 1, got ${data.schemaVersion}`);
    }

    if (data.source !== 'socrata') {
      errors.push(`Invalid source: expected 'socrata', got '${data.source}'`);
    }

    if (data.domain !== EXPECTED_DOMAIN) {
      errors.push(`Invalid domain: expected '${EXPECTED_DOMAIN}', got '${data.domain}'`);
    }

    if (!isValidISO8601(data.generatedAt)) {
      errors.push(`Invalid generatedAt: not valid ISO 8601 format`);
    }

    // Validate retention dates
    if (!isValidDateFormat(data.retention?.since)) {
      errors.push(`Invalid retention.since: expected YYYY-MM-DD format`);
    }

    if (!isValidDateFormat(data.retention?.until)) {
      errors.push(`Invalid retention.until: expected YYYY-MM-DD format`);
    }

    if (data.retention?.since && data.retention?.until) {
      if (!compareDates(data.retention.since, data.retention.until)) {
        errors.push(`Invalid retention range: since (${data.retention.since}) > until (${data.retention.until})`);
      }
    }

    // Validate counts
    const actualCount = data.datasets?.length || 0;
    if (data.totalCount !== actualCount) {
      errors.push(`Count mismatch: totalCount=${data.totalCount}, datasets.length=${actualCount}`);
    }

    // Validate threshold
    if (actualCount < THRESHOLD) {
      const msg = `Dataset count below threshold: ${actualCount} < ${THRESHOLD}`;
      if (ALLOW_LOW_COUNT) {
        console.warn(`⚠️  WARNING: ${msg}`);
      } else {
        errors.push(msg);
      }
    }

    // Validate each dataset conforms to normalized shape
    if (data.datasets && Array.isArray(data.datasets)) {
      data.datasets.forEach((dataset, idx) => {
        const result = DatasetRecordSchema.safeParse(dataset);
        if (!result.success) {
          errors.push(`Dataset[${idx}] validation failed: ${result.error.errors.map(e => e.message).join('; ')}`);
        }

        // Additional retention field validation
        if (dataset.retention) {
          if (!isValidDateFormat(dataset.retention.normalizedSince)) {
            errors.push(`Dataset[${idx}].retention.normalizedSince: invalid date format`);
          }
          if (!isValidDateFormat(dataset.retention.normalizedUntil)) {
            errors.push(`Dataset[${idx}].retention.normalizedUntil: invalid date format`);
          }
          if (!['updatedAt', 'indexUpdatedAt', 'none'].includes(dataset.retention.filter)) {
            errors.push(`Dataset[${idx}].retention.filter: invalid value '${dataset.retention.filter}'`);
          }
        }
      });
    }

    // Report results
    if (errors.length === 0) {
      console.log(`✅ Validation passed: ${actualCount} datasets`);
      process.exit(0);
    } else {
      console.error(`❌ Validation failed with ${errors.length} error(s):`);
      errors.forEach(err => console.error(`  - ${err}`));
      process.exit(1);
    }

  } catch (err) {
    console.error(`❌ Fatal error: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});