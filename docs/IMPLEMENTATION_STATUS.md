# Collage Implementation Status

Last updated: 2026-07-21

## Assistant application-rate adjustment

Status: implemented on 2026-07-21.

- [x] Increased Collage's Redis-backed assistant allowance from 5 to 20
      questions per user per minute and from 20 to 100 per chat per minute in
      the local environment and Render Blueprint.
- [x] Kept `GROQ_MAX_TOOL_CALLS=1` and the existing one-request/no-retry
      provider boundary.
- [x] Documented that these application limits do not increase Groq's
      organization-level provider quota.
- [x] Removed duplicate Blueprint configuration and replaced committed Groq
      and demo-control credentials with dashboard-managed secret entries.

## Groq-powered Collage assistant

Status: implementation complete; verification evidence is recorded below.

- [x] Added backend-owned `@collage/assistant` package using Groq only for one
      natural-language-to-tool selection request.
- [x] Added deterministic family pre-routing, strict tool schemas, unknown and
      extra-argument rejection, trusted mention/reply placeholders, unsafe
      request filtering, and no AI retry/fallback behavior.
- [x] Added signed `POST /internal/assistant/query`; API resolves current chat,
      fresh Telegram membership, Collage membership, actor role, and target.
- [x] Added personal, member, group, cycle, rule, and safe Mini App action-link
      tools backed by database/domain source-of-truth projections.
- [x] Pot values come only from the append-only Collage ledger. Money remains
      BigInt minor units until existing display formatting.
- [x] Added per-user and per-chat Redis limits, maximum input length, safe
      structured logs, and action-link audit records.
- [x] Action tokens are single-use and bind user, Telegram chat, Collage,
      action, and relevant cycle/payout where applicable; ordinary API checks
      still run before any provider action.
- [x] Bot supports `/ask`, explicit mentions, and question replies; ignores
      ordinary group conversation and replies to the exact original message
      while preserving forum topics.
- [x] Anonymous personal questions, ambiguous/unresolved people, outsiders,
      sensitive disclosures, permission bypasses, and malformed Groq output
      fail closed with deterministic responses.
- [x] Groq configuration is API-only; the combined Render supervisor strips it
      from bot, worker, migration, and Mini App child environments.
- [x] Assistant activation defaults to off, including Render, so deploying the
      code before provisioning Groq cannot prevent the existing API from
      starting or change current bot/payment behavior.
- [x] Backward-compatible feature-gate verification passed six assertions: an
      existing environment with no Groq variables parses with the assistant
      disabled, enabling without a key fails closed, and fully configured
      enablement selects the intended model. The temporary test was deleted.
- [x] Selected `openai/gpt-oss-20b` through `GROQ_MODEL` after verifying current
      official support for local tool calling and low reasoning effort; the
      model remains operator-overridable without an application code change.
- [x] Model-selection regression verification passed 20 focused assertions:
      six representative intents exposed the expected tool, the configured
      model and low reasoning effort reached the Groq request, required
      single-tool behavior remained enforced, and a rate-limit response was
      not retried. The temporary test file was deleted after verification.
- [x] Removed a literal Groq key from `.env.example`; the exposed key must be
      revoked and replaced with an operator-managed API secret.
- [x] Focused assistant, bot, and API verification passed 110 assertions across
      deterministic routing, schema rejection, authorization, privacy
      placeholders, HTML escaping, exact one-call/no-retry Groq behavior,
      Telegram commands/mentions/replies/topics/buttons, and internal endpoint
      authentication. The temporary test files were deleted after verification
      as required by this repository.
- [x] `pnpm install --frozen-lockfile --offline`, Prisma client generation,
      format, lint, strict typecheck, production build, and development plus
      production Compose configuration validation passed.
- [x] Fresh local PostgreSQL migration deployment passed against the Compose
      database: all 12 migrations applied, including assistant action-token
      resource binding.
- [x] Successfully loaded the idempotent, non-production Collage fixture into
      the fresh local database during local verification.
