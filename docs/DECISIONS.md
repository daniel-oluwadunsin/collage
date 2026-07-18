# Collage Engineering Decisions

## D-001 — Node and package manager pin

- Date: 2026-07-18
- Decision: use Node `24.18.0` and pnpm `11.14.0`.
- Reason: Node 24 is the active LTS line; exact pins make local and image builds
  reproducible. The lockfile is shared and workspace dependencies are injected
  for deployable application bundles.

## D-002 — Canonical design document

- Date: 2026-07-18
- Decision: `docs/DESIGN.md` is canonical.
- Reason: the repository supplied `docs/03_DESIGN.md`, while the milestone and
  root instructions explicitly refer to `docs/DESIGN.md`. The numbered file
  remains as the stable reading-order entry and compatibility reference.

## D-003 — Milestone 1 health semantics

- Date: 2026-07-18
- Decision: all applications expose `/health/live` and `/health/ready`, but the
  current readiness endpoints report process/configuration readiness only.
- Reason: database and Redis clients are intentionally not wired until the
  foundation/database milestone. Production dependency readiness must replace
  these shallow checks before launch.

## D-004 — Empty financial schema

- Date: 2026-07-18
- Decision: create the Prisma package and datasource configuration without
  business models or a fake initial migration.
- Reason: Milestone 1 explicitly excludes business features. Financial tables,
  constraints, indexes, locks, and migrations must arrive together in Prompt 2
  after focused invariant review.

## D-005 — Provider adapter remains disabled

- Date: 2026-07-18
- Decision: `@collage/monnify` exposes only typed boundary vocabulary and an
  explicit disabled marker.
- Reason: no provider behavior is needed in Milestone 1. Inventing requests,
  statuses, signature handling, or success fixtures would violate the provider
  documentation rule and create unsafe placeholder architecture.

## D-006 — Package-boundary enforcement

- Date: 2026-07-18
- Decision: ESLint prevents infrastructure imports in `domain`, database and
  Monnify imports in `bot`, server packages in `mini-app`, and UI imports in
  `api`.
- Reason: these rules encode the architecture where engineers receive immediate
  feedback, before a dependency leak becomes established.

## D-007 — UI state page is non-operational

- Date: 2026-07-18
- Decision: the Mini App root is a state/component boot page with a local theme
  selector only.
- Reason: it proves design tokens, responsive behavior, and state language
  without simulating payment, registration, or provider success.

## D-008 — No Zustand in Milestone 1

- Date: 2026-07-18
- Decision: do not install Zustand yet.
- Reason: the architecture permits it only when cross-route ephemeral state is
  clearly justified. The boot page does not need a global client store.

## D-009 — PostgreSQL is a second invariant boundary

- Date: 2026-07-18
- Decision: encode concurrency-sensitive and financial invariants in raw SQL
  constraints, partial indexes, deferred triggers, and append-only triggers in
  addition to domain/repository checks.
- Reason: application validation alone cannot arbitrate races or protect
  financial history from another code path.

## D-010 — One current Collage excludes drafts and terminal history

- Date: 2026-07-18
- Decision: the one-current-Collage partial index covers `REGISTRATION_OPEN`,
  `STARTING`, `ACTIVE`, `BLOCKED`, and `SUSPENDED`; it excludes `DRAFT`,
  `COMPLETED`, and `CANCELLED`.
- Reason: a chat may retain drafts and terminal history, but cannot have two
  operational Collages.

## D-011 — BigInt crosses APIs as a decimal string

- Date: 2026-07-18
- Decision: store and calculate money as BigInt minor units and serialize every
  BigInt DTO field as a base-10 string.
- Reason: JSON has no BigInt representation and JavaScript numbers cannot
  losslessly represent all PostgreSQL `BIGINT` values.

## D-012 — Calendar schedule overflow is constrained

- Date: 2026-07-18
- Decision: daily/weekly schedules add fixed calendar units in the Collage
  timezone; monthly/yearly schedules preserve local wall time and constrain
  invalid dates to the last valid day.
- Reason: this makes dates such as January 31 and February 29 deterministic
  without silently shifting into a later month.

## D-013 — Last registration emits one start request

- Date: 2026-07-18
- Decision: under a Collage row lock, the last valid registration changes
  `REGISTRATION_OPEN` to `STARTING`, locks rules, records `startedAt`, and writes
  one versioned outbox event in the same transaction.
- Reason: generating cycles or performing side effects inline would enlarge the
  contention window. The unique state update and outbox key make start
  exactly-once at the aggregate boundary while downstream delivery remains
  at-least-once and idempotent.

