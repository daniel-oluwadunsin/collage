# Deployment

## Compose deployment

```bash
docker compose -f compose.yaml -f compose.production.yaml config --quiet
docker compose -f compose.yaml -f compose.production.yaml build --no-cache
docker compose -f compose.yaml -f compose.production.yaml up -d
docker compose -f compose.yaml -f compose.production.yaml ps
```

The stack contains PostgreSQL, Redis, a one-shot migration service, API, bot,
worker, and Mini App. Application runtime images use non-root UID/GID `1001`.
PostgreSQL/Redis health checks gate the migration and application services.

## Required production properties

- stable HTTPS for API, bot webhook, and Mini App;
- managed secrets rather than committed `.env` values;
- encrypted database backups and a tested restore procedure;
- always-on worker and reachable bot webhook;
- no scale-to-zero for scheduled jobs unless wake-up semantics are guaranteed;
- one migration job per release;
- exact CORS allowlist and trusted-proxy count;
- production Swagger policy;
- centralized logs/metrics with sensitive-field scrubbing;
- static outbound egress/NAT gateway when Monnify live payout requires IP
  whitelisting.

Deploy with provider calls disabled first. Verify readiness, migrations,
Telegram delivery, signed webhook ingestion, and reconciliation before enabling
money movement.