- [ ] Full Docker Compose application smoke testing and Playwright remain
      pending; PostgreSQL and Redis are healthy, but application services still
      require a populated local `.env`.
- [ ] Live Groq credential/model smoke test requires a new operator-owned key;
      no usable key is present locally, and the previously exposed key must not
      be reused.
- [ ] Real Telegram Android/iOS/Desktop reply and topic validation requires an
      operator bot and devices.

## Mini App registered-member count correction

Status: implemented on 2026-07-21.

- [x] Collage status responses now include an authoritative registered-member
      count computed by PostgreSQL across obligation-bearing member states.
- [x] The Mini App registration progress uses that server count instead of
      reconstructing it from grouped diagnostic state totals.
- [x] Registration-open status is reloaded on mount and every five seconds,
      then polling stops after the Collage leaves registration, covering
      Telegram webviews that resume without a browser focus event.
- [x] Counts remain scoped to the authorized Collage and expose no member PII.

## Mini App returning-member dashboard routing

Status: implemented on 2026-07-21.

- [x] Reopening a join action as a registered or obligation-bearing member now
      opens the normal Collage dashboard instead of an `Already registered`
      interstitial.
- [x] Authenticated Collage status includes only the current user's own
      current-cycle contribution state, amount, currency, and paid timestamp.
- [x] A group `Pay now` action automatically starts checkout only when the
      server reports a currently payable contribution. Paid members and users
      without a payable contribution see the normal dashboard, avoiding a
      known `NO_PAYABLE_CONTRIBUTION` conflict.
- [x] Redirects and client-side state are still never treated as proof of
      payment; the routing decision uses authoritative database state.

## User-facing naira formatting correction

Status: implemented on 2026-07-21.

- [x] Added one BigInt-safe formatter for server-rendered money presentation.
- [x] Telegram status, rules, pot, payout, received, and verified-payment
      notifications use the naira symbol and major units (`₦5,000`) rather
      than exposing `NGN 500000 minor units`.
- [x] Non-zero kobo remains visible without converting financial BigInts
      through JavaScript `number`; provider payloads and DTO minor units remain
      unchanged.

## Mini App payment-return navigation correction

Status: implemented on 2026-07-21.

- [x] The return action now calls the initialized Telegram SDK close bridge
      instead of relying only on an optional legacy global object.
- [x] The close event requests return to the app that opened Telegram where
      supported, with the legacy bridge and configured bot deep link as safe
      fallbacks.
- [x] No redirect or client action is treated as payment confirmation.

## Render single-container free demo deployment

Status: implemented; validation evidence is recorded below.

- [x] Corrected the Render migration launcher after the first live startup
      exposed pnpm's runtime dependency-status write under the non-root user.
      The supervisor now invokes the image's installed Prisma CLI directly,
      without a Corepack download, package install, or workspace-root write.
- [x] Added a Render Blueprint for one free Docker Web Service, one free
      PostgreSQL database, and one free no-eviction Key Value instance in
      Frankfurt.
- [x] Added a combined image that builds API, bot, worker, and Mini App while
      retaining their separate process and port boundaries.
- [x] Added a fail-fast supervisor that deploys Prisma migrations before
      startup, forwards shutdown signals, and terminates the deployment if a
      critical process exits.
- [x] Added a streaming path gateway for the canonical
      `https://collage-apiconf.onrender.com` origin, including exact Telegram
      and Monnify webhook routing and combined readiness.
- [x] Kept provider calls fail-closed and documented scale-to-zero, free
      database expiry/no-backup, and non-durable queue limitations.
- [x] Hardened Docker context exclusions so no root or workspace-local `.env`
      file can enter an image build; `.env.example` files remain available.
- [x] Verified format, lint, typecheck, monorepo build, Linux/amd64 combined
      image build, non-root runtime metadata, gateway path routing, raw webhook
      body streaming, and combined readiness.
- [ ] Create the Blueprint in the user's Render account and enter the
      user/provider-owned `sync: false` secrets.
- [ ] Confirm the assigned Render hostname, deploy health, Telegram webhook,
      and BotFather Mini App URL in the live account.

