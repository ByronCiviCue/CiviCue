#!/usr/bin/env node

/**
 * Initialize .env.local from .env.example
 * Usage: pnpm env:local:init [--force]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const ENV_EXAMPLE_PATH = resolve(PROJECT_ROOT, '.env.example');
const ENV_LOCAL_PATH = resolve(PROJECT_ROOT, '.env.local');

function main() {
  // Guard against running in CI
  if (process.env.CI) {
    console.error('❌ env:local:init should not be run in CI environment');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const force = args.includes('--force');

  // Check if .env.example exists
  if (!existsSync(ENV_EXAMPLE_PATH)) {
    console.error('❌ .env.example not found at:', ENV_EXAMPLE_PATH);
    process.exit(1);
  }

  // Check if .env.local already exists
  if (existsSync(ENV_LOCAL_PATH) && !force) {
    console.log('✅ .env.local already exists. Use --force to regenerate.');
    console.log('💡 To regenerate: pnpm env:local:init --force');
    return;
  }

  try {
    // Read .env.example
    const exampleContent = readFileSync(ENV_EXAMPLE_PATH, 'utf8');
    
    // Process content: keep comments and structure, but clear values
    const localContent = exampleContent
      .split('\n')
      .map(line => {
        // Keep comments and empty lines as-is
        if (line.trim().startsWith('#') || line.trim() === '') {
          return line;
        }
        
        // For variable definitions, clear the value but keep the key
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (match) {
          const [, key, value] = match;
          // Keep non-sensitive defaults like localhost URLs, ports, etc.
          if (value.includes('localhost') || value.match(/^\d+$/) || 
              value === 'development' || value === 'text-embedding-3-large') {
            return line;
          }
          // Clear potentially sensitive values
          return `${key}=`;
        }
        
        return line;
      })
      .join('\n');

    // Write .env.local
    writeFileSync(ENV_LOCAL_PATH, localContent, 'utf8');

    if (force) {
      console.log('🔄 Regenerated .env.local from .env.example');
    } else {
      console.log('✅ Created .env.local from .env.example');
    }
    
    console.log('📝 Please fill in the empty values in .env.local with your actual secrets');
    console.log('🔒 .env.local is gitignored and will not be committed');
    
  } catch (error) {
    console.error('❌ Failed to create .env.local:', error.message);
    process.exit(1);
  }
}

main();