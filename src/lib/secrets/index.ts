/**
 * Server-only secrets facade barrel export.
 * 
 * Usage in server code:
 *   import { secrets } from '@/lib/secrets';
 *   const dbUrl = secrets.getDatabaseUrl();
 * 
 * WARNING: Never import this module from client-side code.
 * The module includes runtime guards to prevent browser usage.
 */
export { secrets } from './secrets.js';