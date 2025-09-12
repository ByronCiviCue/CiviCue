#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

class DependencyValidator {
  constructor(tasksData) {
    this.tasksData = tasksData;
    this.allTasks = new Map(); // Fully qualified ID -> task object
    this.warnings = [];
    this.errors = [];
    this.crossTagDeps = [];
    
    // Tag aliases for backward compatibility
    this.tagAliases = {
      'DB': 'Database',
      'ADM': 'Admin', 
      'VEC': 'Vector',
      'ADP': 'App',
      'INFRA': 'Infra'
    };
    
    this.buildTaskMap();
  }

  buildTaskMap() {
    for (const [tagName, tagData] of Object.entries(this.tasksData)) {
      if (tagName === 'master' || !tagData.tasks) continue;
      
      for (const task of tagData.tasks) {
        const taskId = `${tagName}.${task.id}`;
        this.allTasks.set(taskId, { ...task, tag: tagName });
        
        // Add subtasks
        if (task.subtasks) {
          for (const subtask of task.subtasks) {
            const subtaskId = `${tagName}.${task.id}.${subtask.id}`;
            this.allTasks.set(subtaskId, { ...subtask, tag: tagName, parentId: task.id });
          }
        }
      }
    }
  }

  validateDependencies() {
    for (const [taskId, task] of this.allTasks) {
      // Check both task.dependencies and task.meta.depends_on
      const allDeps = [
        ...(task.dependencies || []),
        ...(task.meta?.depends_on || [])
      ];
      
      if (allDeps.length === 0) continue;
      
      for (const depRef of allDeps) {
        this.validateDependency(taskId, depRef, task);
      }
    }
  }

  validateDependency(taskId, depRef, task) {
    const [taskTag] = taskId.split('.');
    
    // Normalize dependency reference to fully qualified ID
    let qualifiedDepId;
    
    if (typeof depRef === 'string' && depRef.includes('.')) {
      // Already qualified (e.g., "API.62" or "2.1")
      if (depRef.split('.').length === 2 && !depRef.match(/^[A-Z]/)) {
        // Subtask reference like "2.1" - prepend current tag
        qualifiedDepId = `${taskTag}.${depRef}`;
      } else if (depRef.match(/^[A-Z]/)) {
        // Cross-tag reference like "API.62" or "DB.69"
        const [depTag, depNum] = depRef.split('.');
        // Apply tag aliases if needed
        const normalizedTag = this.tagAliases[depTag] || depTag;
        qualifiedDepId = `${normalizedTag}.${depNum}`;
      } else {
        // Same tag subtask like "2.1"
        qualifiedDepId = `${taskTag}.${depRef}`;
      }
    } else {
      // Numeric reference within same tag
      qualifiedDepId = `${taskTag}.${depRef}`;
    }

    // Check if dependency exists
    if (!this.allTasks.has(qualifiedDepId)) {
      this.errors.push({
        type: 'unknown_dependency',
        taskId,
        dependencyRef: depRef,
        qualifiedDepId,
        message: `Task ${taskId} depends on unknown task ${qualifiedDepId}`
      });
      
      // Add to task warnings
      if (!task.meta) task.meta = {};
      if (!task.meta.warnings) task.meta.warnings = [];
      task.meta.warnings.push(`unknown dependency: ${depRef}`);
      return;
    }

    // Check for self-dependency
    if (qualifiedDepId === taskId) {
      this.errors.push({
        type: 'self_dependency',
        taskId,
        message: `Task ${taskId} depends on itself`
      });
      return;
    }

    // Check for cross-tag dependency
    const [depTag] = qualifiedDepId.split('.');
    if (depTag !== taskTag) {
      this.crossTagDeps.push({
        from: taskId,
        to: qualifiedDepId,
        fromTag: taskTag,
        toTag: depTag
      });
    }

    // Check for status contradictions
    const depTask = this.allTasks.get(qualifiedDepId);
    if (task.status === 'done' && depTask.status !== 'done') {
      this.warnings.push({
        type: 'status_contradiction',
        taskId,
        dependencyId: qualifiedDepId,
        message: `Task ${taskId} is done but depends on ${qualifiedDepId} which is ${depTask.status}`
      });
    }

    // Normalize dependencies in meta
    if (!task.meta) task.meta = {};
    if (!task.meta.depends_on) task.meta.depends_on = [];
    if (!task.meta.depends_on.includes(qualifiedDepId)) {
      task.meta.depends_on.push(qualifiedDepId);
    }
  }

