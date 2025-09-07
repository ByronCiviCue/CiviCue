# Pino Logger Usage

## Import and Basic Usage

```typescript
import { logger } from '../src/server/lib/logger.js';

// Basic logging
logger.info('Server starting up');
logger.error('Database connection failed', { error: err });

// Structured logging with context
logger.info('Processing request', {
  userId: '123',
  action: 'fetch_data',
  duration: 45
});
```

## Redaction Behavior

The logger automatically redacts sensitive information to prevent accidental exposure:

### Automatically Redacted Fields
- `req.headers.authorization` - Bearer tokens and basic auth
- `req.headers.cookie` - Session cookies  
- `req.headers.x-api-key` - API keys
- `res.headers.set-cookie` - Set-Cookie headers
- `body.password` - Password fields in request bodies
- `body.token` - Token fields in request bodies

### Request/Response Serialization
- **Requests**: Logs method, URL, remote address, and filtered headers (sensitive headers removed)
- **Responses**: Logs status code and content-length only (no response bodies)

## Performance Considerations

1. **Avoid logging request/response bodies** - They can be large and may contain sensitive data
2. **Use structured fields** instead of string interpolation:
   ```typescript
   // Good
   logger.info('User authenticated', { userId, email });
   
   // Avoid
   logger.info(`User ${userId} with email ${email} authenticated`);
   ```
3. **Log levels** - Use appropriate levels (debug, info, warn, error) to control verbosity
4. **Async logging** - Pino handles async writes automatically for performance

## Configuration

The logger respects the `LOG_LEVEL` environment variable (defaults to 'info'):
- `debug` - Most verbose, includes all levels
- `info` - Standard application logging
- `warn` - Warnings and errors only
- `error` - Errors only