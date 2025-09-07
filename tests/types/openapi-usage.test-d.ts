import { expectType, expectError, expectAssignable } from 'tsd';
import type { paths, operations } from '../../src/generated/openapi.js';

// Test that main path types exist
type HealthPath = paths['/v1/health'];
type PermitsPath = paths['/v1/reports/permits'];
type SearchPath = paths['/v1/search/hybrid'];

expectType<HealthPath>({} as paths['/v1/health']);
expectType<PermitsPath>({} as paths['/v1/reports/permits']);
expectType<SearchPath>({} as paths['/v1/search/hybrid']);

// Test operation types exist
type HealthOperation = operations['healthCheck'];
type PermitsOperation = operations['getPermitReports'];  
type SearchOperation = operations['hybridSearch'];

expectType<HealthOperation>({} as operations['healthCheck']);
expectType<PermitsOperation>({} as operations['getPermitReports']);
expectType<SearchOperation>({} as operations['hybridSearch']);

// Test response types (use expectAssignable for optional fields)
type HealthResponse = paths['/v1/health']['get']['responses']['200']['content']['application/json'];
type PermitsResponse = paths['/v1/reports/permits']['get']['responses']['200']['content']['application/json'];
type SearchResponse = paths['/v1/search/hybrid']['get']['responses']['200']['content']['application/json'];

expectAssignable<HealthResponse>({ ok: true, time: '2025-01-01T00:00:00Z' });
expectAssignable<PermitsResponse>({ data: [{ id: 'test' }], meta: {} });
expectAssignable<SearchResponse>({ data: [{ id: 'test' }], meta: {} });

// Test parameter types for endpoints that have them
type PermitsParams = paths['/v1/reports/permits']['get']['parameters'];
type SearchParams = paths['/v1/search/hybrid']['get']['parameters'];

expectAssignable<PermitsParams>({ query: { geo: 'test', page: 1 } });
expectAssignable<SearchParams>({ query: { q: 'test', page: 1 } });

// Test that non-existent paths cause type errors  
expectError({} as paths['/nonexistent']);
expectError({} as operations['nonExistentOperation']);

// Test valid parameter usage
expectAssignable<SearchParams>({ query: { q: 'search term', department: 'planning' } });