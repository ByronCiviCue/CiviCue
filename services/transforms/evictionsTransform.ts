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

    const transformQuery = `
      WITH src AS (
        SELECT
          (r.data->>'case_number')::text        AS case_number,
          trim((r.data->>'address'))            AS address,
          NULLIF(r.data->>'filing_date','')::date AS filing_date,
          trim((r.data->>'reason'))             AS reason,
          NULLIF(r.data->>'district','')::int   AS district,
          r.ingested_at                         AS ingested_at
        FROM landing_raw.evictions_raw r
      ),
      canon AS (
        SELECT
          s.*,
          md5(
            jsonb_canon_text(
              jsonb_build_object(
                'case_number', s.case_number,
                'address', s.address,
                'filing_date', to_char(s.filing_date, 'YYYY-MM-DD'),
                'reason', s.reason,
                'district', s.district
              )::jsonb
            )
          ) AS row_hash
        FROM src s
      )
      INSERT INTO staging_clean.evictions
        (case_number, address, filing_date, reason, district, row_hash, ingested_at)
      SELECT
        case_number, address, filing_date, reason, district, row_hash, now()
      FROM canon
      WHERE case_number IS NOT NULL
      ON CONFLICT (row_hash) DO NOTHING;
    `;

    logger.info('Running evictions staging transform...');
    const result = await client.query(transformQuery);
    
    const rowCount = result.rowCount || 0;
    logger.info(`Transform completed: ${rowCount} rows inserted into staging_clean.evictions`);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Transform failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main();
}