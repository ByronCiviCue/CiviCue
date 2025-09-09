import { socrataHeadersFor } from '../../lib/env-providers/socrata.js';
import type { DatasetMetadata, LogicalType, NormalizedColumn } from './types.js';

interface SocrataViewColumn {
  id: number;
  name: string;
  fieldName: string;
  dataTypeName: string;
  format?: { [k: string]: unknown } | null;
  description?: string | null;
  hidden?: boolean;
  flags?: string[] | null;
  position?: number;
  renderTypeName?: string | null;
  subColumnType?: string | null;
}

interface SocrataViewResponse {
  columns?: SocrataViewColumn[];
}

export async function fetchDatasetMetadata({ domain, datasetId }: { domain: string; datasetId: string }): Promise<DatasetMetadata> {
  const url = new URL(`https://${domain}/api/views/${datasetId}.json`);
  const headers: Record<string, string> = { Accept: 'application/json', ...socrataHeadersFor(domain) };
  const res = await fetch(url.toString(), { method: 'GET', headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Socrata ${res.status} for ${url}: ${body.slice(0, 256)}`);
  }
  const json = (await res.json()) as SocrataViewResponse;
  const rawCols = Array.isArray(json.columns) ? json.columns : [];
  const columns: NormalizedColumn[] = rawCols.map(normalizeColumn);
  return { id: datasetId, domain, columns };
}

export function normalizeColumn(c: SocrataViewColumn): NormalizedColumn {
  const apiType = c.dataTypeName ?? 'unknown';
  const logicalType = mapLogicalType(apiType, c);
  const nullable = inferNullable(c);
  return {
    id: c.id,
    name: c.name,
    fieldName: c.fieldName,
    apiType,
    logicalType,
    nullable,
    hidden: Boolean(c.hidden),
    description: c.description ?? undefined,
  };
}

export function mapLogicalType(apiType: string, c?: Pick<SocrataViewColumn, 'renderTypeName' | 'subColumnType' | 'format'>): LogicalType {
  const t = (apiType || '').toLowerCase();
  switch (t) {
    case 'text':
    case 'html':
      return 'text';
    case 'number':
    case 'double':
    case 'int':
      return 'number';
    case 'checkbox':
    case 'boolean':
      return 'checkbox';
    case 'calendar_date':
    case 'date':
      return 'date';
    case 'point':
      return 'point';
    case 'polygon':
      return 'polygon';
    case 'location': {
      const sub = (c?.subColumnType || '').toLowerCase();
      if (sub === 'point') return 'point';
      if (sub === 'polygon') return 'polygon';
      return 'location';
    }
    case 'url':
      return 'url';
    case 'email':
      return 'email';
    case 'phone':
      return 'phone';
    case 'percent':
      return 'percent';
    case 'money':
      return 'money';
    case 'floating_timestamp':
    case 'fixed_timestamp':
    case 'timestamp':
    case 'date_time':
      return 'datetime';
    case 'json':
      return 'json';
    default:
      return 'unknown';
  }
}

function inferNullable(c: SocrataViewColumn): boolean {
  const flags = c.flags || [];
  return !flags.map((f) => f.toLowerCase()).includes('required');
}

export type { DatasetMetadata, NormalizedColumn, LogicalType };
