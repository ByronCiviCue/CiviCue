import { getDb } from '../kysely.js';
import { isDatabaseDryRun } from '../../lib/secrets/secrets.js';
import type { ResumeState } from './types.js';
import { getMetrics } from '../../observability/metrics.js';

export interface UpsertHostInput {
  region: 'US' | 'EU';
  host: string;
  lastSeen?: Date;
}

export interface UpsertDomainInput {
  domain: string;
  region: 'US' | 'EU';
  country?: string;
  lastSeen?: Date;
}

export interface UpsertAgencyInput {
  host: string;
  name: string;
  type?: string;
}

export interface CatalogItem {
  region: 'US' | 'EU';
  host: string;
  domain: string;
  agency: string | null;
  meta?: unknown;
}

export interface UpsertDatasetInput {
  datasetId: string;
  host: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  publisher?: string;
  updatedAt?: Date;
  rowCount?: number;
  viewCount?: number;
  link?: string;
}

export async function upsertHost(input: UpsertHostInput): Promise<{host: string}> {
  const db = getDb();
  
  const query = db
    .insertInto('catalog.socrata_hosts')
    .values({
      host: input.host,
      region: input.region,
      last_seen: input.lastSeen || new Date(),
    })
    .onConflict((oc) =>
      oc.column('host').doUpdateSet({
        region: input.region,
        last_seen: input.lastSeen || new Date(),
      })
    )
    .returning('host');

  if (isDatabaseDryRun()) {
    return { host: input.host };
  }

  const result = await query.executeTakeFirst();
  if (!result) {
    throw new Error(`Failed to upsert host: ${input.host}`);
  }
  return { host: result.host };
}

export async function upsertDomain(input: UpsertDomainInput): Promise<{domain: string}> {
  const db = getDb();
  
  const query = db
    .insertInto('catalog.socrata_domains')
    .values({
      domain: input.domain,
      country: input.country || null,
      region: input.region,
      last_seen: input.lastSeen || new Date(),
    })
    .onConflict((oc) =>
      oc.column('domain').doUpdateSet({
        country: input.country || null,
        region: input.region,
        last_seen: input.lastSeen || new Date(),
      })
    )
    .returning('domain');

  if (isDatabaseDryRun()) {
    return { domain: input.domain };
  }

  const result = await query.executeTakeFirst();
  if (!result) {
    throw new Error(`Failed to upsert domain: ${input.domain}`);
  }
  return { domain: result.domain };
}

export async function upsertAgency(input: UpsertAgencyInput): Promise<{host: string; name: string}> {
  const db = getDb();
  
  const query = db
    .insertInto('catalog.socrata_agencies')
    .values({
      host: input.host,
      name: input.name,
      type: input.type || null,
      created_at: new Date(),
    })
    .onConflict((oc) =>
      oc.columns(['host', 'name']).doUpdateSet({
        type: input.type || null,
      })
    )
    .returning(['host', 'name']);

  if (isDatabaseDryRun()) {
    return { host: input.host, name: input.name };
  }

  const result = await query.executeTakeFirst();
  if (!result) {
    throw new Error(`Failed to upsert agency: ${input.host}/${input.name}`);
  }
  return { host: result.host, name: result.name };
}

/**
 * Loads resume state for a pipeline from database.
 * @param pipeline Pipeline identifier (e.g., 'socrata_catalog')
 * @returns Resume state or null if not found
 */
const RESUME_STATE_TABLE = 'catalog.resume_state';

export async function loadResumeState(pipeline: string): Promise<ResumeState | null> {
  if (isDatabaseDryRun()) {
    return null;
  }

  const db = getDb();
  const result = await db
    .selectFrom(RESUME_STATE_TABLE)
    .selectAll()
    .where('pipeline', '=', pipeline)
    .executeTakeFirst();

  return result || null;
}

/**
 * Updates resume state for a pipeline in database.
 * @param pipeline Pipeline identifier
 * @param resumeToken Opaque resume token
 * @param processedAt Timestamp when processing completed
 */
export async function updateResumeState(
  pipeline: string,
  resumeToken: string,
  processedAt: Date
): Promise<void> {
  if (isDatabaseDryRun()) {
    return;
  }

  const db = getDb();
  await db
    .insertInto(RESUME_STATE_TABLE)
    .values({
      pipeline,
      resume_token: resumeToken,
      last_processed_at: processedAt,
      updated_at: new Date(),
    })
    .onConflict((oc) =>
      oc.column('pipeline').doUpdateSet({
        resume_token: resumeToken,
        last_processed_at: processedAt,
        updated_at: new Date(),
      })
    )
    .executeTakeFirst();
}

/**
 * Processes a batch of catalog items with idempotent upserts in a transaction.
 * Updates resume state atomically with the batch.
 * @param items Array of catalog items to process
 * @param resumeToken Token to save after successful batch processing
 * @param processedAt Timestamp for resume state
 * @returns Promise resolving when transaction completes
 */
