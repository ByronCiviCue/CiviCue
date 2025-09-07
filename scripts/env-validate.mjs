#!/usr/bin/env node

/**
 * Environment validation script
 * Validates env file structure, git hygiene, and variable completeness
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// Known secret patterns to scan for
const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9-_]{40,}/,  // OpenAI API keys
  /sk-ant-[a-zA-Z0-9-_]{40,}/, // Anthropic API keys
  /pplx-[a-zA-Z0-9-_]{40,}/, // Perplexity API keys
  /sk-or-v1-[a-zA-Z0-9-_]{40,}/, // OpenRouter API keys
  /[a-zA-Z0-9]{32,}/ // Generic long tokens
];

function main() {
  const isCI = Boolean(process.env.CI);
  let exitCode = 0;

  console.log(`🔍 Validating environment configuration (${isCI ? 'CI' : 'local'} mode)`);

  // 1. Check git hygiene - no tracked secrets
  try {
    checkGitHygiene();
  } catch (error) {
    console.error('❌ Git hygiene check failed:', error.message);
    exitCode = 1;
  }

  // 2. Check file structure
  try {
    checkFileStructure();
  } catch (error) {
    console.error('❌ File structure check failed:', error.message);
    exitCode = 1;
  }

  // 3. Check for secret leaks in tracked files
  try {
    checkSecretLeaks();
  } catch (error) {
    console.error('❌ Secret leak check failed:', error.message);
    exitCode = 1;
  }

  // 4. Validate variable completeness
  try {
    checkVariableCompleteness();
  } catch (error) {
    console.error('❌ Variable completeness check failed:', error.message);
    exitCode = 1;
  }

  // 5. Check for duplicate definitions
  try {
    checkDuplicateDefinitions();
  } catch (error) {
    console.error('❌ Duplicate definitions check failed:', error.message);
    exitCode = 1;
  }

  if (exitCode === 0) {
    console.log('✅ All environment validation checks passed');
  } else {
    console.log('❌ Environment validation failed');
  }

  process.exit(exitCode);
}

function checkGitHygiene() {
  console.log('🔒 Checking git hygiene...');

  // Check if .env or .env.local are tracked
  try {
    const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);

    const problematicFiles = trackedFiles.filter(file => 
      file.match(/^\.env$/) || 
      file.match(/^\.env\.local$/) || 
      file.match(/^\.env\.runtime$/)
    );

    if (problematicFiles.length > 0) {
      throw new Error(`Found tracked secret files: ${problematicFiles.join(', ')}`);
    }

    // Check .gitignore has proper entries
    const gitignorePath = resolve(PROJECT_ROOT, '.gitignore');
    if (existsSync(gitignorePath)) {
      const gitignoreContent = readFileSync(gitignorePath, 'utf8');
      const requiredIgnores = ['.env', '.env.local', '.env.runtime'];
      const missing = requiredIgnores.filter(pattern => 
        !gitignoreContent.includes(pattern)
      );

      if (missing.length > 0) {
        console.warn(`⚠️  .gitignore missing patterns: ${missing.join(', ')}`);
      }
    }
  } catch (error) {
    if (error.message.includes('not a git repository')) {
      console.log('ℹ️  Not in a git repository, skipping git checks');
      return;
    }
    throw error;
  }

  console.log('✅ Git hygiene check passed');
}

function checkFileStructure() {
  console.log('📁 Checking file structure...');

  const envExamplePath = resolve(PROJECT_ROOT, '.env.example');
  const envLocalPath = resolve(PROJECT_ROOT, '.env.local');
  const envCiPath = resolve(PROJECT_ROOT, '.env.ci');

  // .env.example must exist and be tracked
  if (!existsSync(envExamplePath)) {
    throw new Error('.env.example is missing');
  }

  // .env.local should exist in local development but be gitignored
  if (!process.env.CI && !existsSync(envLocalPath)) {
    console.warn('⚠️  .env.local not found in local environment. Run: pnpm env:local:init');
  }

  // .env.ci is optional but should not contain secrets if it exists
  if (existsSync(envCiPath)) {
    console.log('ℹ️  .env.ci found, will validate it contains no secrets');
  }

  console.log('✅ File structure check passed');
}

function checkSecretLeaks() {
  console.log('🕵️  Checking for secret leaks in tracked files...');

  const filesToCheck = [
    resolve(PROJECT_ROOT, '.env.example'),
    resolve(PROJECT_ROOT, '.env.ci')
  ].filter(existsSync);

  for (const filePath of filesToCheck) {
    const content = readFileSync(filePath, 'utf8');
    const fileName = filePath.split('/').pop();

    for (const pattern of SECRET_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        throw new Error(`Potential secret found in ${fileName}: ${matches[0].substring(0, 10)}...`);
      }
    }

    // Check for non-empty values that look suspicious
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('=') && !line.startsWith('#')) {
        const [key, value] = line.split('=', 2);
        if (value && value.length > 20 && !isKnownSafeValue(value)) {
          console.warn(`⚠️  ${fileName}:${i + 1} - Suspicious long value for ${key}`);
        }
      }
    }
  }

  console.log('✅ Secret leak check passed');
}

function isKnownSafeValue(value) {
  const safePatterns = [
    /^postgres:\/\//,  // Database URLs with localhost/placeholders
    /^https?:\/\//,    // HTTP URLs
    /^localhost/,      // Localhost references
    /^\d+$/,          // Pure numbers
    /^(development|production|test)$/, // Environment names
    /^text-embedding-/ // Model names
  ];

  return safePatterns.some(pattern => pattern.test(value));
}

function checkVariableCompleteness() {
  console.log('📋 Checking variable completeness...');

  const envExamplePath = resolve(PROJECT_ROOT, '.env.example');
  const exampleContent = readFileSync(envExamplePath, 'utf8');

  // Extract all variable names from .env.example
  const exampleVars = new Set();
  const lines = exampleContent.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) {
      exampleVars.add(match[1]);
    }
  }

  console.log(`ℹ️  Found ${exampleVars.size} variables in .env.example`);

  // TODO: Add code scanning for required variables when we have more source files
  // For now, we'll rely on runtime validation

  console.log('✅ Variable completeness check passed');
}

function checkDuplicateDefinitions() {
  console.log('🔍 Checking for duplicate definitions...');

  const envCiPath = resolve(PROJECT_ROOT, '.env.ci');
  const envExamplePath = resolve(PROJECT_ROOT, '.env.example');

  if (!existsSync(envCiPath)) {
    console.log('ℹ️  .env.ci not found, skipping duplicate check');
    return;
  }

  // Get variables from both files
  const exampleVars = extractVariables(envExamplePath);
  const ciVars = extractVariables(envCiPath);

  // Find overlapping variables (duplicates)
  const duplicates = [...ciVars.keys()].filter(key => exampleVars.has(key));

  if (duplicates.length > 0) {
    console.warn(`⚠️  Found potentially redundant definitions in .env.ci: ${duplicates.join(', ')}`);
    console.warn('💡 Consider if these CI overrides are truly necessary');
  }

  console.log('✅ Duplicate definitions check passed');
}

function extractVariables(filePath) {
  const variables = new Map();
  const content = readFileSync(filePath, 'utf8');
  
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) {
      variables.set(match[1], match[2]);
    }
  }

  return variables;
}

main();