# Azure hosting and automatic deployments

The fork larsduewel/Keystar uses one Azure Standard_B1ms Ubuntu host in Germany West Central, resource group rg-keystar-lowcost. This budget setup runs production and **one active staging branch**. It targets EUR 30/month, not an unlimited preview fleet.

## Automatic checks and deployments

Every PR runs lint, types, migration consistency, unit/database tests, a production build, container build and CodeQL. CI also runs on every branch push and merge queues. Codex code review uses the owner account through the GitHub integration, separately from Actions. Connect larsduewel/Keystar in Codex settings and enable automatic code review for all pull requests. It follows AGENTS.md and posts reviews on GitHub; no OpenAI API key or Claude token is stored in CI. Account review limits apply. See [Codex GitHub review setup](https://learn.chatgpt.com/docs/third-party/github). Code review is advisory; the required quality checks remain unchanged.

Azure deployment runs from protected main after a successful CI push. It publishes an immutable commit-tagged image, uses GitHub OIDC to access only the dedicated VM, applies migrations and checks /api/health before activating HTTPS. Main deploys production; other branches deploy staging. External-fork PRs receive no cloud credentials. Manual activation accepts a branch and reruns quality checks/build before deployment.

Only the main workflow can use either deployment environment. Preview branch code is built without Azure credentials; the host deployment script validates branch names and SHA values. GitHub environments use federated identity, not stored Azure passwords. The VM role only reads the VM and invokes Run Command, which is privileged access to this dedicated server.

## URLs and staging isolation

Production: https://keystar-larsduewel.germanywestcentral.cloudapp.azure.com

Each staging branch has a stable URL b-<first-12-characters-of-SHA256(branch)>.<public-ip>.sslip.io. The most recently deployed staging branch is active. Activating another stops the previous preview containers and returns HTTP 503 at its old URL; its separate database is preserved. Re-activate it through the Azure deployment workflow's branch input. Preview URLs use the free sslip.io DNS service.

Each instance has separate database credentials and APP_SECRET. Previews contain seeded demo data and never receive production EVE credentials. PostgreSQL is private, and database connect permissions are restricted to the owning role. All instances share a budget VM/PostgreSQL process; this is not hardened isolation for hostile tenants. Do not give untrusted contributors branch push rights.

## Costs and resource limits

Retail estimates checked 2026-10-04: B1ms EUR 0.0211/hour (about EUR 15.40 at 730 hours), 32 GB E4 Standard SSD about EUR 2.11/month, plus public IPv4, operations, traffic and applicable taxes. Limits: one production and one preview, capped container memory/CPU, no managed PostgreSQL or paid container registry. The 2 GB host uses swap and is for light use; it is not highly available.

A EUR 25 pre-tax monthly Azure budget notifies resource-group Owners at 80% actual spend and 100% forecast. Budget notifications are **not a hard spending cap**. Traffic, disk operations and taxes can change the bill; check Cost Management before increasing usage.

## Operations

Host bootstrap and deploy scripts: deploy/azure/bootstrap.sh and deploy/azure/deploy.sh. SSH and database ingress are closed; only 80/443 are open. Use Azure VM Run Command for maintenance. Deployment uses root-only files under /opt/keystar; never commit runtime.env, sso.env, host.env or key files. The production APP_SECRET must remain stable after characters are linked.

Daily PostgreSQL dumps retain seven days under /opt/keystar/backups. They share the VM disk and do not protect against host/disk loss; use an off-host backup before relying on production for irreplaceable data. Image cleanup removes unused images older than 48 hours. No preview databases are automatically destroyed.

Production EVE sign-in requires a registered EVE application with callback https://keystar-larsduewel.germanywestcentral.cloudapp.azure.com/auth/callback. Store its ID and secret only in the root-only production sso.env file, and set ADMIN_CHARACTER_IDS before enabling sign-in. Production starts without demo mode; preview uses demo mode with synthetic data only. SOURCE_URL links to the exact source commit to satisfy the source-offer requirement for modified AGPL network software.