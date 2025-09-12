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
  returning: vi.fn().mockReturnThis(),
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

  it('should upsert datasets and return actual counts for new inserts', async () => {
    const now = new Date();
    const testDatasets: UpsertDatasetInput[] = [
      {
        datasetId: 'test-123',
        host: 'data.example.gov',
        title: 'Test Dataset',
        category: 'Finance',
      },
    ];

    // Mock execute to return a new dataset (first_seen = now)
    mockDb.execute.mockResolvedValue([
      { dataset_id: 'test-123', first_seen: now }
    ]);

    const result = await upsertDatasets('data.example.gov', testDatasets);

    expect(mockDb.insertInto).toHaveBeenCalledWith('catalog.socrata_datasets');
    expect(mockDb.values).toHaveBeenCalled();
    expect(mockDb.onConflict).toHaveBeenCalled();
    expect(mockDb.returning).toHaveBeenCalledWith(['dataset_id', 'first_seen']);
    expect(result).toEqual({ inserted: 1, updated: 0 });
  });

  it('should return actual counts for updated datasets', async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 86400000); // 1 day ago
    const testDatasets: UpsertDatasetInput[] = [
      {
        datasetId: 'test-456',
        host: 'data.example.gov',
        title: 'Updated Dataset',
      },
    ];

    // Mock execute to return an updated dataset (first_seen = old date)
    mockDb.execute.mockResolvedValue([
      { dataset_id: 'test-456', first_seen: oldDate }
    ]);

    const result = await upsertDatasets('data.example.gov', testDatasets);

    expect(mockConflictBuilder.doUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.any(Function),
        active: true,
        last_seen: expect.any(Date),
      })
    );
    expect(mockDb.returning).toHaveBeenCalledWith(['dataset_id', 'first_seen']);
    expect(result).toEqual({ inserted: 0, updated: 1 });
  });

  it('should handle mixed new and updated datasets', async () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 86400000); // 1 day ago
    const testDatasets: UpsertDatasetInput[] = [
      { datasetId: 'new-1', host: 'data.example.gov', title: 'New Dataset 1' },
      { datasetId: 'old-1', host: 'data.example.gov', title: 'Old Dataset 1' },
      { datasetId: 'new-2', host: 'data.example.gov', title: 'New Dataset 2' },
    ];

    // Mock execute to return mixed results
    mockDb.execute.mockResolvedValue([
      { dataset_id: 'new-1', first_seen: now },
      { dataset_id: 'old-1', first_seen: oldDate },
      { dataset_id: 'new-2', first_seen: now },
    ]);

    const result = await upsertDatasets('data.example.gov', testDatasets);

    expect(result).toEqual({ inserted: 2, updated: 1 });
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
    expect(result).toEqual({ inserted: 0, updated: 0 });
    expect(mockDb.insertInto).not.toHaveBeenCalled();
  });
});