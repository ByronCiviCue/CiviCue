import { getDb } from '../kysely.js';
import { isDatabaseDryRun } from '../../lib/secrets/secrets.js';
import type { ResumeState } from './types.js';

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
}