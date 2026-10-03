#!/usr/bin/env bash
set -euo pipefail
umask 077
exec 9>/opt/keystar/deploy.lock
flock -w 900 9
branch=${1:?branch required}; sha=${2:?commit required}
[[ $sha =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ $branch =~ ^[a-zA-Z0-9_./-]{1,200}$ ]] || exit 2
image="ghcr.io/larsduewel/keystar-azure:sha-$sha"
source /opt/keystar/host.env
if [[ $branch == main ]]; then
  id=production; port=3000; domain=$PRODUCTION_DOMAIN; demo=false
else
  id="b-$(printf %s "$branch" | sha256sum | cut -c1-12)"
  port=3001; domain="$id.$PUBLIC_IP.sslip.io"; demo=true
fi
dir="/opt/keystar/instances/$id"
mkdir -p "$dir"
db="${id//-/_}"
if [[ ! -e $dir/runtime.env ]]; then
  password=$(openssl rand -hex 24)
  secret=$(openssl rand -hex 48)
  docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" keystar-postgres psql -U postgres -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE $db LOGIN PASSWORD '$password';
CREATE DATABASE $db OWNER $db;
REVOKE CONNECT ON DATABASE $db FROM PUBLIC;
GRANT CONNECT ON DATABASE $db TO $db;
SQL
  cat >"$dir/runtime.env" <<ENV
DATABASE_URL=postgres://$db:$password@keystar-postgres:5432/$db
APP_SECRET=$secret
APP_URL=https://$domain
KEYSTAR_DEMO_MODE=$demo
ESI_CONTACT=larsduewel/Keystar
SOURCE_URL=https://github.com/larsduewel/Keystar/tree/$sha
WORKER_CONCURRENCY=1
ENV
fi
# Production SSO credentials belong in this root-only file, never in images or CI logs.
touch "$dir/sso.env"
sed -i "s|^SOURCE_URL=.*|SOURCE_URL=https://github.com/larsduewel/Keystar/tree/$sha|" "$dir/runtime.env"
cat >"$dir/compose.yaml" <<YAML
name: keystar-$id
services:
  web:
    image: $image
    command: [web]
    env_file: [runtime.env, sso.env]
    ports: ["127.0.0.1:$port:3000"]
    restart: unless-stopped
    mem_limit: 512m
    cpus: 0.6
    networks: [database]
    logging:
      driver: json-file
      options: {max-size: "5m", max-file: "2"}
  worker:
    image: $image
    command: [worker]
    env_file: [runtime.env, sso.env]
    restart: unless-stopped
    mem_limit: 192m
    cpus: 0.25
    networks: [database]
    logging:
      driver: json-file
      options: {max-size: "5m", max-file: "2"}
networks:
  database:
    external: true
    name: keystar-database
YAML
# Each branch can only connect to its own DB. Production and preview containers
# share this budget host; this is not a hardened multi-tenant isolation boundary.
docker compose -f "$dir/compose.yaml" pull
if [[ $demo == true && -f /opt/keystar/active-staging ]]; then
  old=$(cat /opt/keystar/active-staging)
  if [[ $old != "$id" ]]; then
    docker compose -f "/opt/keystar/instances/$old/compose.yaml" down
    olddomain="$old.$PUBLIC_IP.sslip.io"
    printf '%s {\n respond "This staging branch is paused. Deploy it again to activate it." 503\n}\n' "$olddomain" >"/etc/caddy/sites/$old.caddy"
  fi
fi
if [[ $demo == false ]]; then /usr/local/sbin/keystar-backup; fi
docker compose -f "$dir/compose.yaml" run --rm --no-deps web migrate
if [[ $demo == true && ! -f $dir/seeded ]]; then
  docker compose -f "$dir/compose.yaml" run --rm --no-deps web demo-seed
  touch "$dir/seeded"
fi
docker compose -f "$dir/compose.yaml" up -d
ready=false
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null; then ready=true; break; fi
  sleep 2
done
[[ $ready == true ]] || { echo "Deployment failed health check"; exit 1; }
printf '%s {\n encode zstd gzip\n reverse_proxy 127.0.0.1:%s\n}\n' "$domain" "$port" >"/etc/caddy/sites/$id.caddy"
chmod 755 /etc/caddy/sites
chmod 644 /etc/caddy/sites/*.caddy
caddy validate --config /etc/caddy/Caddyfile >/dev/null
systemctl reload caddy
if [[ $demo == true ]]; then printf %s "$id" >/opt/keystar/active-staging; fi
printf '%s\n' "$branch" >"$dir/branch"
printf '%s\n' "$sha" >"$dir/commit"
echo "DEPLOYMENT_URL=https://$domain"
