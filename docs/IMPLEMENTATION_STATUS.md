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

## Milestone 3 — public/internal API and Monnify adapter

Status: implemented; production provider and compliance enablement remain
blocked as listed below.

### Delivered

- [x] Hardened Express factory with request IDs, redacted Pino HTTP logging,
      Helmet, allowlist CORS, 64 KiB JSON/256 KiB webhook limits, rate limiting,
      centralized typed errors, liveness/readiness, and OpenAPI/Swagger.
- [x] Telegram Mini App init-data verification, opaque launch-token binding,
      short-lived signed API sessions, and launch eligibility checks.
- [x] Fresh current-group-admin enforcement for administrative Collage actions.
- [x] Collage create/read/update/open-registration/status/rules/positions/
      history APIs and asynchronous reconciliation requests.
- [x] Resumable registration details, payout-position reservation, OTP provider
      abstraction/challenges, phone verification, and immutable rule consent.
- [x] Monnify bank catalogue/name enquiry, resolution binding, encrypted payout
      accounts, masked DTOs, and safe replacement.
- [x] Idempotent card checkout setup, server verification, exact amount/currency
      checks, encrypted token activation, and safe replacement cutover.
- [x] Direct-debit mandate create/status/activation with encrypted mandate data.
- [x] Idempotent manual checkout initialization and queued status rechecks.
- [x] Failed-payout account replacement and retry request APIs restricted to the
      scheduled recipient and reconciled terminal failure.
- [x] Replay-resistant internal bot API, Telegram membership synchronization,
      leave-obligation updates, opaque launch-token actions, and HTML-safe
      presentation view models.
- [x] Typed Monnify authentication, checkout initialization/verification,
      card-token charge, mandate create/status/debit/debit-status, banks,
      account validation, transfers/status, wallet balance, webhook
      validation/normalization, decimal money serialization, and safe errors.
- [x] Raw-body Monnify webhook ingress with production HMAC/source-IP policy,
      explicit unsigned-sandbox opt-in, encrypted inbox, fingerprint dedupe,
      transactional outbox, and fast acknowledgement.
- [x] PostgreSQL migrations correcting webhook reference indexing and adding
      encrypted card checkout URL persistence.
- [x] Unit/provider fixture tests plus PostgreSQL integration tests for fresh
      admin authorization, state conflicts, idempotent setup, and webhook
      dedupe/outbox atomicity.

### Material blockers and intentionally deferred work

- SMSGate is the selected OTP transport. Public-cloud mode is development-only;
  production configuration requires a private HTTPS SMSGate server.
- Live identity/NIN verification feature access and provider are not confirmed;
  registration remains `IDENTITY_PENDING` and cannot fake completion.
- Monnify card tokenization, direct debit, disbursement, source wallet, IP
  whitelist, and MFA mode require merchant enablement and live confirmation.
- The worker processors that consume webhook/reconciliation/payment/payout
  outbox events are the next milestone. This milestone queues work but does not
  move money inside HTTP handlers.
- Custody/settlement model, payout MFA operating procedure, and legal/compliance
  approval remain product-owner decisions.

## Milestone 3 verification evidence

The final command table is populated from the concluding verification run.

| Command                                | Result                               |
| -------------------------------------- | ------------------------------------ |
| `pnpm install --frozen-lockfile`       | Pass                                 |
| `pnpm db:generate`                     | Pass — Prisma 7.8 client generated   |
| Four migrations against `collage_test` | Pass                                 |
| `pnpm format:check`                    | Pass                                 |
| `pnpm lint`                            | Pass                                 |
| `pnpm typecheck`                       | Pass — 25 Turbo tasks                |
| `pnpm test`                            | Pass — 37 tests; DB suites separate  |
| PostgreSQL database integration tests  | Pass — 4 concurrency/invariant tests |
| PostgreSQL API integration tests       | Pass — 9 tests, none skipped         |
| `pnpm test:integration`                | Pass — app integration suites        |
| `pnpm build`                           | Pass — 15 Turbo tasks                |

## SMSGate OTP provider addendum

Status: implemented on 2026-07-18; verification evidence is recorded after the
concluding repository checks.

### Delivered

- [x] Typed SMSGate package with cloud/private JWT and local Basic
      authentication.
- [x] Access-token caching, refresh-token rotation, and one authorization
      recovery replay using the same caller-supplied message ID.
- [x] E.164 validation, OTP TTL, priority, device/SIM selection, delivery-report
      request, documented message-state parsing, and status lookup.
