export interface SoqlBuildInput {
  fields: readonly string[];
  select?: readonly string[];
  where?: SoqlPredicate[];
  order?: readonly SoqlOrder[];
  groupBy?: readonly string[];
  limit?: number;
  offset?: number;
  extra?: Record<string, string | number | boolean>;
}

export type SoqlComparator =
  | '=' | '!=' | '>' | '>=' | '<' | '<='
  | 'IN' | 'NOT IN'
  | 'LIKE' | 'ILIKE'
  | 'IS NULL' | 'IS NOT NULL'
  | 'BETWEEN';

export interface SoqlPredicate {
  field: string;
  op: SoqlComparator;
  value?: unknown;
}

export interface SoqlOrder { field: string; dir?: 'ASC' | 'DESC' }

export interface SoqlBuildResult {
  params: Record<string, string>;
  select?: string[];
  groupBy?: string[];
  order?: { field: string; dir: 'ASC' | 'DESC' }[];
}

export function isAllowedField(name: string, fields: readonly string[]): boolean {
  return fields.includes(name);
}

export function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'`;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite number not allowed in SoQL');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (Array.isArray(v)) {
    if (v.length === 0) throw new Error('Empty array not allowed in SoQL lists');
    return `(${v.map(serializeValue).join(',')})`;
  }
  throw new Error('Unsupported value type for SoQL (objects are not allowed)');
}

export function buildSoql(input: SoqlBuildInput): SoqlBuildResult {
  const { fields } = input;
  if (!fields || fields.length === 0) throw new Error('fields allow-list cannot be empty');

  const paramsEntries: [string, string][] = [];
  const echoes: Pick<SoqlBuildResult, 'select' | 'groupBy' | 'order'> = {};

  // select
  const sel = buildSelectEcho(fields, input.select);
  if (sel.entry) paramsEntries.push(sel.entry);
  if (sel.echo) echoes.select = sel.echo;

  // where
  const where = buildWhereEntry(fields, input.where);
  if (where) paramsEntries.push(where);

  // order
  const ord = buildOrderEcho(fields, input.order);
  if (ord.entry) paramsEntries.push(ord.entry);
  if (ord.echo) echoes.order = ord.echo;

  // group by
  const grp = buildGroupEcho(fields, input.groupBy);
  if (grp.entry) paramsEntries.push(grp.entry);
  if (grp.echo) echoes.groupBy = grp.echo;

  // limit / offset
  for (const e of buildLimitOffsetEntries(input.limit, input.offset)) paramsEntries.push(e);

  // extra ($-prefixed only)
  for (const e of buildExtraEntries(input.extra)) paramsEntries.push(e);

  return { params: Object.fromEntries(paramsEntries), ...echoes };
}

function buildSelectEcho(fields: readonly string[], select?: readonly string[]): { entry?: [string, string]; echo?: string[] } {
  if (!select) return {};
  const sel = [...select];
  sel.forEach((f) => {
    if (!isAllowedField(f, fields)) throw new Error(`Unknown field in select: ${f}`);
  });
  return sel.length > 0 ? { entry: ['$select', sel.join(',')], echo: sel } : {};
}

function buildWhereEntry(fields: readonly string[], where?: SoqlPredicate[]): [string, string] | undefined {
  if (!where || where.length === 0) return undefined;
  const clauses = where.map((p) => buildPredicate(p, fields));
  if (clauses.length === 0) return undefined;
  return ['$where', clauses.join(' AND ')];
}

function buildOrderEcho(fields: readonly string[], order?: readonly SoqlOrder[]): { entry?: [string, string]; echo?: { field: string; dir: 'ASC' | 'DESC' }[] } {
  if (!order || order.length === 0) return {};
  const parts: string[] = [];
  const echo: { field: string; dir: 'ASC' | 'DESC' }[] = [];
  for (const o of order) {
    if (!isAllowedField(o.field, fields)) throw new Error(`Unknown field in order: ${o.field}`);
    const dir = (o.dir ?? 'ASC').toUpperCase() as 'ASC' | 'DESC';
    parts.push(`${o.field} ${dir}`);
    echo.push({ field: o.field, dir });
  }
  return parts.length > 0 ? { entry: ['$order', parts.join(', ')], echo } : {};
}

function buildGroupEcho(fields: readonly string[], groupBy?: readonly string[]): { entry?: [string, string]; echo?: string[] } {
  if (!groupBy || groupBy.length === 0) return {};
  groupBy.forEach((f) => {
    if (!isAllowedField(f, fields)) throw new Error(`Unknown field in groupBy: ${f}`);
  });
  return { entry: ['$group', groupBy.join(',')], echo: [...groupBy] };
}

function buildLimitOffsetEntries(limit?: number, offset?: number): [string, string][] {
  const entries: [string, string][] = [];
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error('limit must be a positive integer');
    entries.push(['$limit', String(limit)]);
  }
  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0) throw new Error('offset must be an integer >= 0');
    entries.push(['$offset', String(offset)]);
  }
  return entries;
}

function buildExtraEntries(extra?: Record<string, string | number | boolean>): [string, string][] {
  const entries: [string, string][] = [];
  if (!extra) return entries;
  for (const [k, v] of Object.entries(extra)) {
    if (!k.startsWith('$')) continue;
    if (v === undefined) continue;
    entries.push([k, String(v)]);
  }
  return entries;
}

function buildPredicate(p: SoqlPredicate, fields: readonly string[]): string {
  if (!isAllowedField(p.field, fields)) throw new Error(`Unknown field in where: ${p.field}`);
  const op = p.op.toUpperCase() as SoqlComparator;
  switch (op) {
    case 'IS NULL':
    case 'IS NOT NULL':
      return `${p.field} ${op}`;
    case 'IN':
    case 'NOT IN': {
      if (!Array.isArray(p.value) || p.value.length === 0) throw new Error(`${op} expects a non-empty array value`);
      return `${p.field} ${op} ${serializeValue(p.value)}`;
    }
    case 'BETWEEN': {
      if (!Array.isArray(p.value) || p.value.length !== 2) throw new Error('BETWEEN expects a 2-length array [low, high]');
      const [low, high] = p.value as [unknown, unknown];
      return `${p.field} BETWEEN ${serializeValue(low)} AND ${serializeValue(high)}`;
    }
    case 'LIKE':
    case 'ILIKE': {
      if (typeof p.value !== 'string') throw new Error(`${op} expects a string value`);
      return `${p.field} ${op} ${serializeValue(p.value)}`;
    }
    default: {
      // scalar ops
      if (p.value === undefined) throw new Error(`${op} requires a scalar value`);
      if (Array.isArray(p.value)) throw new Error(`${op} requires a scalar value`);
      return `${p.field} ${op} ${serializeValue(p.value)}`;
    }
  }
}