## Direct-debit boundary and safe tracing correction

- [x] Mini App and API now share an ISO timestamp contract for mandate start
      and end values; API normalizes these to Monnify's documented
      seconds-only timestamp format.
- [x] Raw direct-debit input logging was removed because it exposed email,
      account number, and address.
- [x] API direct-debit traces now record only safe correlation, entity, date,
      provider-outcome, and classified-failure fields.
- [x] Worker traces now include job start/completion/failure with queue, job,
      and correlation IDs without logging job payloads.

## Monnify direct-debit mandate timestamp correction

- [x] Mandate creation sends documented `startDate`/`endDate` fields as full
      `YYYY-MM-DDTHH:MM:SS` timestamps.
- [x] The Mini App selects tomorrow rather than the already-current date.
- [x] API validation rejects non-future starts and end-before-start ranges
      before creating a provider operation.
- [x] HTTP 400 responses remain terminal invalid requests even when Monnify
      returns generic code `99`; they are no longer surfaced as retryable 503s.

## Monnify sandbox nullable-card-token correction

- [x] Transaction verification accepts the officially documented sandbox
      `cardDetails.cardToken: null` response.
- [x] Both documented tokenization-capability shapes are normalized without
      exposing or fabricating card credentials.
- [x] A paid setup with no reusable token is closed as terminal, the unusable
      authorizing method is failed, and registration safely returns to
      payment-method selection.
- [x] Worker webhook processing now completes instead of retrying a schema
      exception indefinitely.
- [x] The Mini App explains the sandbox limitation and offers another payment
      method; registration is not falsely completed.

## Telegram action and card-registration recovery correction

- [x] Current group-card `startapp` tokens are reusable for a bounded 30-day
      lifetime; closing and reopening no longer consumes the action.
- [x] Collage creation writes a transactional `collage.created` outbox event;
      the bot consumes it, reloads the approved status-card view model, sends a
      new group message, and pins/records it when permitted.
- [x] Card and manual-payment redirects return to a real Mini App
      `/payment-return` state instead of the API's JSON 404.
- [x] Monnify card-setup webhooks now resolve card authorization references,
      requery provider state, validate amount/currency/token evidence, activate
      safely, and invoke the shared registration-completion invariant.
- [x] API authorization verification performs the same completion invariant,
      including recovery when the card was already activated.
- [x] Reopened authorizing registrations receive only their opaque pending
      authorization ID and resume server-verification polling; raw Prisma
      member records are no longer serialized by that endpoint.

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

## Milestone 6 — Telegram Mini App

Status: implemented on 2026-07-18; live Telegram/device and enabled-provider
validation remain deployment gates.

### Delivered

- [x] Next.js App Router Mini App with strict TypeScript, Tailwind, shadcn-style
      owned UI primitives, TanStack Query, React Hook Form/Zod, Telegram Apps
      SDK, Framer Motion, and Lucide. Zustand was not added because all client
      state is either local form/navigation state or TanStack-owned server
      state.
- [x] Telegram SDK boot, raw init-data/server bootstrap, opaque launch actions,
      theme/viewport CSS binding, safe-area shell, compact/fullscreen layouts,
      and explicit light/dark/system/Telegram theme control.
- [x] Persistent Collage context and intentionally operational-fintech styling
      using fixed Yellow `#FFD85C` and Blue `#0357EE`, borders and information
      rhythm rather than a default component dashboard.
- [x] Group-admin Collage creation and registration opening with integer
      minor-unit conversion and strict-cycle review.
- [x] Server-resumable identity, phone OTP, resolved/encrypted payout account,
      concurrent position selection, daily/weekly/monthly/yearly charge
      preferences, exact rule consent, card/direct-debit setup, and
      server-confirmed completion presentation.
- [x] Card and mandate redirects with opaque session IDs, durable
      provider-pending state, capped terminal-aware polling, and no redirect or
      optimistic financial success.
- [x] Full/closed/already-registered/position-race handling; Collage status,
      strict-cycle state, progress, and empty/error history.
