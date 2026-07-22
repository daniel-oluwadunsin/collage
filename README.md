# Collage

> An AI-powered contribution agent inside Telegram groups that helps communities create, automate, track, understand, and complete Ajo contributions securely through Monnify.

Collage brings the complete Ajo workflow into the conversation where a group already coordinates. A Telegram bot handles group interaction and shared status, a Mini App handles private registration and financial actions, and a deterministic backend manages collections, reconciliation, ledgers, cycles, and payouts. The AI assistant explains trusted system state and routes approved requests; it never decides whether money should move.

## Why Collage exists

Many Ajo groups organize in chat but still depend on one trusted person to track payments, remind members, maintain payout order, calculate balances, answer questions, and transfer each pot. That creates administrative stress, weak transparency, tracking mistakes, delayed or incorrect payouts, disputes, and a dangerous single point of trust.

Collage replaces the spreadsheet-and-treasurer workflow with explicit rules and server-verified financial operations. Everyone sees the same current state, while sensitive identity, bank, and provider data stays outside the group chat.

## What we built

- Telegram group onboarding, commands, status cards, pinned-message updates, reminders, membership events, and compact Mini App links.
- A public marketing site at `/` and the authenticated Telegram Mini App at `/mini-app`.
- A resumable creator and contributor flow for Collage rules, identity details, payout account resolution, payout-position selection, charge preferences, consent, and payment setup.
- Card authorization, direct-debit mandate setup, and manual hosted checkout through a typed Monnify adapter.
- Strict contribution cycles with automatic scheduling, verified collections, overdue/grace handling, default blocking, reconciliation, ordered payouts, and next-cycle opening.
- A Collage-scoped, append-only, balanced double-entry ledger. The provider wallet balance is never treated as a group's pot.
- Durable BullMQ workers, transactional outbox delivery, deterministic job IDs, database locks, idempotency keys, replay-safe webhooks, and provider-status polling.
- A Groq-powered Telegram assistant for questions about rules, members, cycles, contributions, balances, payout status, and safe Mini App actions.
- Encryption and masking of sensitive member/provider data, signed internal requests, Telegram init-data validation, opaque launch tokens, audit logs, rate limits, health endpoints, and structured redacted logs.
- A controlled neo-brutalist design system using Collage Yellow `#FFD85C` and Collage Blue `#0357EE`, with light/dark themes, Telegram safe areas, accessible controls, reduced motion, and explicit loading/error/provider-pending states.
- Local Docker Compose, a production overlay, and a non-production Render Blueprint/demo topology.

## How the product works

1. A Telegram group administrator adds Collage Bot and creates a Collage in the Mini App.
2. The creator defines the amount, participant limit, cadence, deadlines, reminders, payout timing, setup policy, and strict-cycle rules.
3. Members privately opt in, provide required details, select an available payout position, verify a bank account, choose a charge time, accept the exact rule version, and configure recurring or manual payment.
4. When every slot is fully registered, Collage locks the financial rules, creates all cycles, opens Cycle 1 exactly once, and schedules each obligation.
5. Collections are attempted at the member's chosen time. A redirect, timeout, or webhook receipt alone never marks a contribution paid; Collage verifies the provider reference, amount, currency, and terminal status server-side.
6. Confirmed contributions create balanced ledger entries. Failed collections produce a safe group reminder and an authenticated manual-payment path without exposing private failure reasons.
7. Only after every contribution is verified and the cycle ledger reconciles does Collage initiate the scheduled recipient's payout.
8. A pending or unknown payout is queried using its original reference. Collage does not create another transfer until the original outcome is terminal and retry is safe.
9. A successful payout completes the cycle and opens the next one. A missing contribution or unresolved payout blocks progression instead of faking success.

Member obligations survive leaving the Telegram group. Group administrators can request status, reminders, or reconciliation, but cannot mark another member paid, rewrite payout order after activation, or redirect a payout.

## AI assistant

Members can use `/ask`, mention the bot, or reply with questions such as:

