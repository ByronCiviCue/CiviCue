// Simple codecs for Socrata JSON <-> canonical runtime types
// TODO: Consolidate LogicalType export surface if needed; for now we only expose codecs.

export type Codec<TIn = unknown, TOut = unknown> = {
  parse: (raw: TIn) => TOut;
  format: (val: TOut) => TIn;
};

export interface Codecs {
  text: Codec<string | null, string | null>;
  number: Codec<string | number | null, number | null>;
  money: Codec<string | number | null, number | null>;
  percent: Codec<string | number | null, number | null>;
  checkbox: Codec<boolean | string | number | null, boolean | null>;
  date: Codec<string | Date | null, Date | null>;
  datetime: Codec<string | Date | null, Date | null>;
  url: Codec<string | null, string | null>;
  email: Codec<string | null, string | null>;
  phone: Codec<string | null, string | null>;
  location: Codec<unknown, { latitude?: number; longitude?: number; human_address?: string } | null>;
  point: Codec<unknown, { type: 'Point'; coordinates: [number, number] } | null>;
  polygon: Codec<unknown, { type: 'Polygon'; coordinates: number[][][] } | null>;
  json: Codec<unknown, unknown>;
  unknown: Codec<unknown, unknown>;
}

function parseNumberLike(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'y' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'n' || s === 'no') return false;
  }
  return null;
}

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function initCodecs(): Codecs {
  const jsonPass: Codec = {
    parse: (x) => x,
    format: (x) => x,
  };
  return {
    text: {
      parse: (v) => (v == null ? null : String(v)),
      format: (v) => (v == null ? null : String(v)),
    },
    number: {
      parse: parseNumberLike,
      format: (v) => (v == null ? null : v),
    },
    money: {
      parse: parseNumberLike,
      format: (v) => (v == null ? null : v),
    },
    percent: {
      parse: parseNumberLike,
      format: (v) => (v == null ? null : v),
    },
    checkbox: {
      parse: parseBoolean,
      format: (v) => (v == null ? null : v),
    },
    date: {
      parse: parseDate,
      format: (v) => (v == null ? null : v.toISOString()),
    },
    datetime: {
      parse: parseDate,
      format: (v) => (v == null ? null : v.toISOString()),
    },
    url: {
      parse: (v) => (v == null ? null : String(v)),
      format: (v) => (v == null ? null : String(v)),
    },
    email: {
      parse: (v) => (v == null ? null : String(v)),
      format: (v) => (v == null ? null : String(v)),
    },
    phone: {
      parse: (v) => (v == null ? null : String(v)),
      format: (v) => (v == null ? null : String(v)),
    },
    location: {
      parse: (v: unknown) => {
        if (!v || typeof v !== 'object') return null;
        const obj = v as Record<string, unknown>;
        const out: { latitude?: number; longitude?: number; human_address?: string } = {};
        const lat = parseNumberLike(obj.latitude);
        const lon = parseNumberLike(obj.longitude);
        if (lat != null) out.latitude = lat;
        if (lon != null) out.longitude = lon;
        const ha = obj.human_address;
        if (typeof ha === 'string') out.human_address = ha;
        return Object.keys(out).length ? out : null;
      },
      format: (v) => (v == null ? null : v),
    },
    point: {
      parse: (v: unknown) => {
        if (!v || typeof v !== 'object') return null;
        const obj = v as { type?: unknown; coordinates?: unknown };
        if (obj.type === 'Point' && Array.isArray(obj.coordinates) && obj.coordinates.length === 2) {
          const [x, y] = obj.coordinates as unknown[];
          if (Number.isFinite(x as number) && Number.isFinite(y as number)) {
            return { type: 'Point', coordinates: [x as number, y as number] as [number, number] };
          }
        }
        return null;
      },
      format: (v) => (v == null ? null : v),
    },
    polygon: {
      parse: (v: unknown) => {
        if (!v || typeof v !== 'object') return null;
        const obj = v as { type?: unknown; coordinates?: unknown };
        if (obj.type === 'Polygon' && Array.isArray(obj.coordinates)) {
          return { type: 'Polygon', coordinates: obj.coordinates as number[][][] };
        }
        return null;
      },
      format: (v) => (v == null ? null : v),
    },
    json: jsonPass,
    unknown: jsonPass,
  };
}

const CODECS: Codecs = initCodecs();

export function getCodecs(): Codecs { return CODECS; }

export function codecFor(
  type: 'text'|'number'|'checkbox'|'date'|'datetime'|'money'|'percent'|'url'|'email'|'phone'|'location'|'point'|'polygon'|'json'|'unknown'
): Codec {
  switch (type) {
    case 'text': return CODECS.text as unknown as Codec;
    case 'number': return CODECS.number as unknown as Codec;
    case 'checkbox': return CODECS.checkbox as unknown as Codec;
    case 'date': return CODECS.date as unknown as Codec;
    case 'datetime': return CODECS.datetime as unknown as Codec;
    case 'money': return CODECS.money as unknown as Codec;
    case 'percent': return CODECS.percent as unknown as Codec;
    case 'url': return CODECS.url as unknown as Codec;
    case 'email': return CODECS.email as unknown as Codec;
    case 'phone': return CODECS.phone as unknown as Codec;
    case 'location': return CODECS.location as unknown as Codec;
    case 'point': return CODECS.point as unknown as Codec;
    case 'polygon': return CODECS.polygon as unknown as Codec;
    case 'json': return CODECS.json as unknown as Codec;
    default: return CODECS.unknown as unknown as Codec;
  }
}
