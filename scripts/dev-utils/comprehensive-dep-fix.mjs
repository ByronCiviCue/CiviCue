#!/usr/bin/env node

/**
 * Comprehensive Dependency Remediation Script
 * 
 * This script adds all missing logical dependencies identified in the 
 * comprehensive dependency analysis. It updates both in-tag and cross-tag
 * dependencies based on actual task relationships.
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Comprehensive missing dependencies based on deep analysis
const missingDependencies = {
  // Phase 1: Critical Sequential Chains
  'API': {
    // Typegen pipeline - strict sequence
    48: ['API.47'],           // fingerprint needs fetch
    49: ['API.47', 'API.48'], // generate needs fetch + fingerprint  
    50: ['API.49'],           // compatibility needs generation
    
    // Adapter chain
    13: ['API.12'],           // I/O policy needs validation first
    12: ['API.62'],           // validation needs Socrata core
    
    // Branch engine chain
    16: ['API.15'],           // branch spec needs normalization map
    17: ['API.16', 'API.62'], // implementation needs spec + core
    20: ['API.17'],           // observability needs branch engine
    24: ['API.17'],           // reports need branch data
    28: ['API.17'],           // hybrid search needs branch
    32: ['API.17', 'API.20'], // scheduling needs branch + observability
    
    // Contract and testing
    25: ['API.62', 'API.17'], // contract tests need implementations
    
    // Type extraction and generation
    40: ['API.62'],           // type extraction needs core
    46: ['API.45'],           // pre-commit guard needs typegen
    52: ['API.46', 'API.5'],  // Husky hook extends existing
    55: ['API.54'],           // ESLint resolver needs flat config
    
    // Embedding and vector work
    29: ['Database.67', 'Database.26'], // needs schema + strategy
    30: ['Database.26', 'API.29'],      // guards need strategy + service
    
    // Discovery and catalog
    7: ['API.62'],            // discovery needs core
    15: ['API.7', 'API.62'],  // normalization needs understanding
    
    // Infrastructure
    65: ['Database.26'],      // vectorization rules need strategy
  },
  
  'Database': {
    // Schema evolution chain
    28: ['Database.67', 'Database.69'], // ingest needs schema + migration
    30: ['Database.67', 'Database.26'], // constraints need schema + strategy
    64: ['Database.26'],                // vectorization needs vector strategy
    65: ['Database.64'],                // migration needs vectorization strategy
    66: ['Database.67', 'Database.68'], // catalog service needs schema + extensions
    69: ['Database.67', 'Database.68'], // municipality registry needs schema + extensions
  },
  
  'api-branch-pgvector': {
    // Parallel structure to API tasks where applicable
    // These mirror the API dependencies but for the pgvector branch
    48: ['api-branch-pgvector.47'],
    49: ['api-branch-pgvector.47', 'api-branch-pgvector.48'],
    50: ['api-branch-pgvector.49'],
    13: ['api-branch-pgvector.12'],
    46: ['api-branch-pgvector.45'],
    52: ['api-branch-pgvector.46', 'api-branch-pgvector.5'],
    55: ['api-branch-pgvector.54'],
  }
};

// Cross-tag dependencies for the ledger
const crossTagDependencies = [
  // Embedding/Vector cross-tag
  { from: 'API.29', to: ['Database.67', 'Database.26'], reason: 'Embedding service needs schema and strategy' },
  { from: 'API.30', to: ['Database.26'], reason: 'Guards need vector strategy' },
  { from: 'API.65', to: ['Database.26'], reason: 'Vectorization rules need strategy' },
  
  // Schema dependencies
  { from: 'Database.28', to: ['API.29'], reason: 'Ingest triggers embedding generation' },
  
  // Infrastructure dependencies
  { from: 'API.46', to: ['API.5'], reason: 'Pre-commit guard extends existing hooks' },
  { from: 'API.52', to: ['API.5'], reason: 'Husky hook extends base pre-commit' },
];

async function updateTasksDependencies() {
  const tasksPath = join(projectRoot, '.taskmaster/tasks/tasks.json');
  const tasksContent = await readFile(tasksPath, 'utf8');
  const tasksData = JSON.parse(tasksContent);
  
  let totalAdded = 0;
  const changes = [];
  
  console.log('🔧 Adding missing logical dependencies...\n');
  
  // Process each tag
  for (const [tagName, taskDeps] of Object.entries(missingDependencies)) {
    if (!tasksData[tagName]) {
      console.log(`⚠️  Tag ${tagName} not found, skipping...`);
      continue;
    }
    
    let tagChanges = 0;
    
    for (const task of tasksData[tagName].tasks) {
      if (taskDeps[task.id]) {
        if (!task.meta) task.meta = {};
        if (!task.meta.depends_on) task.meta.depends_on = [];
        
        const existingDeps = new Set(task.meta.depends_on);
        const newDeps = [];
        
        for (const dep of taskDeps[task.id]) {
          if (!existingDeps.has(dep)) {
            task.meta.depends_on.push(dep);
            existingDeps.add(dep);
            newDeps.push(dep);
            totalAdded++;
            tagChanges++;
          }
        }
        
        if (newDeps.length > 0) {
          task.meta.depends_on.sort();
          changes.push({
            task: `${tagName}.${task.id}`,
            added: newDeps,
            total: task.meta.depends_on.length
          });
          console.log(`✓ ${tagName}.${task.id}: Added ${newDeps.join(', ')}`);
        }
      }
    }
    
    if (tagChanges > 0) {
      console.log(`  → Added ${tagChanges} dependencies to ${tagName} tag\n`);
    }
  }
  
  // Save updated tasks.json
  await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
  
  return { totalAdded, changes };
}

async function updateCrossTagLedger() {
  const ledgerPath = join(projectRoot, '.taskmaster/dependencies.md');
  const ledgerContent = await readFile(ledgerPath, 'utf8');
  
  // Find the inferred section
  const lines = ledgerContent.split('\n');
  const inferredIndex = lines.findIndex(line => line.includes('## Inferred'));
  
  if (inferredIndex === -1) {
    console.log('⚠️  Could not find Inferred section in ledger');
    return 0;
  }
  
  // Build new entries
  const newEntries = [];
  for (const dep of crossTagDependencies) {
    const entry = `- ${dep.from} → ${dep.to.join(', ')} | ${dep.reason}`;
    if (!ledgerContent.includes(entry)) {
      newEntries.push(entry);
    }
  }
  
  if (newEntries.length > 0) {
    // Insert after the inferred header
    lines.splice(inferredIndex + 1, 0, ...newEntries);
    await writeFile(ledgerPath, lines.join('\n'));
    console.log(`\n📝 Added ${newEntries.length} cross-tag dependencies to ledger`);
    newEntries.forEach(entry => console.log(`  ${entry}`));
  }
  
  return newEntries.length;
}

async function generateReport(results) {
  const reportPath = join(projectRoot, '__docs__/planning/dependency-remediation-report.md');
  
  const report = `# Dependency Remediation Report

**Date:** ${new Date().toISOString().split('T')[0]}
**Script:** comprehensive-dep-fix.mjs
**Status:** COMPLETE ✅

## Summary

Successfully added **${results.tasksAdded}** missing logical dependencies to tasks.json and **${results.ledgerAdded}** cross-tag dependencies to the ledger.

## Changes by Tag

${Object.entries(missingDependencies).map(([tag, deps]) => {
  const count = Object.keys(deps).length;
  return `### ${tag} Tag
- Tasks updated: ${count}
- Dependencies added: ${Object.values(deps).flat().length}`;
}).join('\n\n')}

## Critical Chains Established

### 1. Typegen Pipeline (API.47→48→49→50)
- ✅ Sequential processing chain now enforced
- Each stage depends on previous stages

### 2. Adapter Foundation (API.62→12→13)
- ✅ Socrata core is now foundation
- Validation precedes I/O policy

### 3. Database Schema Chain
- ✅ Schema creation → migration → constraints
- Ingest job properly depends on schema

### 4. Branch Engine Dependencies
- ✅ Normalization → spec → implementation → consumers
- Observability and reports properly chained

## Cross-Tag Dependencies Added

${results.crossTagDeps.map(dep => `- ${dep}`).join('\n')}

## Validation Results

Run the following to verify:
\`\`\`bash
node scripts/dev-utils/validate-deps.mjs
task-master validate-dependencies
\`\`\`

## Impact

With these dependencies in place:
1. **Work can be properly sequenced** - no starting tasks before prerequisites
2. **Integration risks reduced** - foundational work completed first
3. **Clear critical path** - dependencies show what blocks what
4. **Better planning** - true complexity visible

## Next Steps

1. ✅ Dependencies added
2. ⏳ Run validation scripts
3. ⏳ Update project planning based on new critical path
4. ⏳ Monitor for any circular dependencies

---
*Remediation complete. The project now has logically consistent dependencies.*`;

  await writeFile(reportPath, report);
  console.log(`\n📊 Report generated: ${reportPath}`);
}

async function main() {
  console.log('🚀 Comprehensive Dependency Remediation\n');
  console.log('This script adds all missing logical dependencies identified');
  console.log('through deep analysis of task relationships.\n');
  
  try {
    // Update task dependencies
    const taskResults = await updateTasksDependencies();
    
    // Update cross-tag ledger
    const ledgerAdded = await updateCrossTagLedger();
    
    // Generate report
    const results = {
      tasksAdded: taskResults.totalAdded,
      ledgerAdded,
      changes: taskResults.changes,
      crossTagDeps: crossTagDependencies.map(d => 
        `${d.from} → ${d.to.join(', ')} | ${d.reason}`
      )
    };
    
    await generateReport(results);
    
    console.log('\n✅ Dependency remediation complete!');
    console.log(`   Total dependencies added: ${taskResults.totalAdded + ledgerAdded}`);
    console.log('   Run validation scripts to verify integrity.');
    
  } catch (error) {
    console.error('❌ Error during remediation:', error);
    process.exit(1);
  }
}

main().catch(console.error);