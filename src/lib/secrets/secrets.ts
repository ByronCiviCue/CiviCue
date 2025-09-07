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