- [x] No retry for ambiguous send timeouts, network failures, or server errors.
- [x] Conditional environment validation, secret/log redaction, Compose wiring,
      Android setup guidance, and official-provider references.
- [x] API registration challenges use the challenge UUID as the SMSGate message
      ID and keep HTTP acceptance separate from user-entered OTP verification.

### Material deployment requirement

- A production Collage deployment needs a private HTTPS SMSGate server and an
  online Android device with SMS capability. The official public cloud is
  rejected in production because SMSGate documents it as appropriate only for
  non-sensitive data.

### Verification evidence

| Command/evidence                             | Result                                      |
| -------------------------------------------- | ------------------------------------------- |
| `pnpm install --frozen-lockfile`             | Pass — 19 workspace projects                |
| `pnpm format:check`                          | Pass                                        |
| `pnpm lint`                                  | Pass — 27 Turbo tasks                       |
| `pnpm typecheck`                             | Pass — 27 Turbo tasks                       |
| `pnpm test`                                  | Pass; SMSGate fixture suite 6/6             |
| PostgreSQL database integration tests        | Pass — 4/4, none skipped                    |
| PostgreSQL API integration tests             | Pass — 11/11, none skipped                  |
| `pnpm build`                                 | Pass — 16 Turbo tasks                       |
| `docker compose config --quiet`              | Pass                                        |
| API runtime image `collage-api:smsgate-test` | Pass — multi-stage production target        |
| Live SMS to a real Android/SIM               | Not run — requires operator credentials/SIM |
| `docker compose config --quiet`              | Pass                                        |
| API multi-stage image build                  | Pass                                        |
| Compose migrate/API readiness smoke          | Pass — non-root API returned ready          |

## Milestone 4 — Telegram bot

Status: implemented on 2026-07-18; live BotFather/group validation requires
operator credentials.

### Delivered

- [x] Separate grammY + Express webhook service with constant-time
      `X-Telegram-Bot-Api-Secret-Token` validation.
- [x] Startup command and webhook registration with the explicit `message`,
      `my_chat_member`, and `chat_member` allowed-update set.
- [x] Bot-added and membership handling, fresh Telegram permission/admin
      checks, and actionable missing-pin-permission guidance.
- [x] `/collage`, `/status`, `/rules`, `/help`, privacy-mode command addressing,
      and explicit bot-mention detection.
- [x] API-approved no-Collage, registration, active, blocked,
      payout-processing, completed, suspended, and starting status-card states.
- [x] Opaque API-issued launch tokens materialized as documented compact direct
      Mini App links.
- [x] New-member synchronization/welcome and registered-member leave handling
      with obligations preserved by the API.
- [x] Pinned status create/edit/fallback behavior and internal pinned-message
      recording.
- [x] BullMQ `telegram-notifications` consumer contract for registration,
      start, failed charge, reminders, member leave, blocked cycle, payout
      processing/success/failure, and completion.
- [x] Safe HTML escaping/mentions, bounded Telegram `retry_after` handling,
      atomic Redis delivery claims, release-on-failure, and 90-day completion
      markers.
- [x] Dependency-aware readiness, liveness, Pino error reporting, and graceful
      HTTP/worker/Redis shutdown.
- [x] Package boundaries continue to prohibit bot imports of database,
      Monnify, and SMSGate.

### Verification evidence

| Command/evidence                                      | Result                             |
| ----------------------------------------------------- | ---------------------------------- |
| `pnpm install --frozen-lockfile`                      | Pass — 19 workspace projects       |
| `pnpm format:check`                                   | Pass                               |
| `pnpm lint`                                           | Pass — 27 Turbo tasks              |
| `pnpm typecheck`                                      | Pass — 27 Turbo tasks              |
| `pnpm test`                                           | Pass — Redis test separate         |
| Bot Redis integration (`TEST_REDIS_URL=...`)          | Pass — bot 11/11, none skipped     |
| PostgreSQL database integration tests                 | Pass — 4/4, none skipped           |
| PostgreSQL API integration tests                      | Pass — 11/11, none skipped         |
| `pnpm build`                                          | Pass — 16 Turbo build tasks        |
| `docker compose config --quiet`                       | Pass                               |
| Bot image `collage-bot:telegram-test`                 | Pass — production runtime target   |
| Real Telegram webhook/group/pin/notification delivery | Not run — needs operator bot token |

### Remaining deployment questions/requirements

