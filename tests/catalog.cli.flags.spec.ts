import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock process.argv to avoid interference
const originalArgv = process.argv;

// Mock dependencies
vi.mock('../src/lib/secrets/secrets.js', () => ({
  getSocrataAppToken: vi.fn(() => 'test-token'),
  getDatabaseUrl: vi.fn(() => 'postgresql://test'),
}));

vi.mock('../src/adapters/socrata/catalogDiscovery.js', () => ({
  iterateDomainsAndAgencies: vi.fn(async function* () {
    yield { region: 'US', host: 'data.test.gov', domain: 'test.gov', agency: 'Test Agency' };
  }),
}));

vi.mock('../src/db/catalog/repo.js', () => ({
  upsertDatasets: vi.fn().mockResolvedValue({ upserted: 0, updated: 0 }),
  retireStaleDatasets: vi.fn().mockResolvedValue(0),
}));

describe('Catalog CLI Flags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should parse --datasets flag correctly', async () => {
    process.argv = ['node', 'script.js', '--datasets=true', '--dry-run'];
    
    const { parseArgs } = await import('../src/cli/catalog/discoverSocrata.js');
    const args = parseArgs();
    
    expect(args.datasets).toBe(true);
    expect(args.dryRun).toBe(true);
  });

  it('should default datasets to true', async () => {
    process.argv = ['node', 'script.js', '--dry-run'];
    
    const { parseArgs } = await import('../src/cli/catalog/discoverSocrata.js');
    const args = parseArgs();
    
    expect(args.datasets).toBe(true);
  });

  it('should respect --datasets=false', async () => {
    process.argv = ['node', 'script.js', '--datasets=false', '--dry-run'];
    
    const { parseArgs } = await import('../src/cli/catalog/discoverSocrata.js');
    const args = parseArgs();
    
    expect(args.datasets).toBe(false);
  });

  it('should parse space-separated --datasets flag', async () => {
    process.argv = ['node', 'script.js', '--datasets', 'true', '--dry-run'];
    
    const { parseArgs } = await import('../src/cli/catalog/discoverSocrata.js');
    const args = parseArgs();
    
    expect(args.datasets).toBe(true);
  });

  it('should respect other existing flags with datasets', async () => {
    process.argv = ['node', 'script.js', '--regions=US', '--limit=1000', '--datasets=true', '--dry-run'];
    
    const { parseArgs } = await import('../src/cli/catalog/discoverSocrata.js');
    const args = parseArgs();
    
    expect(args.regions).toEqual(['US']);
    expect(args.limit).toBe(1000);
    expect(args.datasets).toBe(true);
    expect(args.dryRun).toBe(true);
  });

  it('should validate datasets as boolean in schema', async () => {
    process.argv = ['node', 'script.js', '--datasets=invalid', '--dry-run'];
    
    const { parseArgs } = await import('../src/cli/catalog/discoverSocrata.js');
    
    expect(() => parseArgs()).not.toThrow();
    const args = parseArgs();
    expect(typeof args.datasets).toBe('boolean');
  });
});