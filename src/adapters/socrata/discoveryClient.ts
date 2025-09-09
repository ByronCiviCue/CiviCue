import { otherRegion, resolveSocrataRegion, shouldFailover, socrataDiscoveryBase } from './regions.js';

/**
 * Fetches a resource from the Socrata Discovery API, automatically handling region resolution and failover.
 * It resolves the region for the given host, then attempts to fetch the resource.
 * If the request fails with a network error or a 5xx status code, it retries once against the alternate region.
 * @param host The hostname of the Socrata portal (e.g., 'data.sfgov.org').
 * @param path The API path to request (e.g., '/api/catalog/v1').
 * @param init Optional `RequestInit` object for the fetch call.
 * @returns A `Promise` that resolves to the `Response` from the fetch call.
 */
export async function discoveryFetch(host: string, path: string, init: RequestInit = {}): Promise<Response> {
  const region = resolveSocrataRegion(host);
  const base = socrataDiscoveryBase(region);
  const urlPrimary = new URL(path, base);
  try {
    const res = await fetch(urlPrimary.toString(), init);
    if (!shouldFailover(res.status, false)) return res;

    const urlSecondary = new URL(path, socrataDiscoveryBase(otherRegion(region)));
    return await fetch(urlSecondary.toString(), init);
  } catch {
    const urlSecondary = new URL(path, socrataDiscoveryBase(otherRegion(region)));
    return await fetch(urlSecondary.toString(), init);
  }
}