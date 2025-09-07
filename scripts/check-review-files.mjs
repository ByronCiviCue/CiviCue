#!/usr/bin/env node

import { execSync } from 'child_process';

/**
 * Pre-commit hook script to enforce confession requirements for code area changes.
 * Requires either a staged confession-*.md file OR both __review__/CONFESSION.md and DEFENSE.md staged.
 */

function main() {
  try {
    // Get staged files
    let stagedFiles;
    try {
      stagedFiles = execSync('git diff --cached --name-only', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
    } catch {
      // No staged files
      console.log('✅ Confession check: No staged files to check');
      process.exit(0);
    }
    
    if (!stagedFiles) {
      console.log('✅ Confession check: No staged files to check');
      process.exit(0);
    }
    
    const fileList = stagedFiles.split('\n').filter(f => f.trim());
    
    // Check if we're touching code areas
    const codeAreaRegex = /^(?:src\/|services\/|tests\/|vitest\.|vitest\/|src\/lib\/)/;
    const excludeRegex = /^(?:__docs__\/|\.github\/|\.husky\/|src\/generated\/)/;
    
    const codeAreaFiles = fileList.filter(file => 
      codeAreaRegex.test(file) && !excludeRegex.test(file)
    );
    
    if (codeAreaFiles.length === 0) {
      console.log('✅ Confession check: No code area changes, confession not required');
      process.exit(0);
    }
    
    // Check for confession requirements
    const confessionFileRegex = /^confession-.*\.md$/;
    const hasConfessionFile = fileList.some(file => confessionFileRegex.test(file));
    const hasReviewConfession = fileList.includes('__review__/CONFESSION.md');
    const hasReviewDefense = fileList.includes('__review__/DEFENSE.md');
    
    // Allow either confession-*.md OR both __review__/CONFESSION.md and __review__/DEFENSE.md
    const requirementsMet = hasConfessionFile || (hasReviewConfession && hasReviewDefense);
    
    if (!requirementsMet) {
      console.error('❌ Pre-commit blocked: Code area changes require confession');
      console.error('');
      console.error('Code areas touched:');
      codeAreaFiles.forEach(file => {
        console.error(`  ${file}`);
      });
      console.error('');
      console.error('Requirements: Stage EITHER:');
      console.error('  - A confession-<timestamp>.md file');
      console.error('  - OR both __review__/CONFESSION.md and __review__/DEFENSE.md');
      console.error('');
      console.error('To bypass: CIVICUE_SKIP_CONFESSION=1 git commit ...');
      process.exit(1);
    }
    
    console.log('✅ Confession check: Requirements met for code area changes');
    process.exit(0);
    
  } catch {
    console.error('❌ Error checking confession requirements');
    process.exit(2);
  }
}

// Skip if environment variable is set
if (process.env.CIVICUE_SKIP_CONFESSION === '1') {
  console.log('⚠️  Skipping confession check (CIVICUE_SKIP_CONFESSION is set)');
  process.exit(0);
}

main();