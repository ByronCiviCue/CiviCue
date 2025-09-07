# Environment Variable Management

This guide covers environment variable management strategies for multi-developer workflows in CiviCue, including secret management tools and security best practices.

## Overview and Principles

### Core Principles

1. **Never commit secrets** - No API keys, passwords, or tokens in git history
2. **Environment separation** - Clear boundaries between local/dev/preview/staging/prod
3. **Least privilege** - Developers only access secrets they need
4. **Auditability** - Track who accessed what and when
5. **Single source of truth** - Consistent variable names across all tools

### Security Guidelines

- Use `.env.local` for local development (excluded from git)
- Secrets are injected at runtime, never stored in plaintext files
- Regular rotation of API keys and tokens
- Immediate response to any secret exposure incidents

## Recommended Default Workflow

For new contributors, we recommend **Doppler** as the primary secret management solution:

1. Install Doppler CLI and authenticate
2. Connect to the CiviCue project
3. Use `doppler run` to inject secrets at runtime
4. Never download secrets to files for production use

Alternative workflows using 1Password or Railway are documented below for teams with existing preferences.

## Tool-Specific Configurations

### Doppler

Doppler provides centralized secret management with project-based configurations.

#### Setup

```bash
# Install Doppler CLI
curl -Ls https://cli.doppler.com/install.sh | sh

# Authenticate
doppler login

# Connect to CiviCue project
doppler setup
# Select project: civicue
# Select environment: development (for local dev)
```

#### Project Structure

Our Doppler project uses these environments:
- **development** - Local development secrets
- **staging** - Staging environment secrets  
- **production** - Production secrets

#### Usage Patterns

**Runtime injection (recommended):**
```bash
# Run development server with injected secrets
doppler run -- npm start

# Run tests with development secrets
doppler run -- npm test

# Run specific commands
doppler run -- node scripts/registry-socrata-sf.mjs
```

**Download for inspection (dev only):**
```bash
# Download to see variable names (secrets redacted)
doppler secrets download --no-file --format env-no-quotes

# Generate .env.local for tools that require files
doppler secrets download --format env > .env.local
```

#### Service Tokens (CI/CD)

For CI systems, create service tokens:

```bash
# Create a service token for development environment
doppler configs tokens create --name "github-actions-dev" --config development
```

Use the token in CI:
```yaml
# GitHub Actions example
- name: Run tests
  env:
    DOPPLER_TOKEN: ${{ secrets.DOPPLER_SERVICE_TOKEN }}
  run: doppler run -- npm test
```

#### Key Rotation

1. Update secrets in Doppler dashboard
2. Revoke old service tokens if compromised
3. Create new service tokens for CI systems
4. Notify team of rotation completion

#### Team Access Management

- Add developers to appropriate projects/environments
- Use Doppler groups for role-based access
- Regular access reviews and cleanup

### 1Password

1Password provides vault-based secret management with CLI integration.

#### Setup

```bash
# Install 1Password CLI
brew install --cask 1password/tap/1password-cli

# Authenticate (opens browser)
op signin

# Install shell plugins for automatic injection
op plugin init
```

#### Vault Structure

Organize secrets in vaults by environment:
- **CiviCue-Dev** - Development secrets
- **CiviCue-Staging** - Staging secrets
- **CiviCue-Prod** - Production secrets

#### Usage Patterns

**Runtime injection with shell plugins:**
```bash
# Set up shell integration
eval $(op signin)

# Reference secrets in .env.local template
export DATABASE_URL="op://CiviCue-Dev/postgres/url"
export OPENAI_API_KEY="op://CiviCue-Dev/openai/key"

# Run with auto-injection
npm start
```

**Manual injection:**
```bash
# Run commands with 1Password injection
op run -- npm start

# Load specific secrets
op run --env-file=.env.1password -- npm test
```

**Generate .env.local from 1Password:**
```bash
# Create template file (.env.1password)
cat > .env.1password << EOF
DATABASE_URL="op://CiviCue-Dev/postgres/url"
SOCRATA_APP_ID="op://CiviCue-Dev/socrata/app-id"
OPENAI_API_KEY="op://CiviCue-Dev/openai/key"
EOF

# Generate actual .env.local
op inject -i .env.1password -o .env.local
```

#### Rotation and Sharing

1. Update credentials in 1Password vaults
2. Regenerate API keys at source (OpenAI, Socrata, etc.)
3. Update vault items with new values
4. Share vault access with team members via groups
5. Remove access for departing team members

### Railway

Railway provides environment-based variable management integrated with deployment.

#### Setup

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to CiviCue project
railway link
# Select your CiviCue project
```

#### Environment Strategy

Railway environments match our deployment stages:
- **development** - Local development overrides
- **staging** - Staging deployment
- **production** - Production deployment

#### Usage Patterns

**Pulling variables for local development:**
```bash
# Pull development environment variables
railway variables

# Generate .env.local from Railway
railway variables --json | jq -r 'to_entries[] | "\(.key)=\(.value)"' > .env.local
```

**Service-specific variables:**
```bash
# Set variables for specific services
railway variables set DATABASE_URL postgres://...

