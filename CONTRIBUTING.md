# Contributing to CiviCue

Thank you for your interest in contributing to CiviCue! This guide outlines our development workflow and security practices.

## Security: Secret Scanning with Gitleaks

CiviCue uses [Gitleaks](https://github.com/gitleaks/gitleaks) to prevent accidental commits of secrets like API keys, tokens, and passwords.

### Automatic Scanning

- **CI Pipeline**: Every pull request is automatically scanned for secrets
- **Redacted Output**: When secrets are detected, they are redacted in logs for security
- **Blocking**: PRs with detected secrets will fail CI checks until resolved

### Local Development

To scan for secrets locally before committing:

```bash
# Install gitleaks (macOS with Homebrew)
brew install gitleaks

# Scan current changes
gitleaks detect --redact --source .

# Scan with our project config
gitleaks detect --redact --exit-code 1 --source . --config .gitleaks.toml

# Scan a specific commit
gitleaks detect --redact --log-opts="--since=1h"
```

### Excluded Paths

The following paths are excluded from secret scanning:
- `src/generated/**` - Generated code files
- `fingerprints/**` - Fingerprint data
- `test/fixtures/**` - Test fixture files
- `**/__fixtures__/**` - Any fixture directories
- `dist/**` - Build output
- `node_modules/**` - Dependencies
- `logs/**` - Log files

### Handling False Positives

If gitleaks flags legitimate content as a secret:

1. **Review carefully** - Ensure it's truly not a secret
2. **Use allowlisting** - Add specific patterns to `.gitleaks.toml` if needed
3. **Contact maintainers** - Open an issue to discuss the false positive

### Best Practices

- **Never commit real secrets** - Use environment variables instead
- **Use .env.example** - Template files without actual values
- **Local .env files** - Keep actual secrets in gitignored `.env` files
- **Rotate compromised secrets** - If you accidentally commit a secret, rotate it immediately

## Development Workflow

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally (including gitleaks scan)
5. Submit a pull request
6. Address any CI failures, including secret scanning

## Getting Help

- **Documentation**: See `__docs__/` directory
- **Issues**: Open a GitHub issue
- **Security**: For security concerns, email the maintainers directly

---

For more details, see our main [README](README.md) and [documentation](__docs__/README.md).