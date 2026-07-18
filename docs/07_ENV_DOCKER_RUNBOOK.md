# Environment, Docker, Setup, and Deployment Runbook

## 1. Prerequisites

- Git.
- Docker Engine/Desktop with Compose.
- Active-LTS Node.js for non-Docker development.
- Corepack and pnpm.
- Telegram bot created through BotFather.
- Telegram Mini App short name and HTTPS URL.
- Monnify sandbox account and credentials.
- Public HTTPS tunnel/domain for Telegram and Monnify webhooks during development.

## 2. Environment layout

Use app-specific `.env` files and root Compose configuration. Never commit real secrets.

### 2.1 Shared server values

```dotenv
NODE_ENV=development
LOG_LEVEL=debug

DATABASE_URL=postgresql://collage:collage@postgres:5432/collage
REDIS_URL=redis://redis:6379

APP_ENCRYPTION_KEY_ID=
APP_ENCRYPTION_KEY_BASE64=
APP_HASH_PEPPER=
INTERNAL_SERVICE_TOKEN=
LAUNCH_TOKEN_HASH_SECRET=
PROVIDER_CALLS_ENABLED=false

PUBLIC_APP_URL=https://example.ng
API_PUBLIC_URL=https://api.example.ng
MINI_APP_PUBLIC_URL=https://app.example.ng
```

`APP_ENCRYPTION_KEY_BASE64` must decode to exactly 32 bytes.
`APP_HASH_PEPPER`, `INTERNAL_SERVICE_TOKEN`, and
`LAUNCH_TOKEN_HASH_SECRET` must each be independently generated with at least
32 bytes of entropy. `PROVIDER_CALLS_ENABLED` remains `false` until provider
enablement is approved.

### 2.2 API

```dotenv
API_PORT=4000
API_TRUST_PROXY=1
CORS_ALLOWED_ORIGINS=https://app.example.ng

TELEGRAM_BOT_TOKEN=
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=3600

MONNIFY_ENV=sandbox
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER=

MONNIFY_CARD_TOKENIZATION_ENABLED=false
MONNIFY_DIRECT_DEBIT_ENABLED=true
MONNIFY_DISBURSEMENT_ENABLED=true
MONNIFY_IDENTITY_VERIFICATION_MODE=mock
MONNIFY_DISBURSEMENT_MFA_MODE=manual
MONNIFY_WEBHOOK_REQUIRE_SIGNATURE=false
MONNIFY_WEBHOOK_ALLOWED_IPS=

CARD_SETUP_POLICY=commitment_deposit
CARD_SETUP_AMOUNT_MINOR=10000

OTP_PROVIDER=smsgate
OTP_TTL_SECONDS=600
SMSGATE_API_BASE_URL=https://api.sms-gate.app/3rdparty/v1
SMSGATE_DEPLOYMENT_MODE=cloud
SMSGATE_AUTH_MODE=jwt
SMSGATE_USERNAME=
SMSGATE_PASSWORD=
SMSGATE_DEVICE_ID=
SMSGATE_SIM_NUMBER=1
SMSGATE_PRIORITY=100
SMSGATE_REQUEST_TIMEOUT_MS=10000
SMSGATE_TOKEN_TTL_SECONDS=3600

SWAGGER_ENABLED=true
SWAGGER_PATH=/docs
```

Production rules:

- require webhook signature;
- exact CORS origins;
- private HTTPS SMSGate server for production OTP data;
- no fixed OTP or logged SMS payload;
- protect/disable Swagger if desired;
- use production Monnify URL;
- load secrets from a secret manager.

SMSGate deployment notes:

- Android Public Cloud mode uses
  `https://api.sms-gate.app/3rdparty/v1` with JWT authentication. Official
  SMSGate guidance describes the public cloud as appropriate only for
  non-sensitive data, so Collage rejects that host when
  `NODE_ENV=production`. Set `SMSGATE_DEPLOYMENT_MODE=cloud`.
- A private server uses the full
  `https://sms.example.ng/api/3rdparty/v1` prefix and JWT authentication. This
  is the production-recommended mode; set
  `SMSGATE_DEPLOYMENT_MODE=private`.
- Android Local Server mode is useful for development on the same network. Set
  `SMSGATE_API_BASE_URL=http://<phone-ip>:8080`,
  `SMSGATE_DEPLOYMENT_MODE=local`, and `SMSGATE_AUTH_MODE=basic`. Collage then
  uses the documented `/message` endpoint. A Docker container must be able to
  route to the phone; `localhost` inside the container is not the Android
  device.
- Copy the generated username/password from the Android SMSGate app into a
  local secret store. Never commit them. Optionally pin `SMSGATE_DEVICE_ID` and
  `SMSGATE_SIM_NUMBER` when the account has multiple devices or SIMs.
- SMSGate HTTP `202` means queued, not delivered. Collage never treats it as
  proof of phone ownership; only the user-entered OTP verifies the phone.
- A send timeout or `5xx` has an unknown outcome and is not retried
  automatically. The challenge remains usable if the SMS later arrives; the
  user may also request a new challenge/code.

### 2.3 Bot

```dotenv
BOT_PORT=4001
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MINI_APP_SHORT_NAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_PUBLIC_URL=https://bot.example.ng/telegram/webhook

INTERNAL_API_URL=http://api:4000
INTERNAL_SERVICE_TOKEN=
REDIS_URL=redis://redis:6379
```

### 2.4 Worker

