# Local Setup

## Prerequisites

- Node.js `24.18.0`
- pnpm `11.14.0` through Corepack
- Docker with Compose
- PostgreSQL 17 and Redis 8 (Compose supplies both)

## Install and initialize

```bash
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
```

Use host URLs when running apps outside Docker:

```dotenv
DATABASE_URL=postgresql://collage:collage@127.0.0.1:5432/collage
REDIS_URL=redis://127.0.0.1:6379
NEXT_PUBLIC_API_URL=http://127.0.0.1:4000/v1
```

Start all workspace apps with `pnpm dev`, or use `docker compose up --build`.

## Environment ownership

- Shared server: `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`, public
  URLs, encryption/hash/internal-service secrets, `PROVIDER_CALLS_ENABLED`.
- API: `API_PORT`, proxy/CORS/Swagger/session policy, Telegram init-data age,
  Monnify credentials and webhook policy, OTP/SMSGate configuration, card setup
  policy.
- Bot: `BOT_PORT`, Telegram bot/webhook/Mini App values, internal API URL and
  timeout, notification concurrency and rate-limit retry cap.
- Worker: `WORKER_HEALTH_PORT`, all worker concurrency/poll/stale-operation
  values, database/Redis, encryption, Telegram token, and Monnify server values.
- Mini App: only `NEXT_PUBLIC_API_URL`, bot username, Mini App short name, and
  public app environment. Never place a provider, bot, database, or encryption
  secret in a `NEXT_PUBLIC_*` variable.

The root `.env.example` documents every supported variable. App-scoped examples
are provided beside each application.

## Safe reset

For local development only, after confirming no data is needed:

```bash
docker compose down -v
docker compose up --build
```

Never use this against a shared or production database.
