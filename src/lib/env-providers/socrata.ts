/**
 * Resolve Socrata App Token by host with fallback to global.
 * - Exact host override: SOCRATA__{HOST}__APP_TOKEN
 * - Global fallback: SOCRATA_APP_TOKEN
 */
import { resolveSocrataAppToken as _resolve } from '../env.js';

export function resolveSocrataAppToken(host: string): string | undefined {
  return _resolve(host);
}

export function socrataHeadersFor(host: string): Record<string, string> {
  const token = _resolve(host);
  return token ? { 'X-App-Token': token } : {};
}
