#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LEDGER_LINK = '# Cross-tag dependencies: see .taskmaster/dependencies.md';
const TASKS_DIR = '.taskmaster/tasks';

async function* walkTxtFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const path = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      yield* walkTxtFiles(path);
    } else if (entry.isFile() && entry.name.endsWith('.txt')) {
      yield path;
    }
  }
}

async function injectLedgerLink(filePath) {
  const content = await readFile(filePath, 'utf-8');
  
  // Skip if already contains the cross-tag dependencies reference
  if (content.includes('Cross-tag dependencies')) {
    return false;
  }
  
  const lines = content.split('\n');
  
  // Find the first "# Task ID:" line
  const taskIdIndex = lines.findIndex(line => line.startsWith('# Task ID:'));
  
  // Skip files without a Task ID header
  if (taskIdIndex === -1) {
    return false;
  }
  
  // Insert the ledger link after the Task ID line
  lines.splice(taskIdIndex + 1, 0, LEDGER_LINK);
  
  await writeFile(filePath, lines.join('\n'));
  return true;
}

async function main() {
  let modifiedCount = 0;
  const modifiedFiles = [];
  
  for await (const filePath of walkTxtFiles(TASKS_DIR)) {
    const wasModified = await injectLedgerLink(filePath);
    if (wasModified) {
      modifiedCount++;
      modifiedFiles.push(filePath);
    }
  }
  
  // QA output
  console.log('OK: ledger pointer injection complete');
  console.log(`Modified ${modifiedCount} .txt files`);
  
  // Spot-check first 3 modified files
  const spotCheckFiles = modifiedFiles.slice(0, 3);
  for (const file of spotCheckFiles) {
    const content = await readFile(file, 'utf-8');
    const firstLines = content.split('\n').slice(0, 6).join('\n');
    console.log(`\n--- ${file} (first 6 lines) ---`);
    console.log(firstLines);
  }
}

main().catch(console.error);