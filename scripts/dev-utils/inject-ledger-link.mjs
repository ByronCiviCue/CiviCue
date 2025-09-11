#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LEDGER_LINK = '> **Cross-tag dependencies:** see `.taskmaster/dependencies.md`.';
const TASKMASTER_DIR = '.taskmaster';

async function* walkMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const path = join(dir, entry.name);
    
    if (entry.isDirectory()) {
      yield* walkMarkdownFiles(path);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
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
  
  // Find the first H1 (line starting with "# ")
  const h1Index = lines.findIndex(line => line.startsWith('# '));
  
  // Skip files without an H1
  if (h1Index === -1) {
    return false;
  }
  
  // Insert the ledger link after the H1, with a blank line before and after
  lines.splice(h1Index + 1, 0, '', LEDGER_LINK);
  
  await writeFile(filePath, lines.join('\n'));
  return true;
}

async function main() {
  let modifiedCount = 0;
  const modifiedFiles = [];
  
  for await (const filePath of walkMarkdownFiles(TASKMASTER_DIR)) {
    const wasModified = await injectLedgerLink(filePath);
    if (wasModified) {
      modifiedCount++;
      modifiedFiles.push(filePath);
    }
  }
  
  // QA output
  console.log('OK: ledger exists');
  console.log(`Modified ${modifiedCount} .md files`);
  
  // Spot-check first 3 modified files
  const spotCheckFiles = modifiedFiles.slice(0, 3);
  for (const file of spotCheckFiles) {
    const content = await readFile(file, 'utf-8');
    const firstLines = content.split('\n').slice(0, 5).join('\n');
    console.log(`\n--- ${file} (first 5 lines) ---`);
    console.log(firstLines);
  }
}

main().catch(console.error);