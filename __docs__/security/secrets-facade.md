# Secrets Facade

## Purpose

The secrets facade (`src/lib/secrets/`) centralizes access to sensitive environment variables and prevents them from being accidentally imported into client-side code. This ensures that API keys, database URLs, tokens, and other secrets remain server-only.

## Key Benefits

- **Centralized access**: Single point of control for all sensitive configuration
- **Client protection**: Runtime guards prevent browser/client-side imports
- **Type safety**: Structured getters instead of raw `process.env` access
- **Future-proof**: Extensible for new data platforms and services

## Server Usage

```typescript
import { secrets } from '@/lib/secrets';

// Database access
const dbUrl = secrets.getDatabaseUrl();
const vectorDim = secrets.getVectorDimension();

// AI service keys
const openaiKey = secrets.getOpenAIKey();
const anthropicKey = secrets.getAnthropicKey();

// Data platform credentials
const socrataAppId = secrets.getSocrataAppId();
const socrataSecret = secrets.getSocrataAppSecret();

// Runtime configuration
const logLevel = secrets.getLogLevel();
const port = secrets.getPort();
```

## Available Secrets

### Database
- `getDatabaseUrl()` - PostgreSQL connection string
- `getVectorDimension()` - pgvector dimension setting

### AI/ML Services  
- `getOpenAIKey()` - OpenAI API key
- `getAnthropicKey()` - Anthropic API key
- `getGoogleKey()` - Google AI API key
- `getEmbeddingModel()` - Embedding model configuration

### Data Platforms
- `getSocrataAppId()` - Socrata application ID
- `getSocrataAppSecret()` - Socrata application secret
- `getCkanApiKey()` - CKAN API key (stub)
- `getCkanBaseUrl()` - CKAN base URL (stub)
- `getArcGISApiKey()` - ArcGIS API key (stub)
- `getArcGISPortalUrl()` - ArcGIS portal URL (stub)

### Runtime Configuration
- `getLogLevel()` - Logging level
- `getPort()` - Server port
- `getNodeEnv()` - Node environment
- `getRequestTimeout()` - HTTP request timeout
- `getRetryMaxAttempts()` - Retry attempt limit
- `getRetryBaseDelay()` - Retry base delay

## Security Guards

The facade includes runtime protection:

```typescript
if (typeof window !== 'undefined') {
  throw new Error('Secrets module cannot be imported in browser/client code. Use server-only.');
}
```

This prevents accidental client-side imports that could expose secrets in browser bundles.

## ⚠️ Critical Warning

**NEVER import the secrets facade from:**
- React components
- Client-side utilities
- Browser-executed code
- Frontend bundles

**Always use only in:**
- Server routes and middleware
- Background jobs
- Database connections
- API integrations
- Server-side utilities

Violating this rule could expose sensitive credentials to client-side code and browser bundles.

## Future Extensions

The facade is designed to accommodate new integrations:
- Additional data platform APIs
- New AI/ML services
- Custom authentication providers
- Third-party service credentials

Add new getters following the existing pattern and maintain the server-only constraint.