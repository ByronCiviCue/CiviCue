import crypto from 'crypto';

type JSONLike = null | string | number | boolean | JSONLike[] | { [k: string]: JSONLike };

function normalize(value: unknown): JSONLike {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === 'object') {
    const out: Record<string, JSONLike> = {};
    for (const k of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      const lk = k.toLowerCase();
      // eslint-disable-next-line security/detect-object-injection
      const v = (value as Record<string, unknown>)[k];
      // eslint-disable-next-line security/detect-object-injection
      out[lk] = typeof v === 'string' ? v.trim() : normalize(v);
    }
    return out;
  }
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value) as unknown as JSONLike;
}

/** Deterministic row hash (sha256) over a canonical JSON form. */
export function stableRowHash(input: unknown): string {
  const normalized = normalize(input);
  const json = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(json).digest('hex');
}

export default stableRowHash;