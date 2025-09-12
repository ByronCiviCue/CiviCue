import { getEnv } from '../env.js';

// Runtime guard to prevent client-side import
if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
  throw new Error('Secrets module cannot be imported in browser/client code. Use server-only.');
}

/**
 * Server-only secrets facade.
 * Centralizes access to sensitive environment variables.
 * Never import this module from client-side code.
 */
class SecretsManager {
  private env = getEnv();

  // Database secrets
  getDatabaseUrl(): string | undefined {
    return this.env.db.url;
  }

  getVectorDimension(): number {
    return this.env.db.vectorDim;
  }

  // AI/ML service secrets
  getOpenAIKey(): string | undefined {
    return this.env.ai.openaiKey;
  }

  getAnthropicKey(): string | undefined {
    return this.env.ai.anthropicKey;
  }

  getGoogleKey(): string | undefined {
    return this.env.ai.googleKey;
  }

  getEmbeddingModel(): string | undefined {
    return this.env.ai.embeddingModel;
  }

  // Data platform secrets
  getSocrataAppId(): string | undefined {
    return this.env.socrata.appId;
  }

  getSocrataAppSecret(): string | undefined {
    return this.env.socrata.appSecret;
  }

  // Placeholder stubs for future data platform integrations
  getCkanApiKey(): string | undefined {
    return this.env.ckan.apiKey;
  }

  getCkanBaseUrl(): string | undefined {
    return this.env.ckan.baseUrl;
  }

  getArcGISApiKey(): string | undefined {
    return this.env.arcgis.apiKey;
  }

  getArcGISPortalUrl(): string | undefined {
    return this.env.arcgis.portalUrl;
  }

  // Runtime configuration (non-sensitive but centralized)
  getLogLevel(): string {
    return this.env.runtime.logLevel ?? 'info';
  }

  getPort(): number {
    return this.env.runtime.port;
  }

  getNodeEnv(): string {
    return this.env.runtime.nodeEnv ?? 'development';
  }

  getRequestTimeout(): number {
    return this.env.runtime.requestTimeoutMs;
  }

  getRetryMaxAttempts(): number {
    return this.env.runtime.retryMaxAttempts;
  }

  getRetryBaseDelay(): number {
    return this.env.runtime.retryBaseDelayMs;
  }
}

// Singleton instance
export const secrets = new SecretsManager();

// ESM module
// Centralized, lint-approved access to process.env
/* eslint-disable civicue/no-process-env-outside-env */

export function isCI(): boolean {
  return process.env.CI === 'true' || process.env.CI === '1';
}

/** Returns best-available Socrata App Token across our normalized keys. */
export function getSocrataAppToken(): string | undefined {
  return (
    process.env['SOCRATA__api.us.socrata.com__APP_TOKEN'] ||
    process.env.SOCRATA_APP_TOKEN ||
    process.env.SOCRATA_APP_ID ||
    undefined
  );
}

/** Return DATABASE_URL or throw with a clear message. */
export function getDatabaseUrl(): string {
  const v =
    process.env.DATABASE_URL ||
    process.env.DB_URL ||
    '';
  if (!v) throw new Error('DATABASE_URL is required but not set');
  return v;
}
/* eslint-enable civicue/no-process-env-outside-env */
