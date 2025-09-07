import { env } from '../lib/env';

// Environment validation happens during import
// This file can be imported by server implementations to ensure
// early validation of environment variables

export { env };