## D-014 — Safe payment-method cutover

- Date: 2026-07-18
- Decision: an authorizing replacement does not deactivate the current method.
  After credential activation and only when no charge is unresolved, one
  serializable transaction marks the old method `REPLACED` before activating
  the new method.
- Reason: failed setup must not leave a member without a usable method, and the
  partial index prevents two active methods.

## D-015 — Versioned authenticated encryption

- Date: 2026-07-18
- Decision: sensitive values use AES-256-GCM envelopes containing version and
  key ID, with entity/field context supplied as additional authenticated data.
  Equality lookup uses a separate keyed SHA-256 hash.
- Reason: random nonces prevent ciphertext correlation, AAD prevents
  cross-field substitution, key IDs permit rotation, and keyed hashes avoid
  exposing low-entropy identifiers to offline rainbow tables.

## D-016 — Internal requests and launch tokens are replay resistant

- Date: 2026-07-18
- Decision: internal service requests sign method, path, body hash, service,
  timestamp, and random nonce; verification requires a replay-store claim.
  Mini App launch tokens contain 256 random bits and only keyed hashes are
  persisted.
- Reason: bearer reuse and database token disclosure should not grant durable
  access. Production must back the replay-store interface with shared Redis.

## D-017 — Queue IDs contain no business identifiers

- Date: 2026-07-18
- Decision: deterministic BullMQ IDs combine a safe operation name with a
  truncated SHA-256 digest of canonical identity parts and never use `:`.
- Reason: BullMQ reserves colons in custom IDs, and raw references can leak
  provider or customer identifiers into queue metadata.

## D-018 — Monnify behavior is isolated behind a typed adapter

- Date: 2026-07-18
- Decision: the API depends on a typed provider port implemented by the
  Monnify adapter. The adapter owns authentication caching, exact decimal
  serialization, endpoint paths, response validation, documented status maps,
  and safe error classification.
- Reason: provider payloads and statuses must not leak into domain or route
  code. Unknown statuses remain unknown, and timeout outcomes are never
  converted to success or blindly retried.

## D-019 — Webhook receipt and processing are separate transactions

- Date: 2026-07-18
- Decision: production Monnify webhooks require the documented source IP and
  HMAC-SHA512 over the exact raw bytes. Sandbox accepts an unsigned webhook only
  when an explicit environment switch is true. Valid receipts are encrypted,
  deduplicated by raw-body fingerprint, and paired with an outbox event in one
  serializable transaction before acknowledgement.
- Reason: request handlers must acknowledge quickly without performing
  financial work, while the inbox/outbox transaction prevents an accepted
  webhook from being lost before asynchronous processing.

## D-020 — Current Telegram administration is freshness-bound

- Date: 2026-07-18
- Decision: administrative API actions require an active Telegram membership
  with `ADMINISTRATOR` or `CREATOR` role observed within five minutes. A
  creator ID stored on a Collage is not continuing authorization.
- Reason: Telegram roles can change after Collage creation. The API must use
  current synchronized group authority and fail closed when the bot view is
  stale.

## D-021 — Provider setup responses are durably idempotent

- Date: 2026-07-18
- Decision: checkout URLs are encrypted at rest against the authorization or
  payment-attempt context. Repeating a card-setup or manual-checkout
  idempotency key returns the same safe response without a second Monnify call.
- Reason: a client retry after a lost response must not initialize another
  charge. Checkout URLs are operational credentials and cannot be logged or
  stored in plaintext.

## D-022 — Identity production enablement fails closed

- Date: 2026-07-18
- Decision: identity remains `IDENTITY_PENDING`; no sandbox NIN response or
  mock success completes registration.
- Reason: Monnify documents NIN verification as live-only and merchant
  enablement is not confirmed. Selecting an identity vendor changes privacy,
  compliance, and delivery behavior and requires product-owner approval.

## D-023 — Provider references are not globally unique event IDs

- Date: 2026-07-18
- Decision: retain the Monnify reference on webhook rows for lookup, but dedupe
  exact deliveries with the provider/environment/fingerprint unique key.
- Reason: Monnify event envelopes do not document a distinct immutable event ID;
  the same transaction reference can legitimately appear in later event types.
  Treating that reference as globally unique could discard a reversal.

## D-024 — SMSGate owns outbound OTP transport

- Date: 2026-07-18
- Decision: Collage sends registration OTPs through a typed SMSGate adapter
  using an Android device. JWT is the cloud/private default; the documented
  Basic-auth `/message` API is used for local-server development. Each OTP
  challenge UUID is the
  provider message ID, recipients must be E.164, and provider `202` remains
  queued—not delivered.