- Who receives next?
- How many members have paid?
- Why is this cycle delayed?
- What is my current contribution status?
- How much remains outstanding?
- How can I retry an eligible payment or check a payout?

Groq performs one constrained natural-language-to-tool selection. Collage then validates the tool call, resolves fresh Telegram and Collage authorization, reads PostgreSQL/ledger state, and formats the answer deterministically. The model receives no authority to edit records, mark payments, calculate the pot independently, choose recipients, or initiate unrestricted money movement. Assistant access is rate-limited and disabled by default.

## Financial and security guarantees

- Money uses integer minor units (`BigInt` kobo); floating-point arithmetic is prohibited.
- Ledger history and audit history are append-only; every financial transaction must balance.
- PostgreSQL is the source of truth and final concurrency boundary. Redis is used for queues, rate limits, and delivery coordination—not financial truth.
- Unique constraints, row/advisory locks, serializable/retryable transactions, deterministic references, and idempotency keys prevent duplicate registration, positions, charges, cycle starts, and payouts.
- Provider redirects are pending-only. Payments are credited after verified webhook processing or server-side reconciliation.
- Webhooks are validated from their exact raw body, deduplicated, persisted, acknowledged quickly, and processed asynchronously.
- Network timeouts and ambiguous provider outcomes remain pending/unknown. Collage requeries the original operation before any retry.
- Payout account changes preserve history. A failed payout retry is restricted to the recipient and requires a definite terminal failure.
- NIN, phone number, bank account numbers, card tokens, and provider credentials are encrypted or masked and never posted to a group or returned raw to clients.
- Telegram init data, webhook secrets, internal service signatures, action-token bindings, expiry, membership, and object-level authorization are checked at trust boundaries.
- Pino logging redacts sensitive fields, while audit and correlation records retain safe operational evidence.
- `PROVIDER_CALLS_ENABLED=false` is the default fail-closed setting.

Collage does not provide credit, insurance, guaranteed collections, or platform-funded default coverage. Production use requires provider enablement and legal, KYC/AML, safeguarding, consumer-protection, privacy, and operational approval.

## Architecture

```text
Telegram group
  └── Bot (grammY / Express)
      ├── commands, mentions, replies, membership events
      ├── pinned status and notification delivery
      └── signed internal API calls

Public website + Telegram Mini App (Next.js App Router)
  └── Public API (Express / OpenAPI / Zod)
      ├── Telegram authentication and authorization
      ├── registration and financial workflows
      ├── AI assistant orchestration
      ├── Monnify and SMSGate adapters
      └── PostgreSQL / Prisma transaction boundary
          ├── encrypted operational records
          ├── append-only ledger and audit log
          ├── webhook inbox
          └── transactional outbox

Redis / BullMQ
  └── Worker
      ├── Collage and cycle lifecycle jobs
      ├── collection, verification, and reconciliation jobs
      ├── payout initiation and status polling
      ├── reminders and maintenance
      └── outbox publication → Telegram delivery
```

The API owns synchronous validation and database workflows. The worker owns durable asynchronous financial processing. The bot owns Telegram delivery. The Mini App never talks directly to Monnify with secrets and never decides that a payment succeeded.

## Repository structure

