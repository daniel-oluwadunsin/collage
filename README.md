# Collage

Telegram-native Ajo/group-contribution platform. Milestone 1 establishes the
design system, monorepo boundaries, health services, and container topology
only. No registration, payment, ledger, cycle, payout, webhook, or bot business
behavior is active.

## Architecture

```text
apps/
  api/       Express public/internal API boundary
  bot/       grammY/Telegram delivery boundary
  worker/    BullMQ durable-work boundary
  mini-app/  Next.js App Router Telegram Mini App

packages/
  config/ contracts/ database/ domain/ logger/ monnify/ queue/
  security/ telegram/ testing/ ui/ eslint-config/ typescript-config/
```

`domain` is infrastructure-free. The bot cannot access the database or Monnify.
The browser imports browser-safe contracts and UI only. ESLint enforces these
boundaries.

## Local setup

Requirements: Node `24.18.0`, Corepack, pnpm `11.14.0`, and Docker Compose.

```bash
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Local ports:

- Mini App: `http://localhost:3000`
- API health: `http://localhost:4000/health/ready`
- Bot health: `http://localhost:4001/health/ready`
- Worker health: `http://localhost:4002/health/ready`

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
```

## Docker

```bash
cp .env.example .env
docker compose config
docker compose build api bot worker mini-app
docker compose up
docker compose ps
docker compose down
```

The Compose topology includes PostgreSQL, Redis, a one-shot Prisma migration
service, and all four applications. The Milestone 1 Prisma schema is
intentionally empty, so the migration service performs no financial schema
change.

## Telegram setup (future operational milestone)

1. Create a bot in BotFather.
2. Configure a Mini App short name and HTTPS URL.
3. Add the bot to a test group and grant pin-message permission.
4. Configure the bot webhook URL and secret.
5. Populate the Telegram placeholders in `.env`.

Milestone 1 does not set a Telegram webhook or process updates.

## Monnify setup (future provider milestone)

Create sandbox credentials, then confirm direct-debit, tokenization,
disbursement, wallet, webhook, static-egress, identity-verification, and MFA
availability with Monnify. Do not enable any `MONNIFY_*_ENABLED` flag until the
relevant adapter and official-document contract tests exist.

Milestone 1 makes no Monnify call and exposes no webhook.

## Documentation

- Product and architecture: `docs/01_PRD.md`, `docs/02_ARCHITECTURE.md`
- Canonical UI specification: `docs/DESIGN.md`
- Security/provider behavior: `docs/04_MONNIFY_INTEGRATION.md`,
  `docs/05_SECURITY_AND_RISK.md`
- Status and decisions: `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`
- References: `docs/PROVIDER_REFERENCES.md`
