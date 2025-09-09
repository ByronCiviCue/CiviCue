#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

async function main() {
  // Guard CI usage
  const proc = globalThis.process;
  const env = proc?.env ?? {};
  if (env.CI) {
    proc.stderr.write('CI environment detected; refusing to apply SQL.\n');
    proc.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const explicitFiles = args
    .filter(a => a.startsWith('--file='))
    .map(a => a.slice('--file='.length));

  const files = explicitFiles.length > 0
    ? explicitFiles
    : ['__docs__/migrations/socrata-catalog.sql'];

  if (!dryRun && !env.DATABASE_URL) {
    proc.stderr.write('DATABASE_URL is required (use --dry-run to skip).\n');
    proc.exit(1);
  }

  let pool = null;
  try {
    if (!dryRun) {
      pool = new Pool({ connectionString: env.DATABASE_URL });
    }

    for (const file of files) {
      const sql = await readFile(file, 'utf8');
      if (dryRun) {
        proc.stdout.write(`Applied: ${file} (dry-run)\n`);
      } else {
        await pool.query(sql);
        proc.stdout.write(`Applied: ${file}\n`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    proc.stderr.write(`${msg}\n`);
    proc.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

main();