  detectCycles() {
    const visited = new Set();
    const recursionStack = new Set();
    
    for (const taskId of this.allTasks.keys()) {
      if (!visited.has(taskId)) {
        this.detectCyclesHelper(taskId, visited, recursionStack);
      }
    }
  }

  detectCyclesHelper(taskId, visited, recursionStack) {
    visited.add(taskId);
    recursionStack.add(taskId);
    
    const task = this.allTasks.get(taskId);
    if (task.meta && task.meta.depends_on) {
      for (const depId of task.meta.depends_on) {
        if (!visited.has(depId)) {
          this.detectCyclesHelper(depId, visited, recursionStack);
        } else if (recursionStack.has(depId)) {
          const [fromTag] = taskId.split('.');
          const [toTag] = depId.split('.');
          
          if (fromTag === toTag) {
            this.errors.push({
              type: 'cycle',
              taskId,
              dependencyId: depId,
              message: `Cycle detected: ${taskId} -> ${depId}`
            });
          } else {
            this.warnings.push({
              type: 'cross_tag_cycle',
              taskId,
              dependencyId: depId,
              message: `Cross-tag cycle detected: ${taskId} -> ${depId}`
            });
          }
        }
      }
    }
    
    recursionStack.delete(taskId);
  }

  normalizeDependencies() {
    for (const [, task] of this.allTasks) {
      if (task.meta && task.meta.depends_on) {
        task.meta.depends_on.sort();
      }
    }
  }

  async validateLedger() {
    try {
      const ledgerPath = join(projectRoot, '.taskmaster/dependencies.md');
      const ledgerContent = await readFile(ledgerPath, 'utf-8');
      
      // Extract ledger entries (lines starting with "- ") - flexible parsing
      // Supports: "- FROM -> TO | rationale" and "- FROM (desc) -> TO1, TO2 | rationale"
      const ledgerLines = ledgerContent.split('\n')
        .filter(line => line.trim().startsWith('- ') && line.includes(' -> '))
        .map(line => {
          // Split on -> first
          const arrowSplit = line.split(' -> ');
          if (arrowSplit.length < 2) return null;
          
          const from = arrowSplit[0].replace(/^-\s*/, '').trim().replace(/\s*\(.+?\)\s*$/, ''); // Remove "- " prefix and parenthetical if present
          const rightSide = arrowSplit[1];
          
          // Split RHS on | if present
          const rationaleSplit = rightSide.split(' | ');
          const toList = rationaleSplit[0].trim();
          
          // Handle comma-separated TO list
          const toTasks = toList.split(',').map(t => t.trim()).filter(Boolean);
          
          return toTasks.map(to => ({ from, to }));
        })
        .filter(Boolean)
        .flat(); // Flatten the array since we now return arrays from map

      const ledgerErrors = [];
      
      for (const entry of ledgerLines) {
        // Validate FROM task exists
        if (!this.allTasks.has(entry.from)) {
          ledgerErrors.push(`Ledger references non-existent task: ${entry.from}`);
        }
        
        // Validate TO tasks exist (could be comma-separated)
        const toTasks = entry.to.split(',').map(t => t.trim());
        for (const toTask of toTasks) {
          // Apply aliases for validation
          const [depTag, depNum] = toTask.split('.');
          const normalizedTag = this.tagAliases[depTag] || depTag;
          const normalizedId = `${normalizedTag}.${depNum}`;
          
          if (!this.allTasks.has(normalizedId)) {
            ledgerErrors.push(`Ledger references non-existent task: ${toTask} (normalized: ${normalizedId})`);
          }
        }
      }
      
      if (ledgerErrors.length > 0) {
        this.errors.push({
          type: 'ledger_validation',
          message: 'Ledger contains invalid task references',
          details: ledgerErrors
        });
      }
      
      return { validated: ledgerLines.length, errors: ledgerErrors.length };
    } catch (error) {
      this.errors.push({
        type: 'ledger_read_error',
        message: `Failed to read/validate ledger: ${error.message}`
      });
      return { validated: 0, errors: 1 };
    }
  }