- [x] Manual payment initialization, unresolved-attempt pending state, status
      polling, already-paid conflict handling, and confirmed success.
- [x] Payout-account replacement, payment-method replacement with explicit old
      method preservation, and terminal failed-payout account/retry flow.
- [x] Branded boot skeleton, loading, provider pending, offline disablement,
      empty, retryable error, expired, invalid, unauthorized, wrong-action, and
      safe success states.
- [x] Semantic headings/definition lists, labelled fields, visible focus,
      keyboard controls, 48px actions, reduced-motion behavior, and no
      color-only statuses.
- [x] Compact and fullscreen Playwright fixtures were verified before the
      product-directed removal of all repository test files and test-only
      runtime bridges.
- [x] API compatibility fixes for staged registration, group-member Collage
      reads, and safe external Telegram chat context during creation bootstrap.

### Verification evidence

| Command/evidence                     | Result                                             |
| ------------------------------------ | -------------------------------------------------- |
| `pnpm install --frozen-lockfile`     | Pass — pinned pnpm 11.14.0 lockfile                |
| `pnpm format:check`                  | Pass                                               |
| `pnpm lint`                          | Pass — 27 Turbo tasks                              |
| `pnpm typecheck`                     | Pass — 27 Turbo tasks                              |
| `pnpm test`                          | Pass — Mini App unit 2/2; repository suite passed  |
| `pnpm test:integration`              | Pass — 21 tasks; no skipped integration cases      |
| Database concurrency integration     | Pass — 4/4                                         |
| API workflow integration             | Pass — 12/12                                       |
| Bot/Redis integration                | Pass — 11/11                                       |
| Worker crash/replay integration      | Pass — 10/10                                       |
| Mini App Playwright                  | Pass — 20/20 across compact and fullscreen         |
| `pnpm build`                         | Pass — 16 Turbo tasks; production Next build       |
| `docker compose config --quiet`      | Pass                                               |
| Mini App multi-stage image + smoke   | Pass — ready, page served, non-root UID/GID 1001   |
| Compact/fullscreen visual inspection | Pass — responsive layout and theme tokens verified |

### Deployment gates

- Real Telegram Android, iOS, and Desktop clients must verify host theme
  changes, safe/content-safe-area CSS values, keyboard behavior, provider
  return navigation, and user-gesture fullscreen behavior.
- Monnify card tokenization/direct debit/disbursement and the selected identity
  verification path remain provider/compliance gates; the UI cannot make these
  production-ready by itself.
- Provider return URLs must be configured to reopen the correct opaque Mini App
  action; redirects remain non-authoritative and are followed by server
  verification.

## Milestones 7 and 8 — integration, hardening, Docker, and handoff

Status: implemented and audited on 2026-07-18; live-provider, compliance, and
real-device gates remain open and are listed in `docs/KNOWN_LIMITATIONS.md`.

### Delivered

- [x] Verified the exact-once start, registration notification, payment,
      strict-cycle, reminder, payout, retry, leave-obligation, replacement,
      reconciliation, and pinned-status vertical slices through the database,
      API, bot, worker, Redis, and PostgreSQL integration suites.
- [x] Verified forged/stale Telegram data, replay defenses, webhook
      deduplication, amount/status verification, ambiguous provider outcomes,
      payout deduplication, sensitive-data masking, and object authorization.
- [x] Reviewed Prisma uniqueness/indexing plus raw financial check constraints,
      immutable-ledger triggers, and deferred balanced-ledger enforcement.
- [x] Added provider-reconciliation mismatch handling, Prometheus worker
      metrics, and safe operational alert guidance.
- [x] Reworked the Mini App into the approved flat neo-brutalist visual system:
      Space Grotesk, no gradients, hard shadows, square structure, fixed
      Collage Yellow `#FFD85C` and Blue `#0357EE`, light/dark themes, and
      explicit loading/error/provider-pending states.
- [x] Finished non-root multi-stage images, Compose health dependencies,
      one-shot migrations, production overlay, environment examples, setup,
      Telegram, Monnify, deployment, operations, demo, and limitations docs.