- Reason: caller-supplied IDs make the single authentication-recovery replay
  deterministic. A send timeout or `5xx` remains an unknown outcome and is
  never retried automatically; the corresponding challenge remains usable in
  case the SMS arrives. Official SMSGate guidance classifies its public cloud
  as unsuitable for sensitive data, so production configuration rejects the
  public-cloud host and non-HTTPS endpoints; production should use a private
  SMSGate server.

## D-025 — The Telegram bot consumes presentation contracts, not financial data

- Date: 2026-07-18
- Decision: `apps/bot` may call only the replay-resistant internal Telegram
  API and consume validated `telegram-notifications` jobs. Status, rules,
  registered-member leave notices, and notification text arrive as approved
  HTML presentation models. The bot owns Telegram permission checks, escaping
  of Telegram-originated names, direct-link materialization, delivery, and pin
  maintenance; it does not import the database, Monnify, or SMSGate packages.
- Reason: financial facts and authorization policy belong to the API. Keeping
  them out of the bot prevents stale Telegram messages or compromised bot
  credentials from becoming a money-movement authority.

## D-026 — Telegram delivery is bounded and deduplicated

- Date: 2026-07-18
- Decision: startup registers exactly `message`, `my_chat_member`, and
  `chat_member`; webhook requests require Telegram's secret-token header.
  Bot API flood responses use the documented `retry_after` with a bounded retry
  count and maximum inline delay. Notification jobs claim their delivery UUID
  atomically in Redis, release the claim after a failed call, and retain a
  completed marker for 90 days. BullMQ remains responsible for bounded
  exponential retry.
- Reason: Telegram retries unsuccessful webhooks and does not offer an
  idempotency key for `sendMessage`. A durable Redis claim prevents concurrent
  and routine replay duplicates without pretending that an external send and a
  local acknowledgement can be one atomic transaction. A process loss after
  Telegram accepts a send but before the completed marker is written remains an
  unavoidable ambiguous edge and must not be described as exactly-once.

## D-027 — Provider side effects use persist-call-poll

- Date: 2026-07-18
- Decision: an automatic charge or payout attempt and its deterministic caller
  reference are committed before the provider call. A timeout, process loss, or
  otherwise unknown response changes the operation to `UNKNOWN` and schedules a
  status query for that original reference. It never creates or submits a new
  provider operation while the original is unresolved.
- Reason: a database transaction cannot atomically commit with Monnify. This
  pattern makes replay safe without pretending distributed exactly-once
  delivery is available.

## D-028 — Readiness is a three-way financial proof

- Date: 2026-07-18
- Decision: payout creation requires every cycle contribution to be `PAID`,
  confirmed contribution totals to equal the expected amount, and the
  append-only `COLLAGE_POT` balance to equal the same amount under a cycle lock.
  A successful, amount/reference-matched transfer debits the pot before the
  cycle completes. Only then may the next scheduled cycle open.
- Reason: database state, provider verification, and ledger state must agree
  independently before custody moves.

## D-029 — Direct-debit daily limits are enforced conservatively

- Date: 2026-07-18
- Decision: Collage permits at most two mandate debit submissions in any rolling
  24-hour window and delays another attempt until the oldest submission leaves
  that window. Failures remain bounded by the overall automatic-attempt policy.
- Reason: Monnify documents a two-debits-per-day NIP limit but does not specify
  a timezone/day-boundary contract. A rolling window is stricter and therefore
  safer than assuming a reset boundary.

## D-030 — Recurring card initialization retains only encrypted email

- Date: 2026-07-18
- Decision: the customer email used for card setup is AES-256-GCM encrypted on
  the payment method and reused only to initialize later token-charge
  transactions. It is never included in DTOs, logs, audit metadata, or jobs.
- Reason: Monnify binds a card token to the same email and requires a newly
  initialized transaction for a charge. The worker needs that value while
  preserving Collage's privacy boundary.

## D-031 — Outbox events drive queues and notifications

- Date: 2026-07-18
- Decision: state changes, audit records, and outbox events commit together.
  The outbox publisher uses deterministic BullMQ job IDs and marks an event
  published only after all derived financial and Telegram jobs are accepted.
  Reconciliation and stale-operation schedulers are BullMQ Job Schedulers, not
  process-local timers.
- Reason: an application crash or Redis outage must leave a replayable database
  fact. Deterministic queue identity makes duplicate publication harmless.
