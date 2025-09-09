import { otherRegion, resolveSocrataRegion, shouldFailover, socrataDiscoveryBase } from './regions.js';

export async function discoveryFetch(host: string, path: string, init: RequestInit = {}): Promise<Response> {
  const region = resolveSocrataRegion(host);
  const base = socrataDiscoveryBase(region);
  const urlPrimary = new URL(path, base);
  try {
    const res = await fetch(urlPrimary.toString(), init);
    if (!shouldFailover(res.status, false)) return res;
    // Attempt single failover
    const urlSecondary = new URL(path, socrataDiscoveryBase(otherRegion(region)));
    return await fetch(urlSecondary.toString(), init);
  } catch {
    // Network error: try failover
    const urlSecondary = new URL(path, socrataDiscoveryBase(otherRegion(region)));
    return await fetch(urlSecondary.toString(), init);
  }
}
