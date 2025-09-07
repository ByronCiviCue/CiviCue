#!/usr/bin/env node

/**
 * Smoke test for NodeNext .js import path resolution
 * Verifies that the built env module can be imported correctly
 */

try {
  const module = await import('../dist/src/config/env.js');
  
  if (module && typeof module === 'object' && 'env' in module) {
    console.log('env ok');
    process.exit(0);
  } else {
    console.error('env import failed: invalid module structure');
    process.exit(1);
  }
} catch (error) {
  // Expected to fail if environment variables are missing (Zod validation error)
  if (error.message && error.message.includes('Environment validation failed')) {
    console.log('env ok');
    process.exit(0);
  }
  console.error('env import failed:', error.message);
  process.exit(1);
}