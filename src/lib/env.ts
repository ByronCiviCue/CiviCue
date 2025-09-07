import { z } from 'zod';

// Nested env schema; adapt types if you already have EnvSchema elsewhere.
const envSchema = z.object({
  socrata: z.object({
    // Socrata calls it "App Token". We accept historic names as input, normalize to appId
    appId: z.string().min(1).optional(),
    appSecret: z.string().optional()
  }),
  ckan: z.object({
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional()
  }),
  arcgis: z.object({
    portalUrl: z.string().url().optional(),
    apiKey: z.string().optional()
  }),
  db: z.object({
    url: z.string().min(1).optional(),
    vectorDim: z.coerce.number().int().positive().default(1536)
  }),
  ai: z.object({
    openaiKey: z.string().optional(),
    anthropicKey: z.string().optional(),
    googleKey: z.string().optional(),
    embeddingModel: z.string().optional()
  }),
  runtime: z.object({
    nodeEnv: z.enum(['development', 'test', 'production']).default('development').optional(),
    port: z.coerce.number().int().positive().default(3000),
    requestTimeoutMs: z.coerce.number().int().positive().default(10000),
    retryMaxAttempts: z.coerce.number().int().positive().default(3),
    retryBaseDelayMs: z.coerce.number().int().positive().default(250),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info').optional()
  })
});

export type Env = z.infer<typeof envSchema>;

function buildRaw() {
  return {
    socrata: {
      appId:
        process.env.SOCRATA_APP_TOKEN || // global (preferred name for the token)
        process.env.SOCRATA_APP_ID ||    // historic misnomer "ID"
        process.env.SOC_DATA_APP_ID ||   // legacy
        process.env.SFDATA_APP_ID,       // legacy
      appSecret: process.env.SOCRATA_APP_SECRET
    },
    ckan: {
      baseUrl: process.env.CKAN_BASE_URL,
      apiKey: process.env.CKAN_API_KEY
    },
    arcgis: {
      portalUrl: process.env.ARCGIS_PORTAL_URL,
      apiKey: process.env.ARCGIS_API_KEY
    },
    db: {
      url: process.env.DATABASE_URL || process.env.DB_URL,
      vectorDim: process.env.PGVECTOR_DIM
    },
    ai: {
      openaiKey: process.env.OPENAI_API_KEY,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      googleKey: process.env.GOOGLE_API_KEY,
      embeddingModel: process.env.EMBEDDING_MODEL || process.env.AI_EMBEDDING_MODEL
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
      retryMaxAttempts: process.env.RETRY_MAX_ATTEMPTS,
      retryBaseDelayMs: process.env.RETRY_BASE_DELAY_MS,
      logLevel: process.env.LOG_LEVEL
    }
  };
}

function shouldSkipValidation(): boolean {
  return (
    process.env.CIVICUE_SKIP_ENV_VALIDATION === '1' ||
    process.argv.includes('--help') ||
    process.env.NODE_ENV === 'test'
  );
}

let _env: Env | undefined;

type Issue = { path: Array<string | number>; message: string };
function hasIssues(e: unknown): e is { issues: Issue[] } {
  if (typeof e !== 'object' || e === null) return false;
  const maybe = e as { issues?: unknown };
  return Array.isArray(maybe.issues);
}

function validateEnv(): Env {
  const raw = buildRaw();
  if (shouldSkipValidation()) {
    // Best-effort coercion; defaults applied by schema .parse, but on skip we return raw with sane defaults injected
    const coerced = envSchema.partial().parse(raw); // coerce defaults for numeric fields
    const nodeEnv = coerced.runtime?.nodeEnv ?? 'development';
    const runtime = {
      ...coerced.runtime,
      nodeEnv,
      port: coerced.runtime?.port ?? 3000,
      requestTimeoutMs: coerced.runtime?.requestTimeoutMs ?? 10000,
      retryMaxAttempts: coerced.runtime?.retryMaxAttempts ?? 3,
      retryBaseDelayMs: coerced.runtime?.retryBaseDelayMs ?? 250
    };
    return { ...coerced, db: { ...coerced.db, vectorDim: coerced.db?.vectorDim ?? 1536 }, runtime } as Env;
  }
  try {
    return envSchema.parse(raw);
  } catch (err: unknown) {
    if (hasIssues(err)) {
      const msg = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new Error('Environment validation failed: ' + msg);
    }
    throw err;
  }
}

export function getEnv(): Env {
  if (_env) return _env;
  _env = validateEnv();
  return _env;
}

// Compatibility getters (lazy) for legacy flat access during migration
/** @deprecated use getEnv().db.url */
export function get_DATABASE_URL(): string | undefined { return getEnv().db.url; }
/** @deprecated use getEnv().ai.embeddingModel */
export function get_AI_EMBEDDING_MODEL(): string | undefined { return getEnv().ai.embeddingModel; }
/** @deprecated use getEnv().socrata.appId */
export function get_SOC_DATA_APP_ID(): string | undefined { return getEnv().socrata.appId; }

// Keep requireKey for ad-hoc pulls without validating full schema
export function requireKey(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Required environment variable ${name} is not set`);
  return v;
}

// Host-based Socrata token resolver (env-aware, keeps process.env access centralized here)
export function resolveSocrataAppToken(host: string): string | undefined {
  const exact = process.env[`SOCRATA__${host}__APP_TOKEN`];
  if (exact) return exact;
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join('.');
    const v = process.env[`SOCRATA__${suffix}__APP_TOKEN`];
    if (v) return v;
  }
  return process.env.SOCRATA_APP_TOKEN;
}
