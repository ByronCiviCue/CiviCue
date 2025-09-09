import { describe, it, expect, vi } from 'vitest';
import { fetchDatasetMetadata, mapLogicalType, normalizeColumn } from '../src/adapters/socrata/metadata.js';

const domain = 'example.socrata.test';

describe('socrata metadata normalization', () => {
  it('maps common api types to logical types', () => {
    expect(mapLogicalType('text')).toBe('text');
    expect(mapLogicalType('number')).toBe('number');
    expect(mapLogicalType('boolean')).toBe('checkbox');
    expect(mapLogicalType('calendar_date')).toBe('date');
    expect(mapLogicalType('floating_timestamp')).toBe('datetime');
    expect(mapLogicalType('money')).toBe('money');
    expect(mapLogicalType('percent')).toBe('percent');
    expect(mapLogicalType('url')).toBe('url');
    expect(mapLogicalType('email')).toBe('email');
    expect(mapLogicalType('phone')).toBe('phone');
    expect(mapLogicalType('json')).toBe('json');
    expect(mapLogicalType('unknown-type')).toBe('unknown');
  });

  it('handles location with subtypes', () => {
    expect(mapLogicalType('location', { subColumnType: 'point', renderTypeName: null, format: null })).toBe('point');
    expect(mapLogicalType('location', { subColumnType: 'polygon', renderTypeName: null, format: null })).toBe('polygon');
    expect(mapLogicalType('location', { subColumnType: undefined, renderTypeName: null, format: null })).toBe('location');
  });

  it('normalizes columns and infers nullability', () => {
    const col = normalizeColumn({
      id: 1,
      name: 'Amount',
      fieldName: 'amount',
      dataTypeName: 'money',
      flags: ['primary_key'],
      format: null,
      hidden: false,
      description: 'Dollar amount',
      position: 0,
      renderTypeName: null,
      subColumnType: null,
    } as any);
    expect(col.logicalType).toBe('money');
    expect(col.nullable).toBe(true);

    const required = normalizeColumn({
      id: 2,
      name: 'ID',
      fieldName: 'id',
      dataTypeName: 'number',
      flags: ['required'],
      format: null,
      hidden: false,
      description: 'Identifier',
      position: 1,
      renderTypeName: null,
      subColumnType: null,
    } as any);
    expect(required.nullable).toBe(false);
  });
});

describe('fetchDatasetMetadata', () => {
  it('fetches and returns normalized metadata (no network)', async () => {
    const payload = {
      columns: [
        { id: 1, name: 'ID', fieldName: 'id', dataTypeName: 'number', flags: ['required'] },
        { id: 2, name: 'Name', fieldName: 'name', dataTypeName: 'text' },
        { id: 3, name: 'When', fieldName: 'when', dataTypeName: 'floating_timestamp' },
      ],
    };

    const mockFetch = vi.spyOn(globalThis, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as any);

    const meta = await fetchDatasetMetadata({ domain, datasetId: 'abcd-1234' });
    expect(meta.id).toBe('abcd-1234');
    expect(meta.domain).toBe(domain);
    expect(meta.columns).toHaveLength(3);
    expect(meta.columns[0]).toMatchObject({ fieldName: 'id', logicalType: 'number', nullable: false });
    expect(meta.columns[2].logicalType).toBe('datetime');

    mockFetch.mockRestore();
  });
});