```text
collage/
├── apps/
│   ├── api/                 Express public/internal API, OpenAPI, sessions,
│   │                        assistant orchestration, webhooks, workflows
│   ├── bot/                 grammY Telegram webhook service, group UX,
│   │                        pinned cards, notifications, assistant entry points
│   ├── worker/              BullMQ processors for lifecycle, payments,
│   │                        payouts, reconciliation, reminders, and outbox
│   └── mini-app/            Next.js public landing page and Telegram Mini App
├── packages/
│   ├── assistant/           Groq tool router, policies, context, safe tools
│   ├── config/              Strict Zod environment schemas
│   ├── contracts/           Shared API, queue, event, and DTO schemas
│   ├── database/            Prisma schema, migrations, repositories, locks,
│   │                        transactions, ledger storage, and demo seed
│   ├── domain/              Pure state machines, schedules, money, invariants,
│   │                        and balanced-ledger rules
│   ├── eslint-config/       Shared lint configuration
│   ├── logger/              Pino logger and redaction policy
│   ├── monnify/             Typed provider client, transport, normalization,
│   │                        money conversion, and webhook verification
│   ├── queue/               BullMQ names, payload schemas, and helpers
│   ├── security/            Encryption, hashing, signed internal requests,
│   │                        and opaque launch tokens
│   ├── smsgate/             SMSGate transport and OTP provider abstraction
│   ├── telegram/            Telegram Mini App init-data validation
│   ├── typescript-config/   Shared strict TypeScript configurations
│   └── ui/                  Shared React primitives and design tokens
├── docker/                  Multi-stage app images and Render supervisor/gateway
├── docs/                    Product, architecture, provider, security, setup,
│                            operations, deployment, testing, and status docs
├── demo/                    Demo support assets
├── prompts/                 Historical implementation prompts/context
├── compose.yaml             Local full-stack topology
├── compose.production.yaml  Production Compose overlay
├── render.yaml              Non-production Render Blueprint
├── pnpm-workspace.yaml      Workspace and dependency catalog
└── turbo.json               Monorepo task graph
```

There is intentionally no central admin application.

## Technology stack

| Area                 | Technology                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| Runtime and language | Node.js 24 LTS, TypeScript strict mode                                                             |
| Monorepo             | pnpm 11, Turborepo                                                                                 |
| API and services     | Express 5, Zod, Swagger/OpenAPI, Pino                                                              |
| Telegram             | grammY, Telegram Mini Apps SDK                                                                     |
| Web UI               | Next.js App Router, React 19, Tailwind CSS, TanStack Query, React Hook Form, Framer Motion, Lucide |
| Data                 | PostgreSQL 17, Prisma 7                                                                            |
| Async work           | Redis 8, BullMQ                                                                                    |
| Payments             | Monnify typed provider adapter                                                                     |
| AI routing           | Groq local tool calling, configurable model                                                        |
| OTP transport        | SMSGate adapter behind an interface                                                                |
| Deployment           | Multi-stage Docker, Docker Compose, Render demo Blueprint                                          |

## Local development

### Requirements

- Node.js `24.18.0` (pinned in `.nvmrc` and `.node-version`)
- Corepack and pnpm `11.14.0`
- Docker with Compose

### Start the stack

```bash
corepack enable
corepack prepare pnpm@11.14.0 --activate
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate:deploy
pnpm --filter @collage/database prisma:seed
pnpm dev
```

Set the required secret placeholders in `.env` before starting all services. Keep `PROVIDER_CALLS_ENABLED=false` for ordinary local development.

### Local endpoints

| Service             | URL                                  |
| ------------------- | ------------------------------------ |
| Public landing page | `http://localhost:3000`              |
| Telegram Mini App   | `http://localhost:3000/mini-app`     |
| API                 | `http://localhost:4000`              |
| Swagger UI          | `http://localhost:4000/docs`         |
| OpenAPI JSON        | `http://localhost:4000/openapi.json` |
| API readiness       | `http://localhost:4000/health/ready` |
| Bot readiness       | `http://localhost:4001/health/ready` |
| Worker readiness    | `http://localhost:4002/health/ready` |
| Worker metrics      | `http://localhost:4002/metrics`      |

