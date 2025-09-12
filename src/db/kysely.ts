import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { getDatabaseUrl } from '../lib/secrets/secrets.js';
import type { SocrataHosts, SocrataDomains, SocrataAgencies } from './catalog/types.js';

export interface CatalogDB {
  'catalog.socrata_municipality_index': {
    host: string;
    domain: string;
    region: string;
    country: string | null;
    city: string | null;
    agency_count: number;
    dataset_count: number;
    last_seen: Date;
    source: string;
    meta: unknown | null;
  };
  'catalog.socrata_hosts': SocrataHosts;
  'catalog.socrata_domains': SocrataDomains;
  'catalog.socrata_agencies': SocrataAgencies;
}

let _db: Kysely<CatalogDB> | undefined;

export function getDb(): Kysely<CatalogDB> {
  if (_db) return _db;
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error('DATABASE_URL is required to initialize the database');
  }
  const pool = new pg.Pool({ connectionString: url });
  _db = new Kysely<CatalogDB>({ dialect: new PostgresDialect({ pool }) });
  return _db;
}
