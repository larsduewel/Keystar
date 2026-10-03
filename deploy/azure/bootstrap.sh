#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq docker.io docker-compose-v2 caddy openssl curl jq
systemctl enable --now docker caddy
umask 077
mkdir -p /opt/keystar/instances /etc/caddy/sites /opt/keystar/backups
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
if [[ ! -f /opt/keystar/host.env ]]; then
  printf 'POSTGRES_PASSWORD=%s\nPUBLIC_IP=%s\nPRODUCTION_DOMAIN=%s\n' "$(openssl rand -hex 32)" "${1:?public IP}" "${2:?production domain}" >/opt/keystar/host.env
fi
source /opt/keystar/host.env
docker network inspect keystar-database >/dev/null 2>&1 || docker network create keystar-database >/dev/null
if ! docker inspect keystar-postgres >/dev/null 2>&1; then
  docker run -d --name keystar-postgres --restart unless-stopped --network keystar-database \
    --memory 256m --cpus 0.4 --log-opt max-size=5m --log-opt max-file=2 \
    -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" -v keystar-pgdata:/var/lib/postgresql/data \
    postgres:17-alpine -c shared_buffers=64MB -c max_connections=60 >/dev/null
fi
for i in $(seq 1 60); do docker exec keystar-postgres pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
cat >/etc/caddy/Caddyfile <<'CADDY'
{
  admin localhost:2019
}
import /etc/caddy/sites/*.caddy
CADDY
cat >/usr/local/sbin/keystar-backup <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
umask 077
source /opt/keystar/host.env
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" keystar-postgres pg_dumpall -U postgres | gzip >/opt/keystar/backups/$(date +%F).sql.gz
find /opt/keystar/backups -name '*.sql.gz' -mtime +7 -delete
BACKUP
chmod 700 /usr/local/sbin/keystar-backup
echo '20 3 * * * root /usr/local/sbin/keystar-backup' >/etc/cron.d/keystar-backup
echo '40 3 * * * root docker image prune -af --filter until=48h >/dev/null 2>&1' >/etc/cron.d/keystar-images
systemctl restart caddy
echo 'Host bootstrap complete; PostgreSQL is private and no production data was imported.'