Useful database commands:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:deploy
pnpm --filter @collage/database prisma:seed
```

## Environment variables

Copy `.env.example` as the canonical local template. App-specific examples live in each application directory. Never commit populated `.env` files.

| Group                     | Variables                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime and URLs          | `NODE_ENV`, `LOG_LEVEL`, `PUBLIC_APP_URL`, `API_PUBLIC_URL`, `MINI_APP_PUBLIC_URL`, `INTERNAL_API_URL`, `API_INTERNAL_URL`, `NEXT_PUBLIC_API_URL`, `API_PORT`, `BOT_PORT`, `WORKER_HEALTH_PORT`, `PORT`, `API_TRUST_PROXY`, `CORS_ALLOWED_ORIGINS`, `SWAGGER_ENABLED`, `SWAGGER_PATH`                                                                                                                                                                                             |
| PostgreSQL and Redis      | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `REDIS_PORT`, `DATABASE_URL`, `REDIS_URL`                                                                                                                                                                                                                                                                                                                                                                   |
| Application security      | `APP_ENCRYPTION_KEY_ID`, `APP_ENCRYPTION_KEY_BASE64`, `APP_HASH_PEPPER`, `INTERNAL_SERVICE_TOKEN`, `LAUNCH_TOKEN_HASH_SECRET`, `API_SESSION_SECRET`                                                                                                                                                                                                                                                                                                                               |
| Telegram                  | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINI_APP_SHORT_NAME`, `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_PUBLIC_URL`, `BOT_INTERNAL_REQUEST_TIMEOUT_MS`, `TELEGRAM_NOTIFICATION_CONCURRENCY`, `TELEGRAM_RATE_LIMIT_MAX_RETRIES`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `NEXT_PUBLIC_TELEGRAM_MINI_APP_SHORT_NAME`                                                                                                         |
| AI assistant              | `ASSISTANT_ENABLED`, `ASSISTANT_MAX_MESSAGE_LENGTH`, `ASSISTANT_USER_RATE_LIMIT_PER_MINUTE`, `ASSISTANT_CHAT_RATE_LIMIT_PER_MINUTE`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_TIMEOUT_MS`, `GROQ_REASONING_EFFORT`, `GROQ_MAX_TOOL_CALLS`                                                                                                                                                                                                                                              |
| Provider gate and Monnify | `PROVIDER_CALLS_ENABLED`, `MONNIFY_ENV`, `MONNIFY_BASE_URL`, `MONNIFY_API_KEY`, `MONNIFY_SECRET_KEY`, `MONNIFY_CONTRACT_CODE`, `MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER`, `MONNIFY_CARD_TOKENIZATION_ENABLED`, `MONNIFY_DIRECT_DEBIT_ENABLED`, `MONNIFY_DISBURSEMENT_ENABLED`, `MONNIFY_IDENTITY_VERIFICATION_MODE`, `MONNIFY_DISBURSEMENT_MFA_MODE`, `MONNIFY_WEBHOOK_ALLOWED_IPS`, `MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS`, `CARD_SETUP_POLICY`, `CARD_SETUP_AMOUNT_MINOR` |
| OTP and SMSGate           | `OTP_PROVIDER`, `OTP_TTL_SECONDS`, `SMSGATE_API_BASE_URL`, `SMSGATE_DEPLOYMENT_MODE`, `SMSGATE_AUTH_MODE`, `SMSGATE_ALLOW_PUBLIC_CLOUD_IN_PRODUCTION`, `SMSGATE_USERNAME`, `SMSGATE_PASSWORD`, `SMSGATE_DEVICE_ID`, `SMSGATE_SIM_NUMBER`, `SMSGATE_PRIORITY`, `SMSGATE_REQUEST_TIMEOUT_MS`, `SMSGATE_TOKEN_TTL_SECONDS`                                                                                                                                                           |
| Worker policy             | `WORKER_MAX_AUTOMATIC_CHARGE_ATTEMPTS`, `WORKER_PENDING_POLL_SECONDS`, `WORKER_STALE_OPERATION_MINUTES`, `WORKER_OUTBOX_CONCURRENCY`, `WORKER_LIFECYCLE_CONCURRENCY`, `WORKER_PAYMENT_CONCURRENCY`, `WORKER_PAYOUT_CONCURRENCY`, `WORKER_REMINDER_CONCURRENCY`                                                                                                                                                                                                                    |
| Demo and client           | `DEMO_CONTROLS_ENABLED`, `DEMO_CONTROL_TOKEN`, `HACKATHON_DEMO_MODE`, `NEXT_PUBLIC_APP_ENV`                                                                                                                                                                                                                                                                                                                                                                                       |
| Reserved observability    | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `OTEL_EXPORTER_OTLP_ENDPOINT`                                                                                                                                                                                                                                                                                                                                                                                                                 |

`NEXT_PUBLIC_*` values are compiled into the browser and must never contain secrets. The Sentry and OpenTelemetry variables are currently reserved/documented; setting them does not enable runtime instrumentation. See [the environment runbook](docs/07_ENV_DOCKER_RUNBOOK.md) for ownership, secrecy, defaults, validation, and production guidance for every variable.

Generate independent secret values, for example:

```bash
openssl rand -base64 32 # APP_ENCRYPTION_KEY_BASE64
openssl rand -hex 32    # APP_HASH_PEPPER
openssl rand -hex 32    # INTERNAL_SERVICE_TOKEN
openssl rand -hex 32    # LAUNCH_TOKEN_HASH_SECRET
openssl rand -hex 32    # API_SESSION_SECRET
openssl rand -hex 32    # TELEGRAM_WEBHOOK_SECRET
```

## Docker

Run the complete local topology:

```bash
cp .env.example .env
docker compose up --build
docker compose ps
docker compose logs -f api bot worker mini-app
docker compose down
```

The stack includes PostgreSQL, Redis, a one-shot migration container, API, bot, worker, and Mini App. Application containers run as a non-root user and wait for healthy dependencies/migrations.

Production overlay:

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build
```

