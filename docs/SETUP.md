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

## Groq assistant

1. Create a Groq API key in the Groq console.
2. Use the configured `openai/gpt-oss-20b` model. It supports local tool
   calling and `low` reasoning effort; override `GROQ_MODEL` only after testing
   another currently enabled model.
3. Set `GROQ_API_KEY`, `GROQ_MODEL`, and the assistant policy variables in the
   API environment only.
4. Keep `GROQ_MAX_TOOL_CALLS=1`; use `ASSISTANT_ENABLED=false` when developing
   without Groq.
5. In Telegram, use `/ask <question>`, explicitly mention the bot, or reply to
   a bot message with a question.

No Groq credential belongs in `apps/bot`, `apps/mini-app`, a `NEXT_PUBLIC_*`
variable, or Telegram configuration. Provider timeout, rate limit, malformed
tool output, and other failures return one deterministic unavailable message
without retry.

See [`docs/ASSISTANT.md`](./ASSISTANT.md) for the complete tool catalogue,
permission matrix, identity rules, and failure behavior.

## Environment ownership

- Shared server: `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`, public
  URLs, encryption/hash/internal-service secrets, `PROVIDER_CALLS_ENABLED`.
- API: `API_PORT`, proxy/CORS/Swagger/session policy, Telegram init-data age,
  all `GROQ_*` and `ASSISTANT_*` values,
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
