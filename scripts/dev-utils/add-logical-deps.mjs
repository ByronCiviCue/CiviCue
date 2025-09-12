#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Missing logical dependencies to add
const missingDeps = {
  'Database': {
    64: ['Database.26'],
    28: ['Database.67', 'Database.69'], 
    30: ['Database.67'],
    66: ['Database.67', 'Database.68'] // in addition to existing Database.65
  },
  'API': {
    29: ['Database.67'], // embedding computation needs schema
    65: ['Database.26'], // vectorization rules need strategy
    67: ['API.62']       // client consolidation needs core
  }
};

async function main() {
  const tasksPath = join(projectRoot, '.taskmaster/tasks/tasks.json');
  const tasksContent = await readFile(tasksPath, 'utf8');
  const tasksData = JSON.parse(tasksContent);
  
  let changesCount = 0;
  
  for (const [tagName, taskDeps] of Object.entries(missingDeps)) {
    if (!tasksData[tagName]) continue;
    
    for (const task of tasksData[tagName].tasks) {
      if (taskDeps[task.id]) {
        if (!task.meta) task.meta = {};
        if (!task.meta.depends_on) task.meta.depends_on = [];
        
        const existingDeps = new Set(task.meta.depends_on);
        let added = 0;
        
        for (const dep of taskDeps[task.id]) {
          if (!existingDeps.has(dep)) {
            task.meta.depends_on.push(dep);
            existingDeps.add(dep);
            added++;
            changesCount++;
          }
        }
        
        if (added > 0) {
          task.meta.depends_on.sort();
          console.log(`✓ Added ${added} dependencies to ${tagName}.${task.id}: ${taskDeps[task.id].join(', ')}`);
        }
      }
    }
  }
  
  if (changesCount > 0) {
    await writeFile(tasksPath, JSON.stringify(tasksData, null, 2));
    console.log(`✓ Added ${changesCount} total logical dependencies`);
    console.log('✓ Updated tasks.json');
  } else {
    console.log('✓ No changes needed - all dependencies already exist');
  }
}

main().catch(console.error);