- Configure the production bot and Mini App short name in BotFather, supply a
  public HTTPS webhook, and grant the bot group-admin `Pin messages` rights.
- Upstream worker processors must enqueue the validated notification view
  models with unique delivery UUIDs. This milestone implements the complete bot
  consumer but does not implement unrelated financial event processors.
- Telegram cannot atomically commit an external `sendMessage` with the Redis
  completion marker. A crash in that narrow interval can cause a replay; the
  implementation documents this instead of claiming provider-level
  exactly-once delivery.

## Milestone 5 — Durable automation worker

Status: implemented on 2026-07-18; live Monnify and operator MFA validation
remain deployment gates.

### Delivered

- [x] Separate BullMQ worker runtime with queue-specific concurrency, bounded
      retry/backoff, Prometheus-format metrics, dependency-aware readiness, and
      graceful worker/queue/database/Redis shutdown.
- [x] Transactional-outbox publisher with deterministic downstream identities,
      crash replay, invalid-payload failure recording, and recurring BullMQ Job
      Schedulers for publication, stale recovery, and reconciliation.
- [x] Exactly-once Collage schedule materialization, immutable daily/weekly/
      monthly/yearly cycle dates, member-preference charge dates, lifecycle
      deadlines/grace, and delayed collection/reminder jobs.
- [x] Card-token and mandate collection orchestration with source-of-truth
      reloads, persisted provider references, encrypted credentials/email,
      mandatory transaction verification, provider-aware bounded cadence,
      rolling two-debit daily enforcement, and manual-payment fallback.
- [x] Unknown/pending payment polling, webhook-triggered server verification,
      stale-operation recovery, no blind provider retries, and unresolved
      payment preservation through grace blocking.
- [x] One group reminder containing all definitely owing members while
      excluding paid members and unresolved provider attempts.
- [x] Deadline, grace, delinquent/default, blocked-cycle, registered-member
      leave obligation, and recovery-to-readiness handling.
- [x] Payout eligibility proof across contribution state, confirmed totals, and
      Collage-specific ledger balance; unique payout/attempt creation;
      transfer initiation; pending/MFA/status polling; terminal retry gating;
      and reference/amount verification.
- [x] Balanced append-only contribution and payout ledger entries, cycle/payout
      audit/outbox writes, successful-payout completion, next-cycle opening only
      after success, and final Collage completion.
- [x] Reconciliation mismatch audit/outbox alerts and stale payment/payout/
      lifecycle recovery sweeps.
- [x] Telegram notification production for registration, start, failed charge,
      reminders, member leave, blocked cycle, payout processing/success/failure,
      and completion; the bot remains the delivery-only consumer.
- [x] PostgreSQL migration for encrypted recurring-card customer email and
      matching API write path.

### Verification evidence

| Command/evidence                                            | Result                                    |
| ----------------------------------------------------------- | ----------------------------------------- |
| Worker lint                                                 | Pass                                      |
| Worker strict TypeScript                                    | Pass                                      |
| Worker unit tests                                           | Pass — retry/deadline policies            |
| Worker PostgreSQL integration tests                         | Pass — 10/10 total, none skipped          |
| Concurrent start/replay                                     | Pass — one schedule and one audit         |
| Outbox crash/Redis-outage replay                            | Pass — unpublished then deterministic     |
| Strict-cycle unresolved-attempt preservation                | Pass                                      |
| Payout readiness race and successful next-cycle transition  | Pass — one payout, next opens after paid  |
| Consolidated reminder excluding pending provider operations | Pass                                      |
| Repository format, lint, and strict TypeScript              | Pass                                      |
| Repository unit tests and database/API/bot integrations     | Pass; worker PostgreSQL 10/10             |
| Repository build                                            | Pass — all 16 build tasks                 |
| Worker readiness and metrics runtime smoke                  | Pass against Compose PostgreSQL/Redis     |
| Worker production image `collage-worker:milestone5-test`    | Pass on first build                       |
| Final image rebuild after config-only correction            | Registry fetch failed; code stages passed |

### Material deployment gates

- Monnify card tokenization, direct debit, and disbursement must be enabled for
  the production contract and exercised with operator-owned sandbox/live
  fixtures before money movement is enabled.
- A transfer that Monnify reports as pending authorization/MFA remains pending
  and is polled. The current official-page set does not establish an
  unattended MFA submission policy; production must select and document the
  operator authorization procedure.
- Provider calls remain disabled by default. No external Monnify or Telegram
  request was made by this milestone's tests.
