import { z } from 'zod';

const socrataSchema = z.object({
  appId: z.string().min(1, 'SOCRATA_APP_ID is required'),
  appSecret: z.string().optional(),
});

const ckanSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
});

const arcgisSchema = z.object({
  portalUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
});

const dbSchema = z.object({
  url: z.string().min(1, 'DATABASE_URL is required'),
  vectorDim: z.coerce.number().int().positive().default(1536),
});

const aiSchema = z.object({
  openaiKey: z.string().optional(),
  anthropicKey: z.string().optional(),
  googleKey: z.string().optional(),
  embeddingModel: z.string().min(1, 'EMBEDDING_MODEL is required'),
});

const runtimeSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  requestTimeoutMs: z.coerce.number().int().positive().default(10000),
  retryMaxAttempts: z.coerce.number().int().nonnegative().default(3),
  retryBaseDelayMs: z.coerce.number().int().positive().default(250),
});

const envSchema = z.object({
  socrata: socrataSchema,
  ckan: ckanSchema,
  arcgis: arcgisSchema,
  db: dbSchema,
  ai: aiSchema,
  runtime: runtimeSchema,
});

function validateEnv() {
  const rawEnv = {
    socrata: {
      appId: process.env.SOCRATA_APP_ID,
      appSecret: process.env.SOCRATA_APP_SECRET,
    },
    ckan: {
      baseUrl: process.env.CKAN_BASE_URL,
      apiKey: process.env.CKAN_API_KEY,
    },
    arcgis: {
      portalUrl: process.env.ARCGIS_PORTAL_URL,
      apiKey: process.env.ARCGIS_API_KEY,
    },
    db: {
      url: process.env.DATABASE_URL,
      vectorDim: process.env.PGVECTOR_DIM,
    },
    ai: {
      openaiKey: process.env.OPENAI_API_KEY,
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      googleKey: process.env.GOOGLE_API_KEY,
      embeddingModel: process.env.EMBEDDING_MODEL,
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      requestTimeoutMs: process.env.REQUEST_TIMEOUT_MS,
      retryMaxAttempts: process.env.RETRY_MAX_ATTEMPTS,
      retryBaseDelayMs: process.env.RETRY_BASE_DELAY_MS,
    },
  };

  try {
    return envSchema.parse(rawEnv);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingOrInvalid = error.issues.map((err: z.ZodIssue) => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      }).join(', ');
      throw new Error(`Environment validation failed: ${missingOrInvalid}`);
    }
    throw error;
  }
}

export const env = validateEnv();

export function requireKey(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}