# Pull variables for specific environment
railway variables --environment staging
```

#### Preview Environment Strategy

Railway preview environments automatically inherit staging variables. Override specific variables as needed:

```bash
# Set preview-specific overrides
railway variables set --environment preview NODE_ENV=preview
```

#### CLI Linking

```bash
# Link local directory to Railway project
railway link

# Verify connection
railway status

# Run locally with Railway variables
railway run npm start
```

## Sync Strategies

### Single Source of Truth (Recommended)

Choose **one primary tool** for your team:
- **Doppler**: Best for teams wanting centralized secret management
- **1Password**: Good for teams already using 1Password for other secrets
- **Railway**: Convenient for teams deploying primarily on Railway

### Naming Conventions

Use consistent variable names across all tools:

```bash
# Database
DATABASE_URL
PGVECTOR_DIM

# APIs - Use service_purpose pattern
SOCRATA_APP_ID
SOCRATA_APP_SECRET
OPENAI_API_KEY
ANTHROPIC_API_KEY
ARCGIS_API_KEY
CKAN_API_KEY

# Runtime
NODE_ENV
PORT
REQUEST_TIMEOUT_MS
RETRY_MAX_ATTEMPTS
RETRY_BASE_DELAY_MS
```

### .env.local Generation Pattern

All tools should generate `.env.local` with the same format:

```bash
# Generated .env.local example
DATABASE_URL=postgres://dev:dev@localhost:5432/civicue
PGVECTOR_DIM=1536
SOCRATA_APP_ID=your-app-id
OPENAI_API_KEY=sk-...
NODE_ENV=development
PORT=3000
```

### Hybrid Approach (Advanced)

For complex setups, you can use different tools for different environments:
- **Local development**: 1Password or Doppler
- **CI/CD**: Doppler service tokens  
- **Production deployment**: Railway or Doppler

Ensure variable names remain consistent across all tools.

## Team Onboarding

### Prerequisites

New developers need:
1. Git repository access
2. Access to chosen secret management tool
3. Database access (local Postgres with pgvector)
4. Node.js 18+ and pnpm

### Onboarding Steps

#### For Doppler Users

```bash
# 1. Install and authenticate
curl -Ls https://cli.doppler.com/install.sh | sh
doppler login

# 2. Clone and setup project
git clone <civicue-repo>
cd civicue
doppler setup
# Select: civicue project, development environment

# 3. Verify access
doppler secrets --only-names

# 4. Test application
doppler run -- npm install
doppler run -- npm test
```

#### For 1Password Users

```bash
# 1. Install 1Password CLI
brew install --cask 1password/tap/1password-cli
op signin

# 2. Verify vault access
op vault list | grep CiviCue

# 3. Clone and setup
git clone <civicue-repo>  
cd civicue
npm install

# 4. Generate local environment
op inject -i .env.1password -o .env.local

# 5. Test application
npm test
```

#### For Railway Users

```bash
# 1. Install Railway CLI
npm install -g @railway/cli
railway login

# 2. Clone and link project
git clone <civicue-repo>
cd civicue
railway link
npm install

# 3. Pull development variables
railway variables --json | jq -r 'to_entries[] | "\(.key)=\(.value)"' > .env.local

# 4. Test application
npm test
```

### Access Granting

**Project maintainers should:**
1. Add new developers to secret management tool
2. Assign appropriate environment access
3. Share onboarding checklist
4. Verify successful setup via test run

## Rotation and Incident Response

### Standard Operating Procedure (SOP)

**Timeline for secret rotation:**
- **Immediate (0-1 hour)**: Compromised secrets in public repositories
- **Same day (4-8 hours)**: Suspected exposure or departing team members
- **Planned (1-2 weeks)**: Routine rotation or security policy updates

### Tool-Specific Rotation Steps

#### Doppler Rotation
```bash
# 1. Update secrets in Doppler dashboard
# 2. Revoke compromised service tokens
doppler configs tokens revoke <token-id>

# 3. Create new service tokens  
doppler configs tokens create --name "new-token-$(date +%Y%m%d)"

# 4. Update CI systems with new tokens
# 5. Verify all environments work
```

#### 1Password Rotation
```bash
# 1. Generate new API keys at source services
# 2. Update vault items
op item edit <item-id> password=<new-secret>

# 3. Regenerate .env.local files
op inject -i .env.1password -o .env.local

# 4. Test applications
# 5. Archive old vault versions if needed
```

#### Railway Rotation
```bash
# 1. Update variables in Railway dashboard
railway variables set OPENAI_API_KEY=<new-key>

# 2. Or bulk update via CLI
# 3. Trigger redeployment for production
railway redeploy

