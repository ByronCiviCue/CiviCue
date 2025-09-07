# CI Secrets Scan with Runtime Canary

## Overview

The CI secrets scan workflow (`ci-secrets-scan.yml`) provides automated detection of committed secrets using gitleaks with a runtime-generated "canary" to prove detection is working.

## How It Works

### Runtime Canary Generation
- **Never commits secrets**: The canary file is created at CI runtime in a temporary directory (`__tmp_canary__/`)
- **Realistic patterns**: Uses AWS Access Key ID and Secret Access Key patterns that match default gitleaks rules
- **In-workspace**: The temp file is created within the repository workspace so gitleaks scans it along with committed files
- **Always cleaned up**: The canary is removed after scanning, even if the job fails

### Detection Process
1. Checkout repository
2. Create temporary canary file with fake AWS credentials
3. Download official gitleaks binary (v8.21.2+)
4. Verify gitleaks version and functionality
5. Run `gitleaks detect --redact --source . --verbose`
6. **Expected behavior**: gitleaks detects the canary (exit code 1)
7. **Success condition**: Job succeeds only when gitleaks finds the canary
8. Clean up temporary files

### Canary Patterns Used
```
AWS_ACCESS_KEY_ID=AKIA1234567890123456        # 20 chars, starts with AKIA
AWS_SECRET_ACCESS_KEY=abcdefghijklmnopqrstuvwxyz1234567890ABCD  # 40 base64-like chars
```

## Log Redaction

All gitleaks output uses `--redact` to prevent actual secret values from appearing in CI logs, even for the test canary.

## Triggers

- **Push**: Any branch
- **Pull Request**: Any target branch
- Runs on Ubuntu latest with official gitleaks binary

## Interpreting Results

### ✅ Success (Normal)
- Gitleaks detects the canary and fails
- Job succeeds with message: "SUCCESS: gitleaks detected the runtime canary"
- This confirms secret detection is working

### ❌ Failure Modes
1. **Gitleaks doesn't detect canary**: Detection rules may be broken
2. **Binary download fails**: Network/release issues
3. **Workspace setup fails**: Repository checkout issues

### Debugging Failures
- Check workflow logs in GitHub Actions tab
- Verify gitleaks configuration in `.gitleaks.toml`
- Ensure canary patterns match default gitleaks rules
- Test locally: `gitleaks detect --redact --source .`

## Security Warnings

⚠️ **NEVER commit test secrets or canaries to the repository**
⚠️ The canary is generated at runtime precisely to avoid this risk
⚠️ If you need to test detection locally, create temp files outside the repo or ensure they're gitignored

## Limitations

- Only tests detection, not the full pre-commit flow
- Uses default gitleaks rules (AWS patterns)
- Single canary pattern per run
- Does not test custom rules or edge cases