```dotenv
WORKER_CONCURRENCY_PAYMENTS=5
WORKER_CONCURRENCY_PAYOUTS=2
WORKER_CONCURRENCY_TELEGRAM=10

DATABASE_URL=postgresql://collage:collage@postgres:5432/collage
REDIS_URL=redis://redis:6379

TELEGRAM_BOT_TOKEN=

MONNIFY_ENV=sandbox
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER=
MONNIFY_CARD_TOKENIZATION_ENABLED=false
MONNIFY_DIRECT_DEBIT_ENABLED=true
MONNIFY_DISBURSEMENT_ENABLED=true
MONNIFY_DISBURSEMENT_MFA_MODE=manual

APP_ENCRYPTION_KEY_BASE64=
APP_HASH_PEPPER=
```

### 2.5 Mini App

Only public values:

```dotenv
NEXT_PUBLIC_API_URL=https://api.example.ng
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
NEXT_PUBLIC_TELEGRAM_MINI_APP_SHORT_NAME=
NEXT_PUBLIC_APP_ENV=development
```

No Monnify secret, bot token, encryption key, internal service token, or database URL may be present.

### 2.6 Optional observability

```dotenv
SENTRY_DSN=
SENTRY_ENVIRONMENT=
OTEL_EXPORTER_OTLP_ENDPOINT=
```

Sensitive scrubbing is mandatory before enabling.

## 3. Expected repository scripts

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "test:integration": "turbo test:integration",
    "test:e2e": "turbo test:e2e",
    "format": "prettier --write .",
    "db:generate": "pnpm --filter @collage/database prisma:generate",
    "db:migrate": "pnpm --filter @collage/database prisma:migrate",
    "db:seed": "pnpm --filter @collage/database prisma:seed"
  }
}
```

## 4. Compose services

`compose.yaml` must define:

- `postgres`;
- `redis`;
- `migrate`;
- `api`;
- `bot`;
- `worker`;
- `mini-app`.

Required behavior:

- Postgres healthcheck using `pg_isready`.
- Redis healthcheck using `redis-cli ping`.
- One-shot migration service runs `prisma migrate deploy`.
- API, bot, and worker wait for successful migration and healthy dependencies.
- Each app has a healthcheck.
- Named volumes for development data.
- App containers run as non-root.
- Graceful stop period.
- Secrets injected at runtime.
- Production Compose does not bind-mount source.

Start:

```bash
cp .env.example .env
docker compose up --build
```

Inspect:

```bash
docker compose ps
docker compose logs -f api bot worker
```

Development-only destructive reset:

```bash
docker compose down -v
docker compose up --build
```

Never run destructive reset automatically.

## 5. Dockerfiles

Use multi-stage builds:

1. base/corepack;
2. Turborepo prune for target;
3. frozen dependency install;
4. target build;
5. minimal runtime image;
6. non-root user;
7. only required workspace output and Prisma engine.

The Mini App should use Next.js standalone production output.

## 6. Telegram setup

1. Create bot through BotFather.
2. Set bot username.
3. Configure Mini App/Main App or direct-link short name.
4. Set the public HTTPS domain.
5. Configure commands:
   - `/collage`;
   - `/status`;
   - `/rules`;
   - `/help`.
6. Add bot to test group.
7. Promote it with permission to pin messages.
8. Set webhook to bot service URL and supply Telegram secret token.
9. Subscribe to required update types, including membership events.

Group buttons use direct links similar to:

```text
https://t.me/<bot_username>/<short_name>?startapp=<opaque-token>&mode=compact
```

## 7. Monnify setup

Sandbox checklist:

- create integration;
- obtain API key, secret key, contract code;
- configure transaction webhook;
- configure disbursement webhook;
- confirm direct-debit sandbox availability;
- confirm card-tokenization sandbox behavior;
- request sandbox disbursement enablement if required;
- configure source wallet account;
- fund/test wallet when required.

Live prerequisites may include:

- card-tokenization enablement;
- disbursement enablement;
- static server egress IP whitelisting;
- MFA operating decision;
- production webhook signature validation;
- identity-verification access;
- legal/compliance approvals;
- bank/provider configuration.

## 8. Local webhook development

Use a public HTTPS tunnel.

Route:

- Telegram webhook to bot port;
- Monnify webhook to API port;
- Mini App URL to Next.js port.

Do not accidentally route Telegram and Monnify events to the same wrong process. Document the exact tunnel commands selected by the developer rather than forcing one vendor.

## 9. Demo/test mode

Provide safe seed fixtures:

- Telegram chat/user fixtures;
- a draft Collage;
- a registration-open Collage;
- mocked identity verification;
- test OTP provider;
- no real secrets;
- no fake provider success in production adapters.

Provider mocks are enabled only through explicit test/development configuration.

## 10. Deployment topology

Supported options:

- one container host running Compose;
- separate container services;
- Mini App on a Next.js host;
- managed PostgreSQL and Redis.

Requirements:

- stable HTTPS;
- static egress where Monnify live payouts require it;
- worker always running;
- bot webhook always reachable;
- no scale-to-zero unless scheduled jobs are guaranteed to wake;
- one migration job per deployment;
- horizontal workers rely on queue + DB invariants;
- bot scaling preserves safe update processing.

## 11. CI pipeline

On pull request:

1. frozen install;
2. Prisma client generation;
3. lint;
4. typecheck;
5. unit tests;
6. integration tests with PostgreSQL/Redis;
7. build all apps;
8. critical Playwright E2E where feasible;
9. dependency/security scan;
10. Docker image build smoke test.

Never run production migrations from a pull request.

## 12. Required final handoff

Codex must produce:

- `.env.example` for each app;
- variable-by-variable explanation;
- exact local startup commands;
- migration and seed commands;
- Telegram configuration steps;
- Monnify dashboard/configuration checklist;
- Docker Compose commands;
- webhook test steps;
- end-to-end demo script;
- known limitations;
- provider-dependent items;
- production-readiness blockers.
