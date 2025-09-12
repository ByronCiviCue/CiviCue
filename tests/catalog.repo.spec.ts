import { describe, it, expect, beforeEach, vi } from 'vitest';
import { upsertDatasets, retireStaleDatasets, type UpsertDatasetInput } from '../src/db/catalog/repo.js';

// Mock the dependencies
vi.mock('../src/db/kysely.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

vi.mock('../src/lib/secrets/secrets.js', () => ({
  isDatabaseDryRun: vi.fn(() => false),
}));

vi.mock('../src/observability/metrics.js', () => ({
  getMetrics: vi.fn(() => ({
    timing: vi.fn(),
    increment: vi.fn(),
  })),
}));

// Create proper mock chain for Kysely's fluent interface
const mockConflictBuilder = {
  columns: vi.fn().mockReturnThis(),
  doUpdateSet: vi.fn().mockReturnThis(),
};

const mockDb = {
  insertInto: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  onConflict: vi.fn((callback) => {
    callback(mockConflictBuilder);
    return mockDb;
  }),
  execute: vi.fn().mockResolvedValue([]),
  updateTable: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
};

describe('Catalog Repository - Datasets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the conflict builder mocks
    mockConflictBuilder.columns.mockClear();
    mockConflictBuilder.doUpdateSet.mockClear();
  });

  it('should upsert datasets with first_seen on insert', async () => {
    const testDatasets: UpsertDatasetInput[] = [
      {
        datasetId: 'test-123',
        host: 'data.example.gov',
        title: 'Test Dataset',
        category: 'Finance',
      },
    ];

    const result = await upsertDatasets('data.example.gov', testDatasets);

    expect(mockDb.insertInto).toHaveBeenCalledWith('catalog.socrata_datasets');
    expect(mockDb.values).toHaveBeenCalled();
    expect(mockDb.onConflict).toHaveBeenCalled();
    expect(result).toEqual({ upserted: 1, updated: 0 });
  });

  it('should update last_seen on subsequent upsert', async () => {
    const testDatasets: UpsertDatasetInput[] = [
      {
        datasetId: 'test-456',
        host: 'data.example.gov',
        title: 'Updated Dataset',
      },
    ];

    await upsertDatasets('data.example.gov', testDatasets);

    expect(mockConflictBuilder.doUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.any(Function),
        active: true,
        last_seen: expect.any(Date),
      })
    );
  });

  it('should retire stale datasets when cutoff provided', async () => {
    mockDb.execute.mockResolvedValue([{}, {}, {}]); // 3 affected rows

    const cutoffTime = new Date('2023-01-01');
    const result = await retireStaleDatasets('data.example.gov', cutoffTime);

    expect(mockDb.updateTable).toHaveBeenCalledWith('catalog.socrata_datasets');
    expect(mockDb.set).toHaveBeenCalledWith({ active: false });
    expect(mockDb.where).toHaveBeenCalledWith('host', '=', 'data.example.gov');
    expect(mockDb.where).toHaveBeenCalledWith('last_seen', '<', cutoffTime);
    expect(mockDb.where).toHaveBeenCalledWith('active', '=', true);
    expect(result).toBe(3);
  });

  it('should handle empty dataset arrays', async () => {
    const result = await upsertDatasets('data.example.gov', []);
    expect(result).toEqual({ upserted: 0, updated: 0 });
    expect(mockDb.insertInto).not.toHaveBeenCalled();
  });
});