# 4. Update local .env.local
railway variables --json | jq -r 'to_entries[] | "\(.key)=\(.value)"' > .env.local
```

### Coordination

**For multi-tool environments:**
1. **Incident lead** coordinates across all tools
2. Update primary tool first, then sync to others  
3. **Communication**: Notify team in Slack/Discord with timeline
4. **Verification**: Each team member confirms working setup
5. **Documentation**: Update incident log with lessons learned

### Emergency Contacts

Maintain a list of:
- Admin users for each secret management tool
- API service contacts (OpenAI, Socrata, etc.)
- Infrastructure leads who can revoke access

## CI/Security Alignment

### Secret Scanning Integration

CiviCue uses [Gitleaks](https://github.com/gitleaks/gitleaks) for automated secret detection:

```bash
# Run locally before committing
pnpm secret-scan
```

**CI Integration:**
- Gitleaks runs on all pull requests
- Blocks merging if secrets are detected
- Scans commit history for leaked credentials

### .gitignore Protection

The `.gitignore` file blocks common secret files:

```gitignore
# Environment variables
.env
.env.local
.env.runtime

# Secret management tool files
.doppler
.op-session
railway.json
```

### Pre-commit Hooks

While not currently implemented, consider adding pre-commit hooks to:
- Run `gitleaks detect` before commits
- Validate `.env.example` is up-to-date
- Check for hardcoded secrets in code

Example pre-commit configuration:
```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
```

### Avoiding Plaintext Secrets

**Never commit:**
- `.env` files with real values
- API keys in source code
- Database passwords in connection strings
- Authentication tokens

**Safe practices:**
- Use environment variable injection
- Store secrets in dedicated management tools
- Use placeholder values in `.env.example`
- Regular secret scanning with Gitleaks (see __docs__/setup/secret-scan.md; run locally with pnpm secret-scan)

### Handling Secret Exposure

If secrets are accidentally committed:

1. **Immediate response** (within 1 hour):
   ```bash
   # Remove from current branch
   git rm .env
   git commit -m "Remove accidentally committed secrets"
   
   # If pushed, force push is acceptable for recent commits
   git push --force-with-lease
   ```

2. **Rotate all exposed secrets** immediately
3. **Notify team** of incident and required actions
4. **Review git history** for other potential exposures
5. **Update documentation** to prevent recurrence

## Troubleshooting

### Common Issues

#### CLI Authentication Errors

**Doppler "unauthorized" errors:**
```bash
# Re-authenticate
doppler logout
doppler login

# Verify project access
doppler projects
```

**1Password "session expired":**
```bash
# Re-authenticate
op signin

# Check session status
op account list
```

**Railway "not linked":**
```bash
# Re-link project
railway unlink
railway link
```

#### Missing Variables

**Check variable exists in source:**
```bash
# Doppler
doppler secrets --only-names | grep OPENAI_API_KEY

# 1Password
op item list --vault CiviCue-Dev | grep openai

# Railway
railway variables | grep OPENAI_API_KEY
```

#### Permission Errors

**Verify access levels:**
- **Doppler**: Check project membership in dashboard
- **1Password**: Verify vault sharing and item permissions
- **Railway**: Confirm team membership and environment access

#### Runtime Injection Failures

**Test injection separately:**
```bash
# Doppler
doppler run -- env | grep OPENAI_API_KEY

# 1Password
op run -- env | grep OPENAI_API_KEY  

# Railway (check local .env.local)
cat .env.local | grep OPENAI_API_KEY
```

### Quick Diagnostic Commands

```bash
# Verify all required variables are present
pnpm env:validate

# Check environment variable imports in code
pnpm check:env-import

# Test database connection
doppler run -- node -e "console.log(process.env.DATABASE_URL?.slice(0,20) + '...')"

# Validate TypeScript types
pnpm typecheck
```

### Official Documentation Links

- **Doppler CLI**: https://docs.doppler.com/docs/cli
- **1Password CLI**: https://developer.1password.com/docs/cli/get-started
- **Railway CLI**: https://docs.railway.app/develop/cli
- **Gitleaks**: https://github.com/gitleaks/gitleaks#configuration
- **Node.js Environment Variables**: https://nodejs.org/api/process.html#processenv

## Quick Reference

### Environment Variables by Category

**Database (Required):**
```bash
DATABASE_URL=postgres://user:pass@localhost:5432/civicue
PGVECTOR_DIM=1536
```

> PGVECTOR_DIM must match your embedding model's output dimension (e.g., 1536 for text-embedding-3-large). Mismatches break vector ops.

**Data Sources:**
```bash
SOCRATA_APP_ID=your-app-id
SOCRATA_APP_SECRET=your-secret
CKAN_BASE_URL=https://data.detroitmi.gov
CKAN_API_KEY=your-key
ARCGIS_PORTAL_URL=https://www.arcgis.com
ARCGIS_API_KEY=your-key
```

**AI/Embeddings (At least one required):**
```bash
EMBEDDING_MODEL=text-embedding-3-large
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

**Runtime:**
```bash
NODE_ENV=development
PORT=3000
REQUEST_TIMEOUT_MS=10000
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY_MS=250
```

### Common Commands

```bash
# Validation
npm run env:validate
npm run typecheck
pnpm secret-scan

# Development with Doppler
doppler run -- pnpm dev
doppler run -- pnpm test

# Development with 1Password
op run -- pnpm dev
op inject -i .env.1password -o .env.local

# Development with Railway
railway run pnpm dev
# Caution: this overwrites .env.local — back up first
railway variables > .env.local
```