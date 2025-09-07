#!/usr/bin/env node

import { execSync } from 'child_process';

/**
 * Pre-commit hook script to scan added lines in staged diffs for TODO and FIXME markers.
 * Allows TODO[allowed] and FIXME[allowed] syntax. Fails on unmarked TODO/FIXME comments.
 */

function main() {
  try {
    // Get staged diff with added lines only
    let diffOutput;
    try {
      diffOutput = execSync('git diff --cached -U0', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
    } catch {
      // No staged changes
      console.log('✅ TODO/FIXME scan: No staged changes to check');
      process.exit(0);
    }
    
    if (!diffOutput.trim()) {
      console.log('✅ TODO/FIXME scan: No staged changes to check');
      process.exit(0);
    }
    
    // Extract added lines (start with +, exclude file headers +++)
    const addedLines = diffOutput.split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.substring(1)); // Remove + prefix
    
    if (addedLines.length === 0) {
      console.log('✅ TODO/FIXME scan: No added lines to check');
      process.exit(0);
    }
    
    // Check for TODO/FIXME without [allowed] suffix (case-insensitive)
    const todoRegex = /\b(?:TODO|FIXME)\b(?!\s*\[allowed\])/i;
    const violations = [];
    
    addedLines.forEach((line, index) => {
      if (todoRegex.test(line)) {
        violations.push(`Line ${index + 1}: ${line.trim()}`);
      }
    });
    
    if (violations.length === 0) {
      console.log('✅ TODO/FIXME scan: No unmarked TODO/FIXME found in staged changes');
      process.exit(0);
    }
    
    // Limit output to first 20 violations
    const displayViolations = violations.slice(0, 20);
    const hasMore = violations.length > 20;
    
    console.error('❌ Pre-commit blocked: Unmarked TODO/FIXME found in staged changes');
    console.error('');
    console.error('Policy: Use TODO[allowed] or FIXME[allowed] for temporary markers.');
    console.error('');
    console.error('Found issues:');
    displayViolations.forEach(violation => {
      console.error(`  ${violation}`);
    });
    
    if (hasMore) {
      console.error(`  ... and ${violations.length - 20} more`);
    }
    
    console.error('');
    console.error('To bypass: CIVICUE_ALLOW_TODO=1 git commit ...');
    process.exit(1);
    
  } catch {
    console.error('❌ Error scanning staged changes for TODO/FIXME');
    process.exit(2);
  }
}

// Skip if environment variable is set
if (process.env.CIVICUE_ALLOW_TODO === '1') {
  console.log('⚠️  Skipping TODO/FIXME scan (CIVICUE_ALLOW_TODO is set)');
  process.exit(0);
}

main();