The repository also includes `render.yaml` and a combined non-production Render image. The free topology can scale to zero, uses non-durable queue infrastructure, and has expiring/no-backup database constraints; it must not process real contributions or production identity data.

## Telegram setup

1. Create a bot with BotFather and record its token and username.
2. Configure the Main Mini App or named Mini App short name.
3. Point the Mini App URL to a public HTTPS `/mini-app` route.
4. Configure `/collage`, `/status`, `/rules`, `/ask`, and `/help` commands.
5. Add the bot to the test group and promote it so membership checks and pinning work reliably.
6. Set the webhook to `https://<bot-host>/telegram/webhook` using `TELEGRAM_WEBHOOK_SECRET`.
7. Subscribe to the required message, membership, and `chat_member` updates.
8. Verify direct links, compact mode, pinned-message edits, replies, and forum topics on real Telegram clients.

See [Telegram setup](docs/TELEGRAM_SETUP.md) for exact commands and verification steps.

## Monnify setup

1. Create a sandbox integration and obtain the API key, secret key, and contract code.
2. Confirm merchant-specific availability for checkout, card tokenization, direct debit, account/name enquiry, and disbursement.
3. Configure transaction and disbursement webhooks to `https://<api-host>/webhooks/monnify`.
4. Configure the disbursement wallet and fund it for approved testing.
5. Confirm current webhook signature and source-IP requirements from official Monnify documentation.
6. Keep provider calls disabled until credentials, flags, webhook validation, and the target environment have been reviewed.
7. Before live use, confirm static egress/IP allowlisting, MFA mode, tokenization and disbursement enablement, wallet operations, KYC/identity access, and legal/compliance approval.

Monnify sandbox does not return a reusable production card token. A successful sandbox setup payment without a reusable credential is closed safely and does not falsely complete recurring-card registration. See [Monnify setup](docs/MONNIFY_SETUP.md) and the dated [provider references](docs/PROVIDER_REFERENCES.md).

## Verification

