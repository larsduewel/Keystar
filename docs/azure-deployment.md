# Azure deployment plan

Repository: larsduewel/Keystar. Each non-main branch gets its own staging URL; main deploys to production only after CI succeeds.

## Quality gate

CI runs on every branch push, every pull request, and merge-queue events. It checks lint, TypeScript, migration consistency, unit/integration tests against disposable PostgreSQL, production builds and container builds. CodeQL checks pull requests targeting any branch.

## Hosting requirements

- Separate production and staging Azure resource groups and deployment identities.
- Azure Container Apps for the web app and background worker, using the existing production container image.
- PostgreSQL with persistent storage and backups. Production has its own database; each staging branch has an isolated database and credentials.
- Immutable images identified by commit SHA; deploy only a successful CI push from this repository. Pull requests from external forks run checks without deployment credentials.
- GitHub-to-Azure OIDC authentication; no stored Azure client secrets. Production identity restricted to the production GitHub environment and main. Staging identity has no access to production resources.
- HTTPS URLs, /api/health readiness checks, and deployment summaries containing the branch URL.
- Per-branch staging web apps can scale to zero. Workers and PostgreSQL incur ongoing costs and must be sized against the agreed budget.
- Branch identifiers must include a stable hash so slash-normalized branch names cannot collide.
- Demo-only staging databases: do not copy production ESI tokens or personal data into branch deployments.
- Production EVE SSO requires its deployed URL registered as the application callback. Keep a stable APP_SECRET; changing it invalidates encrypted stored tokens.
- Budget alerts notify about spending; they do not impose a hard spending cap.

## Pending provisioning choices

Azure CLI is authenticated to Azure-Abonnement. Confirm subscription/resource group and monthly budget before creating paid resources. Select region, database sizing, branch retention and staging-worker behavior from that budget. Provision and validate infrastructure, configure GitHub environments and identity trusts, deploy staging, then validate production and enable deployment automation.