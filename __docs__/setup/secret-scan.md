# Secret Scanning

CiviCue uses [Gitleaks](https://github.com/gitleaks/gitleaks) to prevent secrets from being committed to the repository.

## How it works

Gitleaks scans for API keys, tokens, passwords, and other sensitive data using pattern matching. It runs automatically in CI on pull requests and pushes to main.

## Running locally

```bash
pnpm secret-scan
```

## Excluded paths

The following directories are excluded from scanning as they contain generated artifacts or test fixtures:
- `src/generated/**` - Auto-generated code
- `fingerprints/**` - Dataset fingerprints  
- `tests/fixtures/**` - Test data
- `**/*.snap` - Jest snapshots

## Fixing findings

1. **Remove the secret** from the file and commit the fix
2. **Rotate the credential** if it was real (change password, regenerate API key)
3. **Force push only if necessary** - avoid rewriting shared history when possible