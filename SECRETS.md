# Secrets Policy

## What is a Secret?

A secret is any sensitive information that provides access to systems or services:
- API keys and tokens (Socrata, OpenAI, Anthropic, etc.)
- Database credentials and connection strings
- Authentication headers and bearer tokens
- Private keys and certificates
- Session cookies and JWTs
- Any credential that grants system access

## Storage Policy

### Environment Variables Only
- **NEVER** commit secrets to version control
- Store secrets in `.env` files only (gitignored)
- Use per-environment files: `.env`, `.env.local`, `.env.production`
- Follow the pattern in `.env.example` for documentation

### Rotation Guidance
- Rotate secrets regularly (quarterly minimum)
- Immediately rotate any secret that may have been exposed
- Use strong, randomly generated values
- Document rotation dates in team channels

## Scanning Policy

### Pre-commit Protection
- All commits are scanned for secrets using gitleaks
- Scanning runs on staged files only: `gitleaks detect --staged --redact -v`
- Secrets are redacted in output logs for security
- Failed scans block commits to prevent accidental exposure

### Emergency Bypass
- Use `GITLEAKS_ALLOW=1` environment variable for emergency commits
- Only use when absolutely necessary (e.g., production outage)
- Immediately create follow-up task to remove/rotate any exposed secrets
- Document bypass usage in incident reports

## Best Practices

1. **Never log secrets** - Use structured logging with redaction
2. **Use server-only access** - Keep secrets in backend processes only  
3. **Principle of least privilege** - Grant minimal required access
4. **Regular auditing** - Review secret usage quarterly
5. **Secure transmission** - Always use HTTPS/TLS for secret transit

## Incident Response

If a secret is accidentally committed:
1. Immediately rotate the exposed secret
2. Remove it from git history using `git filter-branch` or BFG
3. Notify the team and affected services
4. Document the incident and prevention measures