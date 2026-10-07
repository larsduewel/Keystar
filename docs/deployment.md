# Deploying Keystar on a Ubuntu VPS

This guide sets up Keystar on a fresh **Ubuntu 24.04 LTS or 26.04 LTS** server
with Docker Compose. You end up with four containers:

| Service  | What it does                                                         | Exposed               |
| -------- | -------------------------------------------------------------------- | --------------------- |
| `caddy`  | Reverse proxy, automatic Let's Encrypt HTTPS                          | ports 80 and 443      |
| `app`    | Keystar web app (Next.js); applies database migrations on start      | internal only         |
| `worker` | Background ESI sync (mining ledgers, prices, roster, …)              | internal only         |
| `db`     | PostgreSQL 17                                                        | internal only         |

Expect about 20 minutes. You should be comfortable with SSH and a terminal.

## 1. What you need

- A VPS with **Ubuntu 24.04 or 26.04**, 2 vCPU, **2 GB RAM minimum (4 GB recommended** — building the image is the
  heaviest part), 20 GB disk.
- A **domain or subdomain** you control, e.g. `keystar.example.com`.
- An EVE Online account to register a developer application.

## 2. Prepare the server

Log in as a sudo-capable user (not root) and update the system:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git curl ca-certificates openssl
```

Firewall — allow SSH and web traffic only:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp   # HTTP/3
sudo ufw enable
```

> Docker-published ports bypass ufw rules. Keystar only publishes Caddy's ports 80/443; Postgres and the app are not
> published, so nothing else is reachable from the internet. Keep it that way if you edit `docker-compose.yml`.

## 3. Install Docker Engine and Compose

These are Docker's official instructions for Ubuntu (both 24.04 "Noble" and 26.04 "Resolute" are supported):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo (log out and back in afterwards)
sudo usermod -aG docker "$USER"
```

Check: `docker compose version`.

## 4. Point your domain at the server

Create an **A record** (and **AAAA** if the server has IPv6) for `keystar.example.com` pointing at the server's public
IP. Caddy can only obtain a certificate once DNS resolves to the server — check with
`dig +short keystar.example.com`.

## 5. Register an EVE application

1. Open <https://developers.eveonline.com/applications> and create a new application.
2. Connection type: **Authentication & API Access**.
3. Callback URL: `https://keystar.example.com/auth/callback` (your domain, exactly this path).
4. Select these scopes:

   ```
   esi-alliances.read_contacts.v1
   esi-characters.read_corporation_roles.v1
   esi-clones.read_implants.v1
   esi-corporations.read_contacts.v1
   esi-corporations.read_corporation_membership.v1
   esi-corporations.read_divisions.v1
   esi-corporations.read_structures.v1
   esi-fleets.read_fleet.v1
   esi-industry.read_character_jobs.v1
   esi-industry.read_character_mining.v1
   esi-industry.read_corporation_mining.v1
   esi-mail.read_mail.v1
   esi-markets.read_character_orders.v1
   esi-skills.read_skillqueue.v1
   esi-skills.read_skills.v1
   esi-universe.read_structures.v1
   esi-wallet.read_character_wallet.v1
   esi-wallet.read_corporation_wallets.v1
   ```

   Registering asks members for no scope at all. Corporation scopes are requested only when a director links a
   character with "corporation access", and every character scope only when a pilot switches it on for a character:
   the mining ledger on the Mining access page, wallet import in the mining P&L, mail on the EVE Mail page, fleet
   access on the Live fleet page, skill sharing on the Skills access page, industry access on the Industry access
   page or market access on the Market access page. (The login page also shows this exact list while SSO is not
   configured yet.)
5. Save and keep the **Client ID** and **Secret Key** for the next step.

When future modules (assets) are added, add their scopes to the application as well.