- [x] Remediated the production dependency audit from 15 advisories to zero
      known production vulnerabilities.
- [x] Verified all tests before removing every repository test file, generated
      test report, Playwright configuration, fixture bridge, and test-only
      package as explicitly required by the product owner.

### Verification evidence before test-file removal

| Evidence                      | Result                                  |
| ----------------------------- | --------------------------------------- |
| Full repository unit suite    | Pass — 27 Turbo tasks                   |
| Database integration          | Pass — 4/4, no skips                    |
| API integration/security      | Pass — 12/12, no skips                  |
| Bot/Redis integration         | Pass — 11/11, no skips                  |
| Worker integration/policies   | Pass — 10/10, no skips                  |
| Mini App Playwright           | Pass — 20/20 compact/fullscreen         |
| Responsive browser inspection | Pass — 390×760 and 900×900, no overflow |
| Gradient scan                 | Pass — no CSS gradients                 |
| `pnpm audit --prod`           | Pass — zero known vulnerabilities       |
| Fresh Compose migration       | Pass — all 4 migrations                 |
| Fresh Compose demo seed       | Pass — 1 user and 1 Collage             |
| Compose configuration         | Pass — default and production overlays  |
| No-cache image build          | Blocked — external npm registry timeout |

Post-removal verification is limited to formatting, linting, typechecking,
builds, migrations, dependency audit, Compose validation, and smoke checks by
design. Test evidence above describes the final implementation immediately
before the authorized deletion, not a suite that remains in the repository.

The no-cache image build made no application/Dockerfile compilation failure
visible. Repeated npm metadata and tarball timeouts ended in
`ERR_PNPM_BROKEN_METADATA_JSON` after 9m53s. Dependency stages were then
narrowed to each image's workspace closure and given persistent pnpm-store
caches, frozen integrity-checked lockfile installation, and bounded network
retries. A connected-registry rerun remains a deployment gate and is not
reported as passed.

## Telegram Main Mini App launch correction

Status: implemented and locally verified on 2026-07-19.

- [x] Confirmed through Telegram `getMe` that `@collage_ajo_bot` reports
      `has_main_web_app=true`.
- [x] Confirmed the current Mini App tunnel and API readiness endpoints return
      HTTP 200.
- [x] Changed group status-card buttons to Telegram's official Main Mini App
      URL form: `https://t.me/<bot>?startapp=<opaque-token>&mode=compact`.
- [x] Added a bot startup guard that refuses to send launch buttons when
      BotFather does not report a configured Main Mini App.
- [x] Preserved named Mini App link generation for deliberately named-app
      deployments.
- [x] Verified both Main and named link generation with two temporary unit
      cases, then deleted the temporary test file as required.

The remaining operator step is to ensure BotFather's Main Mini App URL matches
the currently running HTTPS Mini App URL. BotFather configuration is not
mutable or inspectable through the Bot API.

## Telegram repeat-mention and bootstrap diagnostics correction

Status: implemented on 2026-07-19.

- [x] Explicit `/collage`, `/status`, `/rules`, and bot mentions now return a
      visible card even when the canonical pinned card was edited successfully
      or Telegram reports that it was unchanged.
- [x] Removed the temporary client alert that disclosed raw Telegram init data
      and opaque launch tokens.
- [x] Added a real connection-error state so rejected fetches cannot fall
      through to a permanent skeleton.
- [x] Changed local browser API traffic from Android-invalid
      `http://127.0.0.1:4000/v1` to the same-origin `/api/v1` Next.js rewrite.
- [x] Wired the documented `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` policy into
      signature verification; the default is 3600 seconds.
- [x] Added sanitized API-terminal warnings for rejected Telegram bootstrap
      requests. Logs contain status, error code, route, and request ID only.
- [x] Corrected bot-token HMAC validation for Telegram's current init-data
      format: the new third-party `signature` field remains in the HMAC
      data-check string, while only `hash` is removed.
- [x] Verified format, repository-wide lint, repository-wide typecheck, API
      build, bot build, and production Mini App build.
