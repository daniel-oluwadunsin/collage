# Collage

Collage is a Telegram-native Ajo/group-contribution platform. A group creates a
strict contribution schedule, members register through a Telegram Mini App,
collections are verified through Monnify, and the scheduled recipient is paid
only after every contribution and the Collage ledger reconcile.

## Architecture

```text
Telegram group
  └─ bot (grammY delivery/pinned status)
       └─ internal authenticated API

Mini App (Next.js)
  └─ public Express API
       ├─ PostgreSQL / Prisma source of truth
       ├─ transactional outbox
       ├─ Monnify adapter
       └─ SMSGate OTP adapter

Worker (BullMQ)
  ├─ lifecycle and collection jobs
  ├─ reconciliation and payout jobs
  └─ Telegram notification jobs → bot
```

Applications: `api`, `bot`, `worker`, and `mini-app`. PostgreSQL is the final
correctness boundary; Redis accelerates queues and delivery deduplication but
does not own financial state. Money is integer kobo (`BigInt`). Ledger and audit
history are append-only.

## Local setup

Requirements: Node `24.18.0`, Corepack, pnpm `11.14.0`, and Docker Compose.

```bash
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Local endpoints:

- Mini App: `http://localhost:3000`
- API: `http://localhost:4000`
- API Swagger: `http://localhost:4000/docs`
- Bot health: `http://localhost:4001/health/ready`
- Worker health/metrics: `http://localhost:4002/health/ready` and `/metrics`

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
docker compose config --quiet
```

The unit, PostgreSQL/Redis integration, security, provider-fixture, and
Playwright suites were executed before their files were removed at the product
owner's request. Exact historical evidence is in
`docs/IMPLEMENTATION_STATUS.md`.

## Docker

```bash
cp .env.example .env
docker compose up --build
docker compose ps
docker compose logs -f api bot worker
docker compose down
```

Production overlay:

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

Do not enable `PROVIDER_CALLS_ENABLED=true` until Monnify features, payout
egress/IP policy, wallet funding, webhook signature handling, identity/KYC,
MFA operations, and compliance gates are approved.

## Documentation

- [Setup](docs/SETUP.md)
- [Telegram setup](docs/TELEGRAM_SETUP.md)
- [Monnify setup](docs/MONNIFY_SETUP.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Operations runbook](docs/OPERATIONS_RUNBOOK.md)
- [Demo script](docs/DEMO_SCRIPT.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Design system](docs/DESIGN.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Provider references](docs/PROVIDER_REFERENCES.md)
