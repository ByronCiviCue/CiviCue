/**
 * Resolve Socrata App Token by host with fallback to global.
 * - Exact host override: SOCRATA__{HOST}__APP_TOKEN
 * - Global fallback: SOCRATA_APP_TOKEN
 */
import { resolveSocrataAppToken as _resolve, resolveSocrataV3Key as _resolveV3 } from '../env.js';

export function resolveSocrataAppToken(host: string): string | undefined {
  return _resolve(host);
}

export function socrataHeadersFor(host: string): Record<string, string> {
  const token = _resolve(host);
  return token ? { 'X-App-Token': token } : {};
}

export function resolveSocrataV3Key(host: string, fourByFour?: string): { keyId: string; keySecret: string } | undefined {
  return _resolveV3(host, fourByFour);
}

export function socrataV3AuthHeader(host: string, fourByFour?: string): Record<string, string> {
  const creds = _resolveV3(host, fourByFour);
  if (!creds) return {};
  const basic = Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString('base64');
  return { Authorization: `Basic ${basic}` };
}
