# Dependency Investigation — ExitPlan Snapshot
Repo: CiviCue
Ref: fcf8747
Timestamp: 2025-09-11T20:25:30.000Z

# Taskmaster Dependency Analysis & Remediation Plan

## Investigation Findings

### 1. Dependency Architecture Issues
- **Problem**: Tasks have empty `dependencies[]` arrays but populated `meta.depends_on[]` arrays
- **In-tag dependencies**: 43 were added via script, but most are simple sequential chains (1→2→3→4...)
- **Cross-tag dependencies**: Only 8 actual cross-tag dependencies exist in tasks.json vs. ledger claiming more

### 2. Cross-Tag Dependency Misalignment
**Actual in tasks.json**:
- API.23 → Database.69
- Database.67 → API.62  
- Admin.1 → API.62, Database.67, Database.69
- Admin.3 → API.62
- Infra.3 → API.62, App.1

**Ledger claims (with errors)**:
- Uses wrong tag abbreviations (DB→Database, ADM→Admin, VEC→Vector, ADP→App)
- References non-existent tasks (VEC.64, ADP.38-41 don't exist)
- Database.64 exists but isn't VEC.64

### 3. Task Complexity & Expansion Status
- **No complexity scores** stored in tasks.json (despite reports claiming scores)
- Database tasks have 3-14 subtasks each (avg ~6)
- High-complexity candidates: DB.71 (12 subtasks), DB.72 (14 subtasks)
- Most tasks appear adequately expanded based on subtask counts

### 4. Validation Script Issues  
- Script correctly found 8 cross-tag dependencies
- But ledger uses wrong tag names, causing validation mismatches
- Script needs to handle tag aliases (DB→Database, etc.)

## Remediation Plan

### Phase 1: Fix Cross-Tag Dependencies
1. **Update ledger** with correct tag names and task IDs:
   - Replace DB→Database, ADM→Admin, VEC→Vector, ADP→App
   - Fix VEC.64 → Database.64 (or Vector.2 if that's the intent)
   - Remove references to non-existent tasks
   
2. **Add missing cross-tag dependencies** discovered in investigation:
   - Database.66 → Database.65 (catalog service needs schema)
   - Database.71 → Database.70 (materializer after widgets)
   - Database.72 → Database.71 (normalize after stage)

### Phase 2: Enhance Validation Script  
1. **Add tag alias mapping**: DB→Database, ADM→Admin, etc.
2. **Validate ledger entries** against actual tasks
3. **Report discrepancies** between ledger and tasks.json
4. **Handle both** `dependencies[]` and `meta.depends_on[]` arrays

### Phase 3: Run Complexity Analysis
1. **Analyze all tags** for complexity (especially pending tasks)
2. **Expand high-complexity tasks** (threshold: 7+) with research
3. **Focus on**: Database.71, Database.72, Database.28 (likely complex)

### Phase 4: Populate Missing Dependencies
1. **Infer logical dependencies** based on task titles/descriptions
2. **Add in-tag dependencies** where tasks build on each other
3. **Validate with** taskmaster validate-dependencies

### Phase 5: Generate Comprehensive Report
1. **Full dependency matrix** (in-tag and cross-tag)
2. **Complexity scores** and expansion recommendations
3. **Validation results** from both scripts
4. **Confession update** with all findings and fixes

## Execution Steps
1. Fix ledger with correct tag names and task IDs
2. Update validate-deps.mjs with tag aliasing
3. Run complexity analysis on all tags
4. Expand high-complexity tasks with research
5. Validate all dependencies
6. Generate final report for architect review
7. Update confession with complete remediation summary

--- 
Provenance: ExitPlan snapshot captured before remediation
Next step (paused): Apply remediation (ledger tag fix, alias-aware validator, cross-tag backfill, etc.)