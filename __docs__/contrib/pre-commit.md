# Pre-commit Hooks Policy

This repository enforces code quality standards through automated pre-commit hooks that run before each git commit.

## Policy Summary

Commits are automatically blocked if:

1. **Missing Review Files**: Either `__review__/CONFESSION.md` or `__review__/DEFENSE.md` files are not present
2. **TODO/FIXME Markers**: Any staged files contain `TODO` or `FIXME` comments

## Setup

### Prerequisites

- Node.js (any recent version)
- Git
- pnpm package manager

### Installation

The pre-commit hooks are automatically installed when you run:

```bash
pnpm install
```

This triggers the `prepare` script which sets up Husky git hooks.

### Verification

To verify hooks are installed:

```bash
ls -la .husky/
# Should show pre-commit file
```

## Hook Behavior

### Review Files Check

The hook checks for the presence of both required review files:

- `__review__/CONFESSION.md` - Pre-flight checklist and confession of any deviations
- `__review__/DEFENSE.md` - Defense statement explaining design choices and compliance

**Example failure:**
```
❌ Pre-commit blocked: Missing __review__/CONFESSION.md

Please create the confession file before committing.
To bypass: SKIP_PRECOMMIT_CHECKS=1 git commit ...
```

### TODO/FIXME Scanner

The hook scans all staged files for `TODO` and `FIXME` comments and blocks commits containing them.

**Example failure:**
```
❌ Pre-commit blocked: TODO/FIXME markers found in staged files

Policy: Commits must not contain TODO or FIXME comments.

Found issues:
  src/example.ts:42:  // TODO: implement error handling
  src/utils.ts:15:    // FIXME: refactor this logic

Please resolve these items before committing.
```

## Manual Execution

You can run the pre-commit checks manually:

```bash
# Run all checks
pnpm verify:precommit

# Run individual checks
node scripts/check-review-files.mjs
node scripts/scan-staged-for-todos.mjs
```

## Bypassing Hooks (Emergency Use)

### Environment Variable

Set `SKIP_PRECOMMIT_CHECKS=1` to bypass all checks:

```bash
SKIP_PRECOMMIT_CHECKS=1 git commit -m "emergency fix"
```

### Git Flag

Use `--no-verify` to bypass git hooks entirely:

```bash
git commit --no-verify -m "emergency fix"
```

**⚠️ Warning:** Bypassing hooks should be used sparingly and may be disallowed by CI/review processes.

## Troubleshooting

### Hooks Not Running

1. **Verify installation:**
   ```bash
   ls -la .husky/pre-commit
   # Should show executable file
   ```

2. **Check git hooks path:**
   ```bash
   git config core.hooksPath
   # Should return .husky
   ```

3. **Reinstall hooks:**
   ```bash
   rm -rf .husky
   pnpm install
   ```

### Permission Issues

On Unix systems, ensure hooks are executable:

```bash
chmod +x .husky/pre-commit
chmod +x scripts/check-review-files.mjs
chmod +x scripts/scan-staged-for-todos.mjs
```

### Windows Issues

- Use Git Bash or WSL for best compatibility
- Ensure Node.js is in your PATH
- Consider using Windows Subsystem for Linux (WSL)

### Script Errors

If scripts fail with errors:

1. **Check Node.js version:**
   ```bash
   node --version
   # Should be v16+ for ESM support
   ```

2. **Verify git is available:**
   ```bash
   git --version
   ```

3. **Test scripts individually:**
   ```bash
   node scripts/check-review-files.mjs
   node scripts/scan-staged-for-todos.mjs
   ```

## Examples

### Successful Commit Flow

```bash
# 1. Create review files
touch __review__/CONFESSION.md __review__/DEFENSE.md

# 2. Stage changes (without TODO/FIXME)
git add src/feature.ts

# 3. Commit succeeds
git commit -m "feat: add new feature"
# 🔍 Running pre-commit quality checks...
# ✅ Review files check: CONFESSION.md and DEFENSE.md present  
# ✅ TODO/FIXME scan: No TODO/FIXME markers found in staged files
# ✅ Pre-commit checks passed
```

### Blocked Commit Examples

**Missing review files:**
```bash
rm __review__/CONFESSION.md
git commit -m "test"
# ❌ Pre-commit blocked: Missing __review__/CONFESSION.md
```

**TODO markers present:**
```bash
echo "// TODO: fix this" >> src/test.ts
git add src/test.ts
git commit -m "test"
# ❌ Pre-commit blocked: TODO/FIXME markers found in staged files
```

## CI/CD Integration

These same checks should be enforced in your CI pipeline:

```yaml
# Example GitHub Actions step
- name: Pre-commit checks
  run: pnpm verify:precommit
```

## Team Onboarding

New team members should:

1. Clone the repository
2. Run `pnpm install` (installs hooks automatically)  
3. Test the hook behavior with a dummy commit
4. Understand the bypass mechanisms for emergencies
5. Know where to find this documentation

## Support

If you encounter issues with the pre-commit hooks:

1. Check this documentation first
2. Try the troubleshooting steps
3. Ask team members for help
4. Create an issue if you find a bug in the hook scripts