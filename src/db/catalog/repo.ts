import { getDb } from '../kysely.js';
import { isDatabaseDryRun } from '../../lib/secrets/secrets.js';

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