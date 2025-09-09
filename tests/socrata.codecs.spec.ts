import { describe, it, expect } from 'vitest';
import { getCodecs, codecFor } from '../src/adapters/socrata/codecs.js';

describe('Socrata codecs', () => {
  const codecs = getCodecs();

  it('parses number-like values', () => {
    expect(codecs.number.parse('42')).toBe(42);
    expect(codecs.number.parse(3.14)).toBe(3.14);
    expect(codecs.number.parse(null)).toBeNull();
  });

  it('parses booleans from diverse inputs', () => {
    expect(codecs.checkbox.parse('true')).toBe(true);
    expect(codecs.checkbox.parse('0')).toBe(false);
    expect(codecs.checkbox.parse(1)).toBe(true);
    expect(codecs.checkbox.parse(null)).toBeNull();
  });

  it('parses and formats dates', () => {
    const d = codecs.date.parse('2020-01-01T00:00:00.000Z');
    expect(d).not.toBeNull();
    expect(d instanceof Date).toBe(true);
    expect(codecs.date.format(d as Date)).toBe('2020-01-01T00:00:00.000Z');
  });

  it('handles location and geojson', () => {
    const loc = codecs.location.parse({ latitude: '37.7', longitude: -122.4, human_address: 'SF' });
    expect(loc).toMatchObject({ latitude: 37.7, longitude: -122.4, human_address: 'SF' });
    const pt = codecs.point.parse({ type: 'Point', coordinates: [-122.4, 37.7] });
    expect(pt).toEqual({ type: 'Point', coordinates: [-122.4, 37.7] });
  });

  it('codecFor returns matching codec', () => {
    expect(codecFor('text')).toBe(codecs.text);
    expect(codecFor('json')).toBe(codecs.json);
  });

  it('returns same singleton instance on repeated getCodecs()', () => {
    expect(getCodecs()).toBe(getCodecs());
  });
});
