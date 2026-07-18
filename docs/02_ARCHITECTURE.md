# Collage Technical Architecture

## 1. Architecture decision

Use one **pnpm + Turborepo** repository with four independently deployable applications:

```text
collage/
├── apps/
│   ├── api/
│   ├── bot/
│   ├── worker/
│   └── mini-app/
├── packages/
│   ├── config/
│   ├── contracts/
│   ├── database/
│   ├── domain/
│   ├── logger/
│   ├── monnify/
│   ├── queue/
│   ├── security/
│   ├── telegram/
│   ├── testing/
│   ├── ui/
│   ├── eslint-config/
│   └── typescript-config/
├── docs/
├── docker/
├── compose.yaml
├── compose.production.yaml
├── AGENTS.md
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

There is no central admin application in the first release.

## 2. Application boundaries

### 2.1 `apps/api`

Technology:

- Node.js active LTS;
- TypeScript strict mode;
- Express;
- Zod;
- Prisma/PostgreSQL;
- Pino and `pino-http`;
- OpenAPI/Swagger;
- Helmet;
- strict CORS;
- request IDs and rate limiting;
- raw-body webhook handling.

Responsibilities:

- Telegram Mini App authentication;
- public Mini App API;
- current Telegram group-admin authorization;
- Collage creation, rule management, and queries;
- registration workflows;
- bank-account resolution;
- payment-method setup;
- manual-payment initialization;
- Monnify webhook ingestion;
- internal endpoints used by the bot;
- health/readiness and API documentation;
- audit and transactional outbox writes.

It must not perform long-running collection, reminder, payout, or reconciliation work inline.

### 2.2 `apps/bot`

Technology:

- Node.js;
- TypeScript;
- grammY;
- Express webhook server;
- Pino.

Responsibilities:

- Telegram webhook updates;
- bot installation and permission checks;
- commands and mentions;
- group/member events;
- group message rendering;
- Mini App direct-link buttons;
- pinned-status creation/editing;
- authenticated internal API calls;
- Telegram notification queue consumption.

The bot must not own business rules, directly update financial tables, or call Monnify.

### 2.3 `apps/worker`

Technology:

- Node.js;
- TypeScript;
- BullMQ;
- Redis;
- Prisma/PostgreSQL;
- Pino.

Responsibilities:

- transactional-outbox publishing;
- Collage/cycle lifecycle jobs;
- delayed member charges;
- provider status polling;
- state-aware retries;
- reminders;
- payout initiation and reconciliation;
- stale-operation recovery;
- maintenance and cleanup;
- Telegram notification jobs.

Every job must be safe after replay, worker restart, network timeout, or duplicate enqueue.

### 2.4 `apps/mini-app`

Technology:

- Next.js App Router;
- TypeScript;
- Tailwind CSS;
- shadcn/ui;
- TanStack Query;
- React Hook Form;
- Zod;
- Telegram Mini Apps SDK;
- Framer Motion;
- Lucide React;
- Zustand only for justified cross-route ephemeral state;
- theme support through `next-themes` or equivalent.

Responsibilities:

- Telegram/launch-token bootstrap;
- Collage creation;
- contributor registration;
- payout-account setup;
- card/direct-debit authorization;
- manual payment;
- status and history;
- payment-method replacement;
- payout recovery;
- complete loading, pending, empty, error, offline, and success states.

It never receives provider secrets, full reusable card tokens, raw stored NIN, or unmasked stored account data.

## 3. Shared packages

### 3.1 `packages/domain`

Pure business logic with no Express, Prisma, Telegram, Redis, or Monnify imports.

Include:

- explicit state machines;
- rule validation;
- schedule calculations;
- position and registration eligibility;
- payout readiness;
- outstanding-obligation calculation;
- default handling;
- ledger command definitions;
- safe money types/utilities.

Examples:

```ts
canCreateCollage();
canOpenRegistration();
canReservePosition();
canCompleteRegistration();
canStartCollage();
calculateCycleSchedule();
calculateMemberChargeAt();
canInitiateCharge();
canConfirmContribution();
canInitiatePayout();
canRetryPayout();
calculateOutstandingObligation();
```

### 3.2 `packages/database`

- Prisma schema/client;
- migrations;
- repository implementations;
- transaction helpers;
- PostgreSQL row/advisory lock helpers;
- serialization-conflict retry helper;
- test database helpers;
- BigInt serialization at DTO boundaries.

Applications import one shared Prisma client package; they do not instantiate unrelated clients.

### 3.3 `packages/contracts`

Shared Zod schemas and types for:

- HTTP request/response DTOs;
- internal bot API;
- queue jobs;
- domain events;
- Telegram status-card view models;
- normalized provider events.

Never share raw Prisma models with the browser.

### 3.4 `packages/monnify`

Typed provider adapter for:

- authentication and token cache;
- transaction initialization/verification;
- card-token charge;
- direct-debit mandate create/status/debit/status;
- supported banks;
- account name enquiry;
- single transfers and transfer status;
- platform wallet balance for reconciliation;
- webhook validation/normalization;
- provider error/status classification;
- safe redacted logging.

Raw Monnify response structures must not leak through the domain or UI.

### 3.5 `packages/telegram`

- Mini App `initData` verification;
- direct-link builder;
- launch action types;
- HTML escaping;
- safe user mentions;
- message templates/view models;
- Telegram API helpers;
- update fixtures for tests.

### 3.6 `packages/queue`

- queue names;
- job schemas;
- deterministic job-ID helpers;
- default attempts/backoff;
- Redis connection factory;
- dead-letter/failure conventions.

### 3.7 `packages/security`

- AES-256-GCM field encryption with versioned envelopes;
- deterministic keyed hashes where necessary;
- constant-time signature comparison;
- request and log redaction;
- internal service authentication;
- authorization helpers;
- correlation IDs;
- opaque launch-token implementation.

### 3.8 `packages/config`

Per-app environment schemas. Every process validates its own environment at startup and exits with a clear error when invalid.

### 3.9 `packages/logger`

Pino configuration with:

- environment-based formatting;
- correlation IDs;
- explicit sensitive-field redaction;
- child loggers for request/job/provider operations;
- request-body logging disabled on sensitive routes.

### 3.10 `packages/ui`

Shared shadcn-based primitives, theme tokens, and asynchronous-state components. Business feature components remain inside `apps/mini-app`.

## 4. Communication model

### 4.1 Mini App to API

HTTPS JSON.

1. Mini App receives Telegram raw `initData` and an opaque `startapp` token.
2. It sends raw `initData` to the API, preferably in a dedicated authorization header or bootstrap exchange.
3. API validates Telegram signature, `auth_date`, user, and chat context.
4. API resolves the opaque launch token from Redis/database.
5. API verifies action, Collage, chat, expiry, and user eligibility.
6. API creates a short-lived server session or returns scoped bootstrap data.

Never trust `initDataUnsafe`, query-string user IDs, or a client-supplied Collage role.

### 4.2 Bot to API

The bot calls `/internal/telegram/...` with a rotated internal service credential. The API returns a presentation view model instead of asking the bot to derive financial state.

### 4.3 API to worker

Use a transactional outbox:

1. API transaction changes domain state.
2. The same database transaction inserts `OutboxEvent`.
3. worker/outbox publisher claims unpublished rows using locking.
4. event is added to BullMQ with deterministic job ID.
5. outbox row is marked published.

This prevents a database commit from succeeding while queue publication is lost.

### 4.4 Worker to bot

Preferred model:

- worker produces `telegram-notifications` jobs;
- bot consumes and sends/edits Telegram messages;
- delivery result is persisted.

This makes Telegram rate-limit retries and failures explicit.

## 5. Database model

Use PostgreSQL UUID primary keys. Store Telegram IDs as strings or 64-bit-safe values. Store money as `BigInt` minor units.

Core models:

- `User`;
- `TelegramIdentity`;
- `TelegramChat`;
- `TelegramChatMembership`;
- `Collage`;
- `CollageRuleVersion`;
- `CollageMember`;
- `PayoutPositionReservation`;
- `OtpChallenge`;
- `BankAccount`;
- `PaymentMethod`;
- `CardAuthorization`;
- `DirectDebitMandate`;
- `Cycle`;
- `CycleContribution`;
- `PaymentAttempt`;
- `Payout`;
- `PayoutAttempt`;
- `LedgerAccount`;
- `LedgerTransaction`;
- `LedgerEntry`;
- `WebhookEvent`;
- `OutboxEvent`;
- `NotificationDelivery`;
- `AuditLog`.

### 5.1 Critical constraints

- unique membership: `(collage_id, telegram_user_id)`;
- unique payout position: `(collage_id, payout_position)`;
- one open/active/blocked Collage per Telegram chat through a partial unique index;
- one cycle number per Collage;
- one cycle contribution per cycle/member;
- one payout per cycle;
- globally unique provider reference within provider/environment;
- unique webhook fingerprint/provider event identity;
- one active payment method per member/Collage;
- one default payout account per member/Collage;
- balanced ledger transaction invariant.

Use raw SQL migrations for partial indexes or checks Prisma cannot express. Do not weaken an invariant to avoid SQL.

### 5.2 Concurrency controls

Use serializable transactions, `SELECT ... FOR UPDATE`, or PostgreSQL advisory locks for:

- payout-position reservation;
- registration completion;
- Collage start;
- confirming a cycle contribution;
- moving a cycle to ready-for-payout;
- creating/completing a payout;
- opening the next cycle.

Redis locks may reduce contention but cannot be the final correctness mechanism. Database constraints are the last guard.

## 6. State machines

### 6.1 Collage

```text
DRAFT
REGISTRATION_OPEN
STARTING
ACTIVE
BLOCKED
COMPLETED
SUSPENDED
CANCELLED
```

### 6.2 Registration/member

```text
NOT_STARTED
DETAILS_SUBMITTED
IDENTITY_PENDING
IDENTITY_FAILED
PAYMENT_METHOD_REQUIRED
PAYMENT_METHOD_AUTHORIZING
REGISTERED
AT_RISK
DELINQUENT
DEFAULTED
CANCELLED_BEFORE_START
```

### 6.3 Payment method

```text
AUTHORIZING
ACTIVE
FAILED
EXPIRED
SUSPENDED
CANCELLED
REPLACED
```

### 6.4 Cycle

```text
SCHEDULED
COLLECTING
OVERDUE
BLOCKED_BY_DEFAULT
READY_FOR_PAYOUT
PAYOUT_PROCESSING
COMPLETED
```

### 6.5 Cycle contribution

```text
SCHEDULED
CHARGE_PENDING
PAID
FAILED_RETRYABLE
MANUAL_PAYMENT_REQUIRED
OVERDUE
DEFAULTED
REVERSED
```

### 6.6 Payout

```text
READY
PROCESSING
PENDING_AUTHORIZATION
IN_PROGRESS
SUCCESSFUL
FAILED
REVERSED
EXPIRED
```

Centralize transitions and test them exhaustively. Route handlers and job processors call transition services; they do not assign arbitrary status strings.

## 7. Money and ledger

Use:

```ts
type MoneyMinor = bigint;
```

At provider boundaries:

- parse decimal strings explicitly;
- convert to/from minor units;
- reject unsupported precision;
- compare expected amount and currency;
- never use `number` arithmetic for balances.

Ledger writes go through one service that validates total debits equal total credits before commit.

Collection example:

- debit provider cash/clearing asset;
- credit Collage pot liability.

Successful payout example:

- debit Collage pot liability;
- credit provider cash/clearing asset.

Fees are explicit entries, not hidden deductions. Reversals use compensating transactions.

## 8. Webhooks

### 8.1 Monnify

Register an Express raw-body route before global JSON parsing so HMAC validation uses exact bytes.

Processing:

1. read raw body;
2. validate signature/source according to environment;
3. fingerprint and store the webhook event;
4. return `200` quickly;
5. enqueue processing;
6. normalize the event;
7. verify provider transaction/transfer when required;
8. apply idempotent state transition;
9. write ledger/outbox transactionally.

Sandbox and production validation behavior must be explicitly separated. Production fails closed.

### 8.2 Telegram

Use grammY webhook handling through Express and verify Telegram's webhook secret header. Subscribe only to required update types, including message, bot membership, and relevant chat-member updates.

## 9. Errors

Use typed application errors:

- validation;
- unauthorized;
- forbidden;
- not found;
- conflict;
- expired action;
- provider pending;
- provider unavailable;
- retryable provider failure;
- terminal provider failure;
- invariant violation.

API error format:

```json
{
  "success": false,
  "error": {
    "code": "REGISTRATION_PAYMENT_METHOD_REQUIRED",
    "message": "Connect a payment method to complete registration.",
    "requestId": "..."
  }
}
```

Never expose stack traces or raw provider details.

## 10. Observability

- structured Pino logs;
- request/job/provider correlation IDs;
- queue health and failure metrics;
- liveness/readiness endpoints;
- provider latency/status metrics with redaction;
- optional Sentry/OpenTelemetry only after sensitive-field scrubbing;
- immutable audit log separate from operational logs.

## 11. Docker topology

Local Compose services:

```text
postgres
redis
migrate
api
bot
worker
mini-app
```

Production images are independently deployable. Use multi-stage builds, non-root users, health checks, graceful shutdown, and runtime secrets. A live Monnify payout deployment may require controlled/static egress IP.
