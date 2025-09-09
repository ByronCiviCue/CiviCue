/**
 * Defines the supported Socrata regions.
 */
export type SocrataRegion = 'US' | 'EU';

/**
 * Constant for the US region.
 */
export const REGION_US: SocrataRegion = 'US';

/**
 * Constant for the EU region.
 */
export const REGION_EU: SocrataRegion = 'EU';

/**
 * Provides the base URLs for the Socrata Discovery API in each supported region.
 */
export const DISCOVERY_BASE: Record<SocrataRegion, string> = {
  US: 'https://api.us.socrata.com',
  EU: 'https://api.eu.socrata.com',
};

const cache = new Map<string, SocrataRegion>();

/**
 * Parses a string value into a SocrataRegion, returning undefined if the value is invalid.
 * @param val The string to parse.
 * @returns The parsed SocrataRegion or undefined.
 * @internal
 */
function parseRegion(val?: string): SocrataRegion | undefined {
  if (!val) return undefined;
  const norm = val.trim().toUpperCase();
  return norm === 'US' || norm === 'EU' ? (norm as SocrataRegion) : undefined;
}

/**
 * Resolves the Socrata region for a given host based on environment variables.
 * The resolution is cached in memory.
 * Precedence:
 * 1. `SOCRATA__{HOST}__REGION` (host-specific override)
 * 2. `SOCRATA_REGION` (global default)
 * 3. `REGION_US` (fallback default)
 * @param host The hostname to resolve the region for (e.g., 'data.sfgov.org').
 * @returns The resolved SocrataRegion for the host.
 */
export function resolveSocrataRegion(host: string): SocrataRegion {
  const h = (host || '').toLowerCase();
  const cached = cache.get(h);
  if (cached) return cached;

  const g: unknown = (globalThis as unknown);
  const gp = (g && typeof g === 'object' && 'process' in (g as Record<string, unknown>))
    ? (g as Record<string, unknown>).process as unknown
    : undefined;
  const envObj = (gp && typeof gp === 'object' && 'env' in (gp as Record<string, unknown>))
    ? ((gp as Record<string, unknown>).env as Record<string, string | undefined>)
    : undefined;
  const hostVar = envObj ? envObj[`SOCRATA__${h}__REGION`] : undefined;
  const hostRegion = parseRegion(hostVar);
  if (hostRegion) {
    cache.set(h, hostRegion);
    return hostRegion;
  }

  const globalRegion = parseRegion(envObj?.SOCRATA_REGION);
  const resolved = globalRegion ?? REGION_US;
  cache.set(h, resolved);
  return resolved;
}

/**
 * Gets the base URL for the Socrata Discovery API for a given region.
 * @param region The Socrata region.
 * @returns The base URL for the Discovery API.
 */
export function socrataDiscoveryBase(region: SocrataRegion): string {
  return region === REGION_US ? DISCOVERY_BASE.US : DISCOVERY_BASE.EU;
}

/**
 * Returns the other Socrata region.
 * @param region The current Socrata region.
 * @returns The alternate Socrata region (US -> EU, EU -> US).
 */
export function otherRegion(region: SocrataRegion): SocrataRegion {
  return region === REGION_US ? REGION_EU : REGION_US;
}

/**
 * Determines whether a request should failover to the other region.
 * Failover is triggered for network errors or 5xx server errors.
 * @param status The HTTP status code of the response.
 * @param isNetworkError Whether a network error occurred.
 * @returns True if a failover should be attempted, false otherwise.
 */
export function shouldFailover(status?: number, isNetworkError?: boolean): boolean {
  if (isNetworkError) return true;
  if (status === undefined) return false;
  if (status >= 500) return true;
  return false;
}

/**
 * Clears the in-memory cache for Socrata region resolution.
 * Intended for use in tests.
 */
export function clearSocrataRegionCache(): void {
  cache.clear();
}