export async function processItemBatch(
  items: CatalogItem[],
  resumeToken: string,
  processedAt: Date
): Promise<void> {
  if (isDatabaseDryRun()) {
    return;
  }

  const db = getDb();
  const metrics = getMetrics();
  const transactionStartTime = Date.now();
  
  await db.transaction().execute(async (trx) => {
    // Process each item in the batch
    for (const item of items) {
      // Upsert host
      await trx
        .insertInto('catalog.socrata_hosts')
        .values({
          host: item.host,
          region: item.region,
          last_seen: processedAt,
        })
        .onConflict((oc) =>
          oc.column('host').doUpdateSet({
            region: item.region,
            last_seen: processedAt,
          })
        )
        .executeTakeFirst();

      // Upsert domain
      await trx
        .insertInto('catalog.socrata_domains')
        .values({
          domain: item.domain,
          country: null, // Will be enriched later if available
          region: item.region,
          last_seen: processedAt,
        })
        .onConflict((oc) =>
          oc.column('domain').doUpdateSet({
            region: item.region,
            last_seen: processedAt,
          })
        )
        .executeTakeFirst();

      // Upsert agency if present
      if (item.agency) {
        await trx
          .insertInto('catalog.socrata_agencies')
          .values({
            host: item.host,
            name: item.agency,
            type: null,
            created_at: processedAt,
          })
          .onConflict((oc) =>
            oc.columns(['host', 'name']).doUpdateSet({
              type: null,
            })
          )
          .executeTakeFirst();
      }
    }

    // Update resume state atomically with the batch
    await trx
      .insertInto(RESUME_STATE_TABLE)
      .values({
        pipeline: 'socrata_catalog',
        resume_token: resumeToken,
        last_processed_at: processedAt,
        updated_at: processedAt,
      })
      .onConflict((oc) =>
        oc.column('pipeline').doUpdateSet({
          resume_token: resumeToken,
          last_processed_at: processedAt,
          updated_at: processedAt,
        })
      )
      .executeTakeFirst();
  });

  // Emit metrics after successful transaction
  const transactionDuration = Date.now() - transactionStartTime;
  metrics.timing('socrata.ingest.db_transaction_duration_ms', transactionDuration);
  metrics.increment('socrata.ingest.db_items_processed_total', items.length);
}

/**
 * Upsert datasets for a host with idempotent behavior.
 * Updates last_seen on existing datasets, sets first_seen on new ones.
 * @param host Host to upsert datasets for
 * @param datasets Array of dataset data to upsert
 * @returns Promise with counts of upserted and updated records
 */
export async function upsertDatasets(
  host: string, 
  datasets: UpsertDatasetInput[]
): Promise<{ upserted: number; updated: number }> {
  if (isDatabaseDryRun()) {
    return { upserted: datasets.length, updated: 0 };
  }

  if (datasets.length === 0) {
    return { upserted: 0, updated: 0 };
  }

  const db = getDb();
  const now = new Date();
  
  // Prepare values for insertion
  const values = datasets.map(dataset => ({
    dataset_id: dataset.datasetId,
    host,
    title: dataset.title || null,
    description: dataset.description || null,
    category: dataset.category || null,
    tags: dataset.tags || null,
    publisher: dataset.publisher || null,
    updated_at: dataset.updatedAt || null,
    row_count: dataset.rowCount || null,
    view_count: dataset.viewCount || null,
    link: dataset.link || null,
    active: true,
    first_seen: now,
    last_seen: now,
  }));

  const result = await db
    .insertInto('catalog.socrata_datasets')
    .values(values)
    .onConflict((oc) =>
      oc.columns(['host', 'dataset_id']).doUpdateSet({
        title: (eb) => eb.ref('excluded.title'),
        description: (eb) => eb.ref('excluded.description'),
        category: (eb) => eb.ref('excluded.category'),
        tags: (eb) => eb.ref('excluded.tags'),
        publisher: (eb) => eb.ref('excluded.publisher'),
        updated_at: (eb) => eb.ref('excluded.updated_at'),
        row_count: (eb) => eb.ref('excluded.row_count'),
        view_count: (eb) => eb.ref('excluded.view_count'),
        link: (eb) => eb.ref('excluded.link'),
        active: true,
        last_seen: now,
      })
    )
    .execute();

  // For simplicity, return total count as upserted (Kysely doesn't easily distinguish insert vs update)
  return { upserted: datasets.length, updated: 0 };
}

/**
 * Mark datasets as inactive if they haven't been seen since cutoffTime.
 * @param host Host to retire stale datasets for
 * @param cutoffTime Datasets last_seen before this time will be marked inactive
 * @returns Promise with count of retired datasets
 */
export async function retireStaleDatasets(
  host: string,
  cutoffTime: Date
): Promise<number> {
  if (isDatabaseDryRun()) {
    return 0;
  }

  const db = getDb();
  const result = await db
    .updateTable('catalog.socrata_datasets')
    .set({ active: false })
    .where('host', '=', host)
    .where('last_seen', '<', cutoffTime)
    .where('active', '=', true)
    .execute();

  return result.length;
}