  generateReport() {
    const report = {
      summary: {
        totalTasks: this.allTasks.size,
        tasksWithDependencies: Array.from(this.allTasks.values()).filter(t => t.dependencies && t.dependencies.length > 0).length,
        crossTagDependencies: this.crossTagDeps.length,
        errors: this.errors.length,
        warnings: this.warnings.length
      },
      errors: this.errors,
      warnings: this.warnings,
      crossTagDependencies: this.crossTagDeps,
      inferredDependencies: this.crossTagDeps.map(dep => ({
        from: dep.from,
        to: dep.to,
        ledgerFormat: `${dep.from} -> ${dep.to} | Inferred from task dependencies`
      }))
    };

    return this.formatReportAsMarkdown(report);
  }

  formatReportAsMarkdown(report) {
    let md = '# Dependency Audit Report\n\n';
    
    md += '## Summary\n\n';
    md += `- **Total tasks:** ${report.summary.totalTasks}\n`;
    md += `- **Tasks with dependencies:** ${report.summary.tasksWithDependencies}\n`;
    md += `- **Cross-tag dependencies:** ${report.summary.crossTagDependencies}\n`;
    md += `- **Fatal issues:** ${report.summary.errors}\n`;
    md += `- **Warnings:** ${report.summary.warnings}\n\n`;

    if (report.errors.length > 0) {
      md += '## Fatal Issues\n\n';
      for (const error of report.errors) {
        md += `- **${error.type}:** ${error.message}\n`;
        if (error.details) {
          for (const detail of error.details) {
            md += `  - ${detail}\n`;
          }
        }
      }
      md += '\n';
    }

    if (report.warnings.length > 0) {
      md += '## Warnings\n\n';
      for (const warning of report.warnings) {
        md += `- **${warning.type}:** ${warning.message}\n`;
      }
      md += '\n';
    }

    if (report.crossTagDependencies.length > 0) {
      md += '## Cross-Tag Dependencies\n\n';
      for (const dep of report.crossTagDependencies) {
        md += `- ${dep.from} -> ${dep.to}\n`;
      }
      md += '\n';
    }

    if (report.inferredDependencies.length > 0) {
      md += '## Inferred Dependencies for Ledger\n\n';
      md += 'Add these lines to the "Inferred (needs confirmation)" section in `.taskmaster/dependencies.md`:\n\n';
      for (const dep of report.inferredDependencies) {
        md += `- ${dep.ledgerFormat}\n`;
      }
      md += '\n';
    }

    md += `---\n*Generated: ${new Date().toISOString()}*\n`;
    
    return md;
  }

  async writeNormalizedTasks() {
    const tasksPath = join(projectRoot, '.taskmaster/tasks/tasks.json');
    await writeFile(tasksPath, JSON.stringify(this.tasksData, null, 2));
  }
}

async function main() {
  try {
    const tasksPath = join(projectRoot, '.taskmaster/tasks/tasks.json');
    const tasksContent = await readFile(tasksPath, 'utf8');
    const tasksData = JSON.parse(tasksContent);
    
    const validator = new DependencyValidator(tasksData);
    
    // Validate dependencies
    validator.validateDependencies();
    
    // Detect cycles
    validator.detectCycles();
    
    // Normalize dependencies first
    validator.normalizeDependencies();
    
    // Validate ledger against tasks (after normalization)
    await validator.validateLedger();
    
    // Generate report
    const report = validator.generateReport();
    
    // Write report
    const reportsDir = join(projectRoot, '__docs__/planning');
    await mkdir(reportsDir, { recursive: true });
    const reportPath = join(reportsDir, 'dependency-audit.md');
    await writeFile(reportPath, report);
    
    // Write normalized tasks
    await validator.writeNormalizedTasks();
    
    console.log(`✓ Dependency audit complete`);
    console.log(`✓ Report written to: ${reportPath}`);
    console.log(`✓ Tasks normalized: ${validator.allTasks.size} tasks processed`);
    
    if (validator.errors.length > 0) {
      console.log(`⚠️  Found ${validator.errors.length} fatal issues`);
      process.exit(1);
    }
    
    if (validator.warnings.length > 0) {
      console.log(`⚠️  Found ${validator.warnings.length} warnings`);
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();