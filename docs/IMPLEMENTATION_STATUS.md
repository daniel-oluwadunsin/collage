# Collage Implementation Status

Last updated: 2026-07-18

## Milestone 1 — bootstrap and design foundation

Status: complete.

### Delivered

- [x] Mandatory product and engineering documents read in repository order.
- [x] Canonical `docs/DESIGN.md` normalized before feature code.
- [x] Collage Yellow `#FFD85C` and Collage Blue `#0357EE` fixed in tokens.
- [x] Distinct operational-fintech direction; Moniepoint copying prohibited.
- [x] Light, dark, system, and Telegram theme rules documented and demonstrated.
- [x] Compact/fullscreen and safe-area behavior documented.
- [x] Skeleton, loading, provider-pending, error, offline, expired, and
      unauthorized states documented and demonstrated.
- [x] pnpm/Turborepo workspace with Node 24 active-LTS pin.
- [x] `api`, `bot`, `worker`, and `mini-app` application boundaries created.
- [x] All 13 architecture packages created.
- [x] Strict TypeScript, ESLint, Prettier, Turbo tasks, and boundary rules added.
- [x] API, bot, worker, and Mini App liveness/readiness endpoints added.
- [x] Design-system boot page added; no business or provider flow implemented.
- [x] Root `AGENTS.md` and `.agents/skills/collage/SKILL.md` verified.
- [x] Secret-free `.env.example` added.
- [x] Multi-stage Dockerfiles and PostgreSQL/Redis/application Compose topology
      added.

### Intentionally not implemented

- Business database models or migrations.
- Telegram bot update handlers.
- Telegram Mini App authentication.
- BullMQ processors.
- Monnify HTTP calls, status maps, signatures, webhooks, charges, or payouts.
- Registration, contribution, ledger, cycle, or payout behavior.

These belong to later milestones and must not be inferred from scaffolding.

## Verification evidence

The command outcomes in this section are updated only after execution.

| Command                          | Result                                                  |
| -------------------------------- | ------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Pass                                                    |
| `pnpm db:generate`               | Pass — Prisma 7.8 client generated                      |
| `pnpm format:check`              | Pass                                                    |
| `pnpm lint`                      | Pass — 19 Turbo tasks                                   |
| `pnpm typecheck`                 | Pass — 19 Turbo tasks                                   |
| `pnpm test`                      | Pass — API, bot, and worker health suites               |
| `pnpm test:integration`          | Pass — application health integration suites            |
| `pnpm test:e2e`                  | Pass; visual browser evidence recorded separately below |
| `pnpm build`                     | Pass — 15 Turbo build tasks                             |
| Application Docker image builds  | Pass — API, bot, worker, Mini App                       |
| `docker compose config --quiet`  | Pass                                                    |
| Docker Compose smoke             | Pass — all six long-running services healthy            |

### Browser evidence

The production Mini App was inspected in a browser at 390×844 compact and
1440×900 fullscreen viewports:

- no horizontal overflow in either viewport;
- system/dark default and explicit light theme token switch verified;
- all six state cards present;
- fullscreen state layout resolved to three columns;
- no browser console errors or warnings.

### Compose evidence

- PostgreSQL 17 and Redis 8 became healthy.
- The migration service connected and reported no pending migrations.
- API, bot, worker, and Mini App became healthy.
- All four application `/health/ready` routes returned `200`.
- All four application containers ran as the non-root `collage` user.
- The stack was stopped cleanly with `docker compose down`; named data volumes
  were preserved.

## Prompt 2 entry criteria

Prompt 2 entry criteria were satisfied.

## Milestone 2 — shared financial foundation

Status: complete.

### Delivered

- [x] Pure, exhaustive Collage/member/payment-method/cycle/contribution/payout
      state machines.
- [x] Integer-minor-unit money helpers and lossless BigInt DTO serialization.
- [x] Timezone-aware daily, weekly, monthly, and yearly schedule generation,
      including constrained month/year dates and preferred charge rules.
- [x] Full Prisma MVP schema for identity, Telegram chats, Collages, immutable
      rules, registrations, payment methods, cycles, contributions, payouts,
      provider attempts, ledger, webhook inbox, outbox, notifications, audit,
      OTP, reservations, and launch tokens.
- [x] PostgreSQL migrations with partial unique indexes, lifecycle/money checks,
      deferred balanced-ledger enforcement, and append-only audit/ledger
      triggers.
- [x] Prisma PostgreSQL adapter, serializable transaction helper, bounded
      serialization/deadlock retry, advisory locks, and fixed-table row locks.
- [x] Repositories for payout-position reservation, registration and
      exactly-once start request, safe payment-method replacement, strict payout
      eligibility/retry, and Telegram departure obligations.
- [x] Append-only balanced double-entry ledger with idempotent posting and
      compensating reversal support.
- [x] Transactional audit and outbox append, locked batch claim, publish
      acknowledgement, and safe failure recording.
- [x] Redis/BullMQ connection and queue factories, validated payloads, bounded
      retries, and opaque deterministic job IDs.
- [x] Strict application environment schemas with provider calls disabled by
      default.
- [x] Pino credential/identity redaction.
- [x] AES-256-GCM versioned envelopes with AAD, keyed SHA-256 hashes,
      replay-resistant internal request authentication, Telegram init-data
      verification, and opaque launch-token issuance/consumption.
- [x] Secret-free environment placeholders and configurable local Compose
      PostgreSQL/Redis ports.
- [x] Safe, idempotent local seed fixture containing no real personal or
      financial credentials.
- [x] Pure unit tests and real PostgreSQL integration/concurrency tests.

### Explicitly still out of scope

- Telegram Bot API calls, update handlers, and webhook setup.
- Monnify HTTP calls, webhook interpretation, charge or payout execution.
- Production identity/OTP provider integration.
- Outbox workers and provider-specific processors.
- Registration, contribution, and payout HTTP/UI flows.
- Production custody, settlement, MFA, compliance, and legal enablement.

No test or fixture marks money paid from a redirect, invents a provider success,
or calls Telegram or Monnify.

## Milestone 2 verification evidence

The final command table is updated only from commands actually executed.

| Command                                        | Result                             |
| ---------------------------------------------- | ---------------------------------- |
| `pnpm install --frozen-lockfile`               | Pass                               |
| `pnpm db:generate`                             | Pass — Prisma 7.8 client generated |
| `prisma migrate deploy` against `collage_test` | Pass — two migrations              |
| Safe seed fixture                              | Pass against local `collage`       |
| `pnpm format:check`                            | Pass                               |
| `pnpm lint`                                    | Pass — 21 Turbo tasks              |
| `pnpm typecheck`                               | Pass — 21 Turbo tasks              |
| Shared package unit tests                      | Pass — 24 tests                    |
| PostgreSQL foundation/integration tests        | Pass — 4 tests                     |
| Application health tests                       | Pass — 3 tests                     |
| `pnpm test`                                    | Pass — 31 tests, none skipped      |
| `pnpm test:integration`                        | Pass — database and apps           |
| `pnpm build`                                   | Pass — 15 Turbo tasks              |
| `docker compose config --quiet`                | Pass                               |
| Migration image build                          | Pass — foundation image            |
