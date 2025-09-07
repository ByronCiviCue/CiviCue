# Environment Setup

This guide explains how to configure environment variables for CiviCue.

## Quick Setup

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your values:**
   ```bash
   # Required variables (app will fail without these)
   DATABASE_URL=postgres://user:pass@localhost:5432/civicue
   SOCRATA_APP_ID=your-socrata-app-id
   EMBEDDING_MODEL=text-embedding-3-large
   ```

3. **Test your configuration:**
   ```bash
   npm run test
   npm run typecheck
   ```

## Environment Variables

### Database (Required)
- **`DATABASE_URL`** - Postgres connection string with pgvector extension
- **`PGVECTOR_DIM`** - Vector embedding dimensions (default: 1536)

### Data Sources
- **`SOCRATA_APP_ID`** (required) - App ID for Socrata API access
- **`SOCRATA_APP_SECRET`** - App secret for higher rate limits
- **`CKAN_BASE_URL`** - Base URL for CKAN instance
- **`CKAN_API_KEY`** - API key for private CKAN data access
- **`ARCGIS_PORTAL_URL`** - Portal URL for ArcGIS services
- **`ARCGIS_API_KEY`** - API key for ArcGIS services

### AI/Embeddings (Required)
- **`EMBEDDING_MODEL`** (required) - Model name for generating embeddings
- **`OPENAI_API_KEY`** - OpenAI API key
- **`ANTHROPIC_API_KEY`** - Anthropic API key
- **`GOOGLE_API_KEY`** - Google API key

*At least one AI API key is required for embedding generation.*

### Runtime
- **`NODE_ENV`** - Application environment (development/test/production)
- **`PORT`** - Server port (default: 3000)
- **`REQUEST_TIMEOUT_MS`** - HTTP timeout in milliseconds (default: 10000)
- **`RETRY_MAX_ATTEMPTS`** - Max retry attempts for failed requests (default: 3)
- **`RETRY_BASE_DELAY_MS`** - Base delay between retries (default: 250)

## Validation Behavior

The application validates all environment variables at startup using Zod schemas:

- **Fail-fast**: App won't start with missing required variables
- **Type coercion**: Numeric values are automatically converted from strings
- **Safe errors**: Error messages never include actual secret values
- **Defaults**: Sensible defaults provided where safe

## Testing

Run the environment validation tests:

```bash
# Run all tests
npm test

# Run only env tests  
npm test tests/env.spec.ts

# Watch mode for development
npm run test:watch
```

## Troubleshooting

**Q: App fails to start with "DATABASE_URL is required"**
A: Ensure your `.env` file contains a valid Postgres connection string.

**Q: Vector operations fail**
A: Verify `PGVECTOR_DIM` matches your embedding model's output dimensions.

**Q: API calls are failing**
A: Check that required API keys are set and valid for your data sources.