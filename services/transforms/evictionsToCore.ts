import 'dotenv/config';
import { Client } from 'pg';
import pino from 'pino';

const logger = pino({ level: 'info' });

async function main(): Promise<void> {
  const client = new Client({
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'dev',
    password: process.env.PGPASSWORD || 'dev',
    database: process.env.PGDATABASE || 'civicue'
  });

  try {
    await client.connect();
    logger.info('Connected to database');

    const upsertQuery = `
      INSERT INTO core.fact_evictions
        (case_number, address, filing_date, reason, district, source, ingested_at)
      SELECT
        s.case_number,
        s.address,
        s.filing_date,
        s.reason,
        s.district,
        'staging' AS source,
        now() AS ingested_at
      FROM staging_clean.evictions s
      WHERE s.case_number IS NOT NULL
      ON CONFLICT (case_number) DO NOTHING;
    `;

    logger.info('Running evictions staging→core upsert...');
    const result = await client.query(upsertQuery);
    
    const rowCount = result.rowCount || 0;
    logger.info(`Upsert completed: ${rowCount} rows inserted into core.fact_evictions`);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Upsert failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main();
}