> **Upgrading to the release with market orders (see the CHANGELOG):** add `esi-markets.read_character_orders.v1`
> to the EVE application (and `esi-universe.read_structures.v1`, if it isn't there yet from industry jobs). Without
> it, "Enable market access" on the Market access page fails at the EVE login with `invalid_scope`. Nobody is asked
> for the scope unless they enable market access themselves.

> **Upgrading to the release with industry jobs (see the CHANGELOG):** add `esi-industry.read_character_jobs.v1` and
> `esi-universe.read_structures.v1` to the EVE application. Without them, "Enable industry access" on the Industry
> access page fails at the EVE login with `invalid_scope`. Nobody is asked for the scopes unless they enable industry
> access themselves; the structures scope names the player structures jobs run in (only those the character may dock at).

> **Upgrading to the release with skill queues (see the CHANGELOG):** add `esi-skills.read_skillqueue.v1` and
> `esi-skills.read_skills.v1` to the EVE application. Without them, "Share skills" on the Skills access page fails at
> the EVE login with `invalid_scope`. Nobody is asked for the scopes unless they share their skills themselves.

> **Upgrading to the release with the remap optimiser (see the CHANGELOG):** add `esi-clones.read_implants.v1` to the
> EVE application. "Share skills" now requests it along with the skills scopes, so without it that EVE login fails
> with `invalid_scope`. Characters that already share keep sharing until they re-authorise.

> **Upgrading to the release with EVE Mail (see the CHANGELOG):** add `esi-mail.read_mail.v1` to the EVE application.
> Without it, "Enable mail" on the EVE Mail page fails at the EVE login with `invalid_scope`. Nobody is asked for the
> scope unless they enable mail themselves.

> **Upgrading to the release with the mining P&L (see the CHANGELOG):** add `esi-wallet.read_character_wallet.v1` to the EVE application. Without it,
> "Enable wallet import" in the mining P&L fails at the EVE login with `invalid_scope`. Nobody is asked for the scope
> unless they enable wallet import themselves.

> **Upgrading to the release with corporation wallets (see the CHANGELOG):** add `esi-wallet.read_corporation_wallets.v1`
> and `esi-corporations.read_divisions.v1` to the EVE application, then have a member with the in-game Accountant or
> Junior Accountant role (a Director also brings the division names) re-link their character with corporation access.
> ESI only keeps about 30 days of corporation wallet history, so the archive starts from there.

## 6. Get Keystar and configure it

```bash
sudo mkdir -p /opt/keystar && sudo chown "$USER": /opt/keystar
git clone https://github.com/theragus/keystar.git /opt/keystar
cd /opt/keystar
cp .env.example .env
chmod 600 .env
```

Generate the two secrets:

```bash
echo "APP_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```

Edit `.env` (`nano .env`) and set at least:

| Variable                          | Value                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| `KEYSTAR_DOMAIN`                  | `keystar.example.com`                                                   |
| `APP_URL`                         | `https://keystar.example.com`                                           |
| `APP_SECRET`                      | generated above — **back it up; never change it** once characters are linked |
| `POSTGRES_PASSWORD`               | generated above                                                        |
| `EVE_CLIENT_ID` / `EVE_CLIENT_SECRET` | from step 5                                                        |
| `ESI_CONTACT`                     | your email or EVE character name (sent to CCP in the User-Agent)       |
| `ADMIN_CHARACTER_IDS`             | optional: your character ID(s). If empty, the **first** pilot to sign in becomes admin |
| `KEYSTAR_VERSION`                 | release to run, e.g. `0.1.1`, or `latest` (default) — see [releases](https://github.com/theragus/keystar/releases). `main` follows unreleased, possibly unstable changes |
| `ANTHROPIC_API_KEY`               | optional: a [Claude API key](https://console.anthropic.com) so Claude writes the killboard's weekly situation report (≈ one call a day, one to two US cents each with the default model) and threat intel briefings. Without it both are written from templates |
| `KILLBOARD_REPORT_MODEL`          | optional: Claude model for the report, default `claude-sonnet-5-5` (`claude-haiku-4-5-20251001` is about half the cost) |
| `INTEL_MODEL`                     | optional: Claude model for threat intel briefings, dossiers and d-scan reads, default `claude-sonnet-5-5`. Uses the same `ANTHROPIC_API_KEY`; a briefing of a 30-pilot local costs a few US cents. Calls are capped at 20 per user and 120 per instance per hour, and only roles with **Use Claude for intel** can trigger them |

## 7. Start it

```bash
docker compose pull          # the released image from ghcr.io (KEYSTAR_VERSION in .env)
docker compose up -d
docker compose ps            # all services should become "healthy"/"running"
docker compose logs -f app   # Ctrl+C to stop following
```

Then open `https://keystar.example.com`. To build from the checkout instead of using a release, run
`docker compose up -d --build` (the first build takes a few minutes and up to 2 GB of RAM).

## 8. First sign-in and setup walkthrough

1. Click **Log in with EVE Online** and sign in with your main. If `ADMIN_CHARACTER_IDS` is empty, sign in right away —
   the first account becomes admin.
2. Keystar walks you through four short steps:
   1. **Home corporation** — pre-selected from your character; confirm or enter another corporation ID.
   2. **Who gets in** — auto-approve corp (and optionally alliance) members, and pick the ore price source.
   3. **Corporation data** — link a character that has the in-game **Accountant** (or Director) role with corporation
      access, so Keystar can read refinery observers, the corporation wallets and the roster. Skippable.
   4. **Invite** — copy the `/join` link for your members.
3. Link your alts under **My Characters → Link a character**, and switch on their mining ledger under **Mining →
   Access**. Alts in other corporations work too: once their mining ledger is on, their personal mining ledgers sync like any other character's and appear in the mining P&L and in the **My characters** view of
   the mining overview, ledger and export. The corporation view only counts characters in the home corporation.

The worker picks up new tokens within a minute. ESI keeps 30 days of mining history; Keystar keeps everything from
the moment it starts syncing.

The **killboard** needs no extra setup: the worker imports the home corporation's last 90 days of kills and losses
from zKillboard (public data, no ESI scopes) and then checks hourly. The first weekly situation report is written
once a full week has been imported, shortly after 02:00 EVE time. The **gate check** needs no setup either: the
worker's live feed stores every kill near a stargate (a few thousand rows a day, kept 60 days at gates and 7 days
elsewhere, a few hundred MB at most), so camp estimates get better over the first weeks. The server needs outbound HTTPS to
`esi.evetech.net`, `login.eveonline.com`, `zkillboard.com` and, with `ANTHROPIC_API_KEY`, `api.anthropic.com`.

## Operating Keystar

### Updating

Releases are listed on the [releases page](https://github.com/theragus/keystar/releases) with their changes
(also in `CHANGELOG.md`). With `KEYSTAR_VERSION=latest` every pull takes the newest release; pin a version such as
`0.1.1` to update deliberately.

```bash
cd /opt/keystar
git pull                  # compose file, Caddyfile and docs of the new version
docker compose pull       # no build on the server
docker compose up -d
```

Database migrations run automatically when the `app` container starts. Building from source instead:
`git pull && docker compose up -d --build`. The running version is shown in the sidebar and at `/api/health`.

### Behind an existing reverse proxy

If the server already runs Caddy, nginx or Traefik on ports 80/443, don't start Keystar's bundled Caddy. Create
`docker-compose.override.yml` next to `docker-compose.yml` (Compose picks it up automatically and `git pull` leaves
it alone):

```yaml
services:
  caddy:
    profiles: ["disabled"]          # never started
  app:
    ports: ["127.0.0.1:3000:3000"]  # reachable from the host only
```

Point your proxy at it, for example in the host's Caddyfile:

```caddyfile
keystar.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`KEYSTAR_DOMAIN` is then unused; `APP_URL` must still be the public `https://` address.

### Backups

Everything lives in Postgres. A nightly dump with 14 days of retention:

```bash
sudo mkdir -p /var/backups/keystar
sudo tee /etc/cron.daily/keystar-backup >/dev/null <<'EOF'
#!/bin/sh
cd /opt/keystar || exit 1
docker compose exec -T db pg_dump -U keystar -Fc keystar > /var/backups/keystar/keystar-$(date +%F).dump
find /var/backups/keystar -name 'keystar-*.dump' -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/keystar-backup
```

Also keep a copy of `.env` (above all `APP_SECRET`) somewhere safe — without it, stored ESI tokens cannot be decrypted
and every member has to re-authorise.

Restore into a fresh install:

```bash
docker compose up -d db
docker compose exec -T db pg_restore -U keystar -d keystar --clean --if-exists < keystar-YYYY-MM-DD.dump
docker compose up -d
```

### Useful commands

```bash
docker compose logs -f worker         # watch ESI syncs
docker compose restart worker         # restart syncing
docker compose exec db psql -U keystar keystar   # database shell
```

Sync health is also visible in the app under **Administration → Sync Status**.

### Trying the demo data

To explore Keystar without real data, use a **separate, non-public** instance:

```bash
# in .env: KEYSTAR_DEMO_MODE=true
docker compose up -d --build
docker compose exec app keystar demo-seed
```

The login page then offers one-click sign-in for every role. Never enable demo mode on your real instance — it allows
signing in without EVE SSO. `demo-seed` refuses to run if real users exist.

## Troubleshooting

Start with **Administration → System Info** (admins): its health checks catch the most common problems below, and
**Report an issue** walks you through a bug report with a support package that contains no pilot or corporation
data. If the web app doesn't start, create the package from the command line:

```bash
docker compose run --rm --no-deps -T worker node dist/support.mjs > keystar-support.json
```

The support package contains no pilot or corporation data. Logs do: `docker compose logs` output carries character
and corporation IDs and can name pilots, corporations, systems and your server. Replace those before posting logs in
a GitHub issue, since issues are public.

| Symptom                                               | Fix                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| EVE login shows "Invalid callback URL"                | The callback in the EVE application must match `APP_URL` + `/auth/callback` exactly (https, no trailing slash). |
| Browser shows a certificate error                     | DNS isn't pointing at the server yet, or ports 80/443 are blocked. `docker compose logs caddy`.   |
| "Sign-in attempt expired"                             | The SSO round-trip took longer than 10 minutes, or cookies are blocked. Try again.                |
| Sync Status says "No heartbeat"                       | `docker compose ps worker` / `docker compose logs worker`.                                        |
| Observer job: "No linked character with Accountant…"  | Link a character with corporation access that holds the Accountant or Director role in game.      |
| A character shows "Token revoked"                     | The pilot revoked access or changed their password — they click **Re-authorise** on My Characters. |
| App container restarts with "Invalid Keystar configuration" | A required `.env` value is missing or malformed; the log lists which.                       |
| Killboard sync: "zKillboard responded 403"           | zKillboard blocks requests without a proper User-Agent or from IPs that send too many requests. Set `ESI_CONTACT` (it is part of the User-Agent) and make sure nothing else on the server hammers zKillboard. |
| Situation report says "Claude failed: …"             | Check `ANTHROPIC_API_KEY` and `KILLBOARD_REPORT_MODEL`; the template report is used meanwhile. Directors can **Rewrite report** on the killboard once fixed. |
| Threat intel scores stay "queued…"                   | The worker reads zKillboard (about one request a second); check that the worker runs and **Sync status** shows `intel.scan-worker` without errors. A `403` means zKillboard blocked the User-Agent or IP: set `ESI_CONTACT`. |
| Finances: "No wallet data yet"                      | Link a character with corporation access that holds the Accountant or Junior Accountant role in game (Director for division names). The wallet job runs hourly. |
| Threat intel shows no blues or reds                  | Standings need a member who linked a character **with corporation access** after the contact scopes were added (`esi-corporations.read_contacts.v1`, `esi-alliances.read_contacts.v1`). |
