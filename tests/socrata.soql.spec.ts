import { describe, it, expect } from 'vitest';
import { buildSoql, serializeValue, isAllowedField, type SoqlBuildInput } from '../src/adapters/socrata/soql.js';

describe('SoQL builder', () => {
  const fields = ['id', 'name', 'created_at', 'amount'] as const;

  it('validates identifiers across select/where/order/group', () => {
    const input: SoqlBuildInput = { fields, select: ['id', 'nope'] } as any;
    expect(() => buildSoql(input)).toThrow(/nope/);
    expect(isAllowedField('name', fields)).toBe(true);
    expect(isAllowedField('nope', fields)).toBe(false);
  });

  it('builds select+where+order+group+limit+offset', () => {
    const result = buildSoql({
      fields,
      select: ['id', 'name'],
      where: [
        { field: 'name', op: '=', value: "O'Hare" },
        { field: 'amount', op: '>', value: 10 },
      ],
      order: [{ field: 'created_at', dir: 'DESC' }],
      groupBy: ['id'],
      limit: 50,
      offset: 100,
    });
    expect(result.params.$select).toBe('id,name');
    expect(result.params.$where).toBe("name = 'O''Hare' AND amount > 10");
    expect(result.params.$order).toBe('created_at DESC');
    expect(result.params.$group).toBe('id');
    expect(result.params.$limit).toBe('50');
    expect(result.params.$offset).toBe('100');
  });

  it('serializes strings safely', () => {
    expect(serializeValue("O'Hare")).toBe("'O''Hare'");
  });

  it('arrays and BETWEEN', () => {
    const r1 = buildSoql({
      fields,
      where: [{ field: 'name', op: 'IN', value: ['A', 'B'] }],
    });
    expect(r1.params.$where).toBe("name IN ('A','B')");

    const r2 = buildSoql({
      fields,
      where: [{ field: 'created_at', op: 'BETWEEN', value: [new Date('2020-01-01T00:00:00Z'), new Date('2020-12-31T00:00:00Z')] }],
    });
    expect(r2.params.$where).toBe("created_at BETWEEN '2020-01-01T00:00:00.000Z' AND '2020-12-31T00:00:00.000Z'");
  });

  it('null handling with IS NULL / IS NOT NULL', () => {
    const r1 = buildSoql({ fields, where: [{ field: 'amount', op: 'IS NULL' }] });
    expect(r1.params.$where).toBe('amount IS NULL');
    const r2 = buildSoql({ fields, where: [{ field: 'amount', op: 'IS NOT NULL', value: 123 }] });
    expect(r2.params.$where).toBe('amount IS NOT NULL');
  });

  it('extra passthrough only for $-prefixed keys', () => {
    const r = buildSoql({ fields, extra: { $q: 'test', q: 'nope' as any } });
    expect(r.params.$q).toBe('test');
    expect(Object.keys(r.params)).not.toContain('q');
  });
});

