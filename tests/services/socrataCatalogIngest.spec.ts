import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runSocrataCatalogIngest } from '../../services/discovery/socrataCatalogIngest.js';
import type { SocrataCatalogIngestOptions } from '../../src/types/ingest.js';

/**
 * Test suite for Socrata catalog ingestion service.
 * 
 * Verifies behavior for:
 * - Multi-page pagination through Discovery API results
 * - Resume functionality with cursor-based state tracking
 * - Error handling for invalid cursors and network failures
 * - Dry-run mode with no side effects
 * - Processing limits and early termination
 * - Multi-region processing workflows
 * 
 * Tests guarantee consistent cursor format and stable logging structure.
 */

// Mock the catalog discovery module
vi.mock('../../src/adapters/socrata/catalogDiscovery.js', () => ({
  iterateDomainsAndAgencies: vi.fn()
}));

// Mock the secrets module  
vi.mock('../../src/lib/secrets/secrets.js', () => ({
  getSocrataAppToken: vi.fn(() => 'test-token')
}));

const { iterateDomainsAndAgencies } = await import('../../src/adapters/socrata/catalogDiscovery.js');
const mockIterateDomainsAndAgencies = vi.mocked(iterateDomainsAndAgencies);

describe('Socrata Catalog Ingest - Pagination', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  const baseOptions: SocrataCatalogIngestOptions = {
    regions: ['US'],
    pageSize: 2,
    limit: 5,
    dryRun: false,
    logger: mockLogger,
    now: () => new Date('2024-01-01T00:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should paginate through multiple pages of results', async () => {
    // Mock iterator that yields 3 items
    const mockItems = [
      { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' },
      { region: 'US' as const, host: 'data.city2.gov', domain: 'city2.gov', agency: 'Department B' },
      { region: 'US' as const, host: 'data.city3.gov', domain: 'city3.gov', agency: null },
    ];

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (const item of mockItems) {
        yield item;
      }
    });

    const result = await runSocrataCatalogIngest(baseOptions);

    expect(result).toMatchObject({
      totalProcessed: 3,
      completedRegions: ['US'],
      dryRun: false,
    });
    expect(result.lastCursor).toContain('"processed":3');
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US'],
      pageSize: 2,
      limit: 5,
      appToken: 'test-token',
    });
  });

  it('should respect the processing limit', async () => {
    // Mock iterator that yields more items than the limit
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      for (let i = 0; i < 10; i++) {
        yield { 
          region: 'US' as const, 
          host: `data.city${i}.gov`, 
          domain: `city${i}.gov`, 
          agency: `Agency ${i}` 
        };
      }
    });

    const limitedOptions = { ...baseOptions, limit: 3 };
    const result = await runSocrataCatalogIngest(limitedOptions);

    expect(result.totalProcessed).toBe(3);
    expect(mockLogger.info).toHaveBeenCalledWith('Limit reached', { limit: 3 });
  });

  it('should resume from a valid cursor', async () => {
    const resumeState = {
      region: 'US',
      cursor: 'some-cursor-token',
      processed: 2,
    };

    const resumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeFrom: JSON.stringify(resumeState),
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city4.gov', domain: 'city4.gov', agency: 'Department D' };
      yield { region: 'US' as const, host: 'data.city5.gov', domain: 'city5.gov', agency: 'Department E' };
    });

    const result = await runSocrataCatalogIngest(resumeOptions);

    expect(result.totalProcessed).toBe(4); // 2 from resume + 2 new items
    expect(mockLogger.info).toHaveBeenCalledWith('Resume operation', {
      region: 'US',
      processed: 2,
    });
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US'],
      pageSize: 2,
      limit: 3, // Original limit (5) - already processed (2)
      appToken: 'test-token',
    });
  });

  it('should handle invalid resume cursor', async () => {
    const invalidResumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeFrom: 'invalid-json',
    };

    await expect(runSocrataCatalogIngest(invalidResumeOptions)).rejects.toThrow(
      'Invalid resumeFrom format. Expected JSON with region, cursor, and processed fields.'
    );
  });

  it('should handle malformed resume cursor with missing fields', async () => {
    const incompleteResumeState = {
      region: 'US',
      // Missing cursor and processed fields
    };

    const invalidResumeOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      resumeFrom: JSON.stringify(incompleteResumeState),
    };

    await expect(runSocrataCatalogIngest(invalidResumeOptions)).rejects.toThrow(
      'Invalid resumeFrom format. Expected JSON with region, cursor, and processed fields.'
    );
  });

  it('should handle iterator errors gracefully', async () => {
    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'Department A' };
      throw new Error('Network timeout');
    });

    await expect(runSocrataCatalogIngest(baseOptions)).rejects.toThrow(
      'Failed to iterate through catalog data'
    );
    expect(mockLogger.error).toHaveBeenCalledWith('Pagination error', { error: expect.any(Error) });
  });

  it('should skip pagination in dry-run mode', async () => {
    const dryRunOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      dryRun: true,
    };

    const result = await runSocrataCatalogIngest(dryRunOptions);

    expect(result.totalProcessed).toBe(0);
    expect(result.lastCursor).toBeNull();
    expect(result.completedRegions).toEqual([]);
    expect(mockIterateDomainsAndAgencies).not.toHaveBeenCalled();
  });

  it('should handle multi-region processing', async () => {
    const multiRegionOptions: SocrataCatalogIngestOptions = {
      ...baseOptions,
      regions: ['US', 'EU'],
    };

    mockIterateDomainsAndAgencies.mockImplementation(async function* () {
      yield { region: 'US' as const, host: 'data.city1.gov', domain: 'city1.gov', agency: 'US Agency' };
      yield { region: 'EU' as const, host: 'data.city2.eu', domain: 'city2.eu', agency: 'EU Agency' };
    });

    const result = await runSocrataCatalogIngest(multiRegionOptions);

    expect(result.totalProcessed).toBe(2);
    expect(result.completedRegions).toEqual(['US', 'EU']);
    expect(mockIterateDomainsAndAgencies).toHaveBeenCalledWith({
      regions: ['US', 'EU'],
      pageSize: 2,
      limit: 5,
      appToken: 'test-token',
    });
  });
});