- [x] Verified the public HTTPS Mini App tunnel forwards
      `/api/v1/auth/telegram/bootstrap` to the API and returns a structured
      response with an `x-request-id`.

## Collage creation policy correction

Status: implemented on 2026-07-19.

- [x] Removed client-owned first-cycle date, card setup policy, and card setup
      amount from Collage creation.
- [x] Fixed the server-owned commitment setup charge to NGN 50 (`5000` minor
      units); stale clients sending `0` can no longer override the value.
- [x] The exactly-once final-registration transition now writes the effective
      first-cycle anchor and `STARTING` state in the same serializable
      transaction.
- [x] The Mini App explains automatic start and the fixed setup charge instead
      of presenting editable controls.

## Creator opt-in and member financial-action correction

Status: implemented on 2026-07-19.

- [x] A creator proceeds directly into the complete member opt-in flow after
      creation and registration opening; no identity or financial field is
      inferred from admin status.
- [x] Every Collage view loads the viewer's masked registration projection.
- [x] The dashboard shows Opt in/Continue registration, Add/Update payout
      account, and Add/Continue/Replace payment method from current backend
      state.
- [x] Payment-method setup rejects an existing active method, replacement
      rejects a missing active method, and both reject a second pending
      authorization.
- [x] Added a PostgreSQL partial unique index enforcing one authorizing payment
      method per member while preserving safe active-plus-replacement overlap.
- [x] Payout-account writes now return `added`/`updated` and append a redacted
      audit record transactionally.
- [x] Focused add/replace state tests passed (3 cases) and the temporary test
      file was removed afterward.
- [x] Migration deploy, format check, repository lint/typecheck, database/API
      builds, and production Mini App build passed.

## Payout-position response correction

Status: implemented on 2026-07-19.

- [x] The positions API now returns only members with assigned positive payout
      positions; in-progress registrations with `null` positions no longer
      invalidate the Mini App response.
- [x] When the form's prior/default position is occupied, the Mini App selects
      the first currently available position before submission.

## Optional recurring payment and manual checkout collection

Status: implemented and locally verified on 2026-07-19.

- [x] Registration can complete without card or direct debit after all
      identity, phone, payout, position, schedule, and rule evidence exists.
- [x] Manual-payment email is encrypted at rest and hashed for operational
      lookup; API responses and logs do not expose it.
- [x] The final manual registration participates in the same serializable,
      exactly-once Collage start transition as provider-authorized members.
- [x] A member without an active recurring method becomes
      `MANUAL_PAYMENT_REQUIRED` when their charge is due.
- [x] A deterministic cycle reminder reloads current contribution/provider
      state, excludes unresolved operations, safely mentions all owing members,
      and sends one opaque Pay now Mini App action.
- [x] Opening that action automatically creates or resumes one unresolved
      hosted-checkout attempt; the provider call occurs outside the database
      transaction.
- [x] Unknown provider outcomes remain unresolved for reconciliation; terminal
      initialization failures are recorded and can be retried with a new
      deterministic attempt.
- [x] Redirect return remains pending-only. Verified webhook/status evidence
      alone credits the ledger and emits the concise group paid message.
- [x] Collage start emits a fresh approved status card with a Pay now action.
- [x] API terminal logs trace manual registration and checkout
      start/resume/provider outcome using request, Collage, member,
      contribution, and attempt IDs without email, account, token, or checkout
      URL disclosure.
- [x] Corrected the registered-member PostgreSQL check to accept explicit
      `COLLECTED_UNVERIFIED` identity evidence without fabricating a verification
      timestamp; existing encrypted in-progress identities are backfilled.

## Worker notification and shared-link recovery

Status: implemented and verified against the local PostgreSQL/Redis services on
2026-07-19.

- [x] Found the failed start job in BullMQ with five exhausted attempts and a
      Zod discriminator error for legacy charge preferences.
- [x] Normalized existing preferences and made the Mini App/API write and
      validate the domain schedule shape.
- [x] Corrected first-occurrence scheduling when the preferred time for the
      opening day has already passed.
