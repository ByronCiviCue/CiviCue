# Socrata HTTP Client

Minimal client for interacting with Socrata Open Data API.

## Usage

### Health Check

```typescript
import { healthPing } from '../src/lib/clients/socrata.js';

// Check if a Socrata host is available
const isAvailable = await healthPing('data.sfgov.org');
console.log(`Host available: ${isAvailable}`);
```

### Fetch Dataset Rows

```typescript
import { getRows } from '../src/lib/clients/socrata.js';

// Fetch all rows from a dataset
const allRows = await getRows('data.sfgov.org', 'abc-123');

// Fetch with query options
const filteredRows = await getRows('data.sfgov.org', 'abc-123', {
  limit: 100,
  select: 'id,name,status',
  where: 'status = "APPROVED"',
  order: 'created_date DESC',
  offset: 0
});
```

## Error Handling

Non-2xx responses throw `SocrataHttpError` with status code, URL, and response body snippet:

```typescript
try {
  await getRows('data.sfgov.org', 'invalid-id');
} catch (error) {
  if (error instanceof SocrataHttpError) {
    console.error(`Socrata API error: ${error.status} - ${error.url}`);
  }
}
```

## Authentication

The client automatically includes X-App-Token headers when available via the environment token resolver.