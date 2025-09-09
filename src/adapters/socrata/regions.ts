export type SocrataRegion = 'US' | 'EU';

export const REGION_US: SocrataRegion = 'US';
export const REGION_EU: SocrataRegion = 'EU';

export const DISCOVERY_BASE: Record<SocrataRegion, string> = {
  US: 'https://api.us.socrata.com',
  EU: 'https://api.eu.socrata.com',
};

const cache = new Map<string, SocrataRegion>();

function parseRegion(val?: string): SocrataRegion | undefined {
  if (!val) return undefined;
  const norm = val.trim().toUpperCase();
  return norm === 'US' || norm === 'EU' ? (norm as SocrataRegion) : undefined;
}

export function resolveSocrataRegion(host: string): SocrataRegion {
  const h = (host || '').toLowerCase();
  const cached = cache.get(h);
  if (cached) return cached;

  // Host override
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
  // Global fallback
  const globalRegion = parseRegion(envObj?.SOCRATA_REGION);
  const resolved = globalRegion ?? REGION_US;
  cache.set(h, resolved);
  return resolved;
}

export function socrataDiscoveryBase(region: SocrataRegion): string {
  return region === REGION_US ? DISCOVERY_BASE.US : DISCOVERY_BASE.EU;
}

export function otherRegion(region: SocrataRegion): SocrataRegion {
  return region === REGION_US ? REGION_EU : REGION_US;
}

export function shouldFailover(status?: number, isNetworkError?: boolean): boolean {
  if (isNetworkError) return true;
  if (status === undefined) return false;
  if (status >= 500) return true;
  return false;
}

export function clearSocrataRegionCache(): void {
  cache.clear();
}