- [x] Added replay-safe startup recovery for Collages left in `STARTING`.
- [x] The affected Collage recovered to `ACTIVE` and created two cycles.
- [x] Registration completion now writes its notification outbox event in the
      same transaction; a migration recovered the two previously missing
      events.
- [x] Registration notification lookup now resolves the member aggregate,
      safely mentions the member, and reports position/current participant
      count.
- [x] Verified all current outbox events published and the Telegram queue has
      zero failed jobs.
- [x] Shared group links now verify the actual opening user through Telegram
      when local membership is missing instead of depending on the member who
      mentioned the bot.
- [x] Interactive commands and mention responses reply to the triggering
      Telegram message.
- [x] Manual completion now refreshes registration, Collage, and status
      projections and explicitly reports when that member filled the final
      position.
- [x] Administrator onboarding no longer tells an already promoted bot to
      become an administrator; it identifies the missing Pin messages
      permission precisely.
- [x] Confirmed the manually changed `ACTIVE` Collage had zero cycles and its
      original start job had exhausted five attempts.
- [x] Start job IDs now include the outbox event ID, so an explicit recovery
      event cannot be shadowed by an old terminal BullMQ job.
- [x] A repair migration restored the inconsistent Collage to `STARTING`,
      emitted a fresh outbox event, and the worker moved it to `ACTIVE` with two
      cycles.
- [x] A 12-hour collection window whose selected 09:00 time was outside the
      window now schedules collection at cycle opening instead of failing the
      Collage.
- [x] Bot terminal logs now report each successful Telegram notification
      delivery using only safe delivery/type/chat/operation identifiers.

## Active Collage payment-launch response correction

Status: implemented on 2026-07-19.

- [x] Mapped the server-owned Collage contribution amount to the
      `amountPerMemberMinor` field required by the current-cycle DTO.
- [x] Active Collage status no longer fails the Mini App response boundary
      before the manual-payment flow can open.
- [x] The Mini App error state now identifies whether Collage details, cycle
      status, or member registration failed while preserving safe messaging.

## Hackathon reminder console

Status: implemented and statically verified on 2026-07-21.

- [x] Added a single-file HTML control console with inline HTML, CSS, and
      JavaScript and no stored credential.
- [x] Added an opt-in API endpoint protected by a dedicated 32-character
      minimum demo token; when disabled or unauthorized it is indistinguishable
      from a missing route.
- [x] A click reloads eligible cycles from PostgreSQL and queues ordinary
      BullMQ reminder jobs, so the worker still filters pending provider
      operations and owing members before sending one group notification.
- [x] Payout simulation is not part of this console: the existing verified
      contribution event immediately queues cycle readiness evaluation and an
      eligible payout through the transactional outbox.
- [x] Config build plus API lint, typecheck, and build pass.

## Hackathon payout and active Telegram status presentation

Status: implemented on 2026-07-21; full repository verification follows.

- [x] Confirmed payout readiness and initiation already run immediately through
      BullMQ after the final verified contribution; no payout control was added.
- [x] Added an off-by-default Monnify-sandbox-only demo switch that settles
      pending-like transfer results through the normal idempotent success path.
- [x] Simulated settlement is explicitly identified in the append-only audit
      log and is rejected when `MONNIFY_ENV=production`.
- [x] Expanded active group status cards with ledger pot, schedule, current
      cycle, recipient, payout, collection progress, and remaining-cycle data.
- [x] Preserved the existing Telegram action button and used BigInt-safe money
      formatting; Monnify's platform-wide wallet is not presented as a group
      balance.

## Deployed SMSGate diagnostics

Status: implemented on 2026-07-21.

- [x] Render selects `OTP_PROVIDER=smsgate`; credentials and the optional device
      ID are dashboard-managed secrets rather than committed Blueprint values.
- [x] Added an explicit hackathon-only public-cloud override while retaining the
      private-HTTPS production default.
- [x] API startup logs show the selected provider and non-secret topology; OTP
      attempts log accepted, unknown, or failed outcomes without phone numbers,
      OTPs, or credentials.