Current repository checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
docker compose config --quiet
pnpm docker:build
```

Per the product owner's repository instruction, unit/integration/Playwright test files and test scripts were deleted after their verified runs. Do not interpret their absence as proof that tests were never run: historical suites covered domain state machines, money and ledger invariants, provider status mapping, Telegram/webhook security, API authorization, concurrency, worker replay, bot behavior, and critical Mini App flows. Exact recorded evidence and outstanding smoke checks are in [Implementation Status](docs/IMPLEMENTATION_STATUS.md).

## End-to-end demo

The canonical demo uses three members:

1. Add the bot and create a weekly three-person Collage.
2. Register one member by card, one by direct debit, and one by the supported configured path.
3. Observe exactly-once automatic start and the pinned Cycle 1 status.
4. Confirm one automatic collection, one safe failed-collection reminder, and one verified manual checkout.
5. Observe reconciliation, payout processing for Position 1, payout success, and Cycle 2 opening.
6. Exercise a member-leave risk event without cancelling their Collage obligations.
7. Simulate a definite payout failure, let the recipient update their account, and verify that only one eligible retry is initiated.
8. Ask the assistant about the next recipient, outstanding members, cycle delay, and safe available actions.

Use only explicit development/demo controls and provider-approved sandbox data. See [Demo Script](docs/DEMO_SCRIPT.md).

## Known limitations and open questions

- Production Monnify card tokenization, direct debit, disbursement, identity verification, MFA behavior, wallet funding, and IP/egress policy are merchant- and environment-dependent.
- Legal/compliance decisions remain open for custody/safeguarding, KYC/AML, NIN handling, privacy retention, consumer protection, disputes, defaults, and recurring-payment consent.
- Collage does not cover defaults, lend money, insure a pot, or guarantee provider collection.
- Strict cycles intentionally block payout and the next cycle until every contribution and the current payout are resolved.
- The AI assistant is an explanation and constrained-action layer, not a financial decision-maker.
- The free Render demo is not production-ready: it scales to zero, Redis jobs may be lost, and the free database expires without backups.
- Live Telegram device testing and live provider smoke tests require operator-owned credentials and enabled accounts.
- Reserved Sentry/OpenTelemetry configuration is not yet wired into runtime observability.
- There is no central operations/admin UI; operational workflows use logs, health/metrics, database-backed audit evidence, and runbooks.

See [Known Limitations](docs/KNOWN_LIMITATIONS.md) for the maintained blocker list.

## Production-readiness checklist

- [ ] Legal, compliance, safeguarding, privacy, KYC/AML, consent, disputes, and default policies approved.
- [ ] Production Telegram bot, HTTPS Mini App, webhook secret, permissions, client/device, and topic behavior verified.
- [ ] Monnify production credentials and required products enabled in writing.
- [ ] Webhook signatures, allowed sources, exact raw-body handling, replay, and reconciliation tested live.
- [ ] Static egress/IP allowlisting and disbursement MFA operating model approved.
- [ ] Production wallet funding, settlement, reconciliation, and incident ownership documented.
- [ ] Encryption keys, hash pepper, service/session secrets, rotation, backup, and recovery controls provisioned.
- [ ] Managed PostgreSQL and durable Redis configured with backups, monitoring, alerts, and capacity limits.
- [ ] All static checks, builds, migrations, integration suites, critical Playwright flows, image builds, and full Compose/deployment smoke tests pass in the release environment.
- [ ] Rate limits, worker concurrency, retry thresholds, provider polling, and Telegram delivery capacity load-tested.
- [ ] Audit-log review, financial reconciliation, stuck-operation recovery, provider incident, and rollback runbooks rehearsed.

## Documentation

- [Product requirements](docs/01_PRD.md)
- [Architecture](docs/02_ARCHITECTURE.md)
- [Design system](docs/DESIGN.md)
- [Monnify integration](docs/04_MONNIFY_INTEGRATION.md)
- [Security and risk](docs/05_SECURITY_AND_RISK.md)
- [API, events, and jobs](docs/06_API_EVENTS_AND_JOBS.md)
- [Environment and Docker runbook](docs/07_ENV_DOCKER_RUNBOOK.md)
- [Testing and acceptance](docs/08_TESTING_AND_ACCEPTANCE.md)
- [Local setup](docs/SETUP.md)
- [Telegram setup](docs/TELEGRAM_SETUP.md)
- [Monnify setup](docs/MONNIFY_SETUP.md)
- [Deployment](docs/DEPLOYMENT.md)
