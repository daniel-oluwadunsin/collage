# Collage Engineering Decisions

## D-056 — Groq is a one-shot intent router behind the API boundary

- Date: 2026-07-21
- Decision: the bot sends trusted Telegram update context to a signed internal
  API route. A deterministic lexical pre-router exposes at most five relevant
  local tools to one Groq Chat Completions request. Groq selects exactly one
  tool; strict Zod validation and API authorization precede execution, and a
  deterministic formatter writes the Telegram HTML without a second model
  call. There is no AI retry or fallback provider.
- Reason: language-model convenience must not become an authorization,
  identity, calculation, or money-movement boundary. The model sees neither
  raw Telegram/database identifiers nor financial records. Personal pronouns
  resolve only from the verified sender, and action tools issue only expiring,
  owner-bound Mini App links.
- Design impact: no new Mini App visual system was introduced. Assistant
  buttons open the existing Collage Yellow/Blue, light/dark, compact-safe
  flows with their existing loading, error, and provider-pending states.

## D-057 — GPT-OSS 20B is the initial Groq routing model

- Date: 2026-07-21
- Decision: set `GROQ_MODEL=openai/gpt-oss-20b` in examples, Compose, and the
  Render Blueprint while retaining environment-based override. Keep reasoning
  effort at `low`, required tool choice, parallel calls disabled, and the
  one-request/one-tool invariant.
- Reason: Groq's current official model documentation identifies GPT-OSS 20B
  as an active, cost-efficient, low-latency model supporting local function
  calling and low reasoning effort. This workload is bounded intent selection,
  while all authorization, data access, financial truth, and response wording
  remain deterministic backend responsibilities.

## 2026-07-19 — A null sandbox card token is not an active payment method

Monnify documents that sandbox verification may return a null real card token
and only indicate whether the card would support tokenization in production.
Collage accepts and normalizes that response shape, terminally closes the setup
authorization, and returns the member to payment-method selection. It does not
invent or persist a sandbox token and does not count the member as registered,
because future automatic card collection would be impossible.

## 2026-07-19 — Current group-card actions are reusable and bounded

Group status-card launch tokens are authorization context, not proof that an
operation succeeded. They are reusable for 30 days so closing a Telegram
webview does not consume the current action. Bootstrap still verifies signed
Telegram init data, current membership/role, chat/Collage binding, and action
eligibility on every open. Money-moving endpoints retain their own
idempotency, authorization, and server-side provider verification.

## 2026-07-19 — Card setup completes registration only after verification

Monnify redirect and webhook acknowledgement never mark registration complete.
The API polling path and durable webhook worker both requery Monnify by the
stored payment reference, verify exact setup amount/currency and reusable card
token evidence, activate the payment method idempotently, and invoke the shared
registration-completion invariant. An authorizing registration exposes only
its opaque authorization ID so a reopened Mini App can safely resume polling.

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
- Status: superseded by D-045 for registration state; live identity
  verification remains a production compliance gate.
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

## D-032 — Registration writes follow the visible step order

Superseded for phone verification by D-058; the staged-write and position
reservation decisions remain active.

- Date: 2026-07-18
- Decision: the existing registration-details endpoint accepts explicit
  `IDENTITY` and `PREFERENCES` stages in addition to its backwards-compatible
  combined payload. Identity creates the nullable-position member draft before
  phone OTP; preferences later reserves the real position under the existing
  concurrency invariant.
- Reason: the approved Mini App verifies phone before payout-position choice.
  Reserving a fabricated position or retaining NIN only in browser memory
  across unrelated provider steps would be unsafe.

## D-033 — Mini App server state is parsed and provider success is polled

- Date: 2026-07-18
- Decision: every Mini App response crosses a Zod boundary. Provider redirects
  persist only an opaque authorization/attempt ID in session storage, then use
  TanStack Query polling with terminal stop conditions. The browser never
  stores NIN, phone, or account numbers and never treats a redirect as
  registration, payment, mandate, or payout success.
- Reason: client navigation is not financial evidence. Strict response parsing
  and server-owned status make unknown outcomes explicit and replay safe.

## D-034 — The Telegram E2E bridge is compile-time gated

- Date: 2026-07-18
- Status: superseded by D-038 after verification.
- Decision: deterministic Telegram/API fixtures are available only when
  `NEXT_PUBLIC_ENABLE_TEST_BRIDGE=true` at build/start time and the URL also
  requests `bridge=1`. Production configuration must leave this false.
- Reason: Playwright needs compact/fullscreen launch, provider-pending, and
  terminal-state fixtures without signing real init data or calling Telegram
  or Monnify. A two-part gate prevents an ordinary query parameter from
  enabling fixtures.

## D-035 — Shared-database integration suites run serially

- Date: 2026-07-18
- Decision: the root integration task limits Turborepo to one task at a time
  and explicitly passes both test database and test Redis URLs. Individual
  packages may still exercise concurrency inside their own isolated test
  cases.
- Reason: database, API, and worker integration suites intentionally truncate
  their fixture schema. Running those independent suites against the same test
  database concurrently creates cross-suite deadlocks and false failures; it
  does not test an application invariant.

## D-036 — Mini App image builds trust the reviewed frozen lockfile

- Date: 2026-07-18
- Decision: the Mini App Docker build uses pnpm's `--trust-lockfile` together
  with `--frozen-lockfile`, exact dependency versions, recorded integrity
  hashes, a filtered workspace install, and a persistent store cache.
- Reason: the repository lockfile is the reviewed dependency-resolution
  artifact. Re-fetching registry metadata for every locked workspace entry
  adds a second mutable network dependency to image builds without changing
  resolution; tarball integrity verification and the frozen lockfile remain
  enforced.

## D-037 — The Mini App uses flat accountable neo-brutalism

- Date: 2026-07-18
- Decision: the Mini App uses Space Grotesk, square geometry, thick borders,
  hard offset shadows, and flat semantic color blocks. Gradients are forbidden
  in decoration, progress, text, skeletons, and generated textures. Collage
  Yellow `#FFD85C` and Collage Blue `#0357EE` remain unchanged.
- Reason: this applies the supplied replacement design language while keeping
  the established brand, Telegram constraints, dark mode, accessible states,
  and the clarity required for financial outcomes.

## D-038 — Tests are verified and then removed

- Date: 2026-07-18
- Decision: all unit, integration, Playwright, fixture-bridge, generated-report,
  and test-package files are deleted only after the full suite and critical
  integrations pass. The exact evidence is retained in
  `docs/IMPLEMENTATION_STATUS.md`.
- Reason: the product owner explicitly required that no test files remain.
  Preserving evidence while removing executable tests is the narrowest way to
  follow that direction without falsely claiming unverified behavior.

## D-039 — Group buttons launch the configured Main Mini App

- Date: 2026-07-19
- Decision: bot status-card buttons use Telegram's Main Mini App direct-link
  form, `https://t.me/<bot>?startapp=<opaque-token>&mode=compact`. Bot startup
  requires Telegram `getMe` to report `has_main_web_app=true`. The shared link
  helper retains explicit named-app support for deployments that deliberately
  select it, but Collage's bot does not use that path.
- Reason: the deployed Collage bot is configured as a Main Mini App. Supplying
  the bot username again as a named-app path can resolve to the bot chat when
  BotFather's named-app configuration differs. Failing startup on missing Main
  Mini App configuration is safer than sending creation buttons that silently
  do not launch.

## D-040 — Local Telegram Mini App API calls use a same-origin rewrite

- Date: 2026-07-19
- Decision: the browser uses `/api/v1`, and Next.js rewrites it to the
  server-only `API_INTERNAL_URL`. Production may still compile a dedicated
  HTTPS API origin when that topology is intentional.
- Reason: `127.0.0.1` in an Android Telegram WebView means the Android device,
  not the development Mac. A same-origin HTTPS request also avoids requiring a
  third tunnel and keeps API diagnostics in the normal API terminal without
  exposing request bodies, Telegram init data, or launch tokens.

## D-041 — Registration completion owns start time and card setup amount

- Date: 2026-07-19
- Decision: Collage creation no longer accepts a first-cycle date, card setup
  policy, or card setup amount. The API fixes card setup to a NGN 50 (`5000`
  minor-unit) commitment charge. The transaction that changes the Collage from
  `REGISTRATION_OPEN` to `STARTING` also sets `firstCycleStartAt` to that
  transaction's timestamp.
- Reason: all participant slots being fully registered is the MVP start
  condition. Keeping the amount and effective start anchor server-owned
  prevents client tampering, past-dated cycles, and a race between final opt-in
  and worker scheduling.

## D-042 — Creator opt-in and financial actions use member-scoped server state

- Date: 2026-07-19
- Decision: after creation and registration opening, the creator enters the
  ordinary resumable member-registration flow instead of receiving a
  privileged or partially populated membership. Every Collage view fetches the
  viewer's registration projection. UI labels and routes distinguish payout
  add/update and payment-method add/pending/replace. Setup and replacement
  endpoints enforce those states, and PostgreSQL permits at most one
  `AUTHORIZING` payment method per member.
- Reason: group administration is not evidence of identity, payout ownership,
  recurring-payment consent, or provider authorization. Server-derived state
  prevents misleading replacement actions and modified clients from bypassing
  safe payment-method cutover.

## D-043 — Recurring payment setup is optional at registration

- Date: 2026-07-19
- Decision: a member may complete registration after verified identity, phone,
  payout account, payout position, schedule, current rules/consent, and a
  payment email, without activating a card token or direct-debit mandate. The
  email is encrypted at rest and used only to initialize that member's manual
  hosted checkout. The member remains eligible for the exactly-once final-slot
  start transition.
- Reason: opting into the group and supplying a payout destination must not be
  coupled to recurring-provider availability. This does not weaken collection
  evidence: manual members are never marked paid from registration or browser
  redirect.

## D-044 — Manual contributions use one source-of-truth group reminder

- Date: 2026-07-19
- Decision: when collection reaches a member without an active recurring
  method, the worker transactionally marks manual payment required and emits an
  outbox event. A deterministic, briefly delayed cycle job reloads all owing
  members and sends one Telegram message with safe mentions and one
  API-generated opaque Pay now action. The Mini App initializes checkout
  automatically for the authorized member who opens it. Only verified Monnify
  evidence posts the member-paid acknowledgement.
- Reason: grouping avoids notification floods, source-of-truth reloads avoid
  stale mentions, and a server-created checkout preserves authorization,
  idempotency, amount ownership, and webhook-confirmed payment.

## D-045 — Collected NIN is not represented as verified identity

- Date: 2026-07-19
- Decision: until an approved live identity provider is enabled, registration
  stores encrypted NIN with identity mode `COLLECTED_UNVERIFIED` and a null
  verification timestamp. The registered-member database constraint requires
  this explicit mode or a real verification mode with a non-null verification
  timestamp. Existing in-progress registrations with encrypted NIN are safely
  backfilled to the explicit unverified mode.
- Reason: the registration journey must distinguish collecting required
  identity data from externally verifying it. Live identity verification and
  the resulting compliance policy remain a production gate.

## D-046 — Charge preferences use the domain schedule shape at the API boundary

- Date: 2026-07-19
- Decision: registration accepts only the domain-discriminated charge
  preference (`kind`, `hour`, `minute`, plus frequency-specific fields). The
  Mini App converts its form values before submission, the API rejects a
  frequency mismatch, and a migration normalizes legacy records. If today's
  preferred time has passed, the first valid occurrence inside the cycle is
  used.
- Reason: storing a presentation shape such as `{time: "09:00"}` deferred an
  invalid schedule until the durable start job and exhausted its retries.
  Boundary validation prevents a Collage from entering `STARTING` with data the
  worker cannot execute.

## D-047 — Group launch tokens verify the opening user at bootstrap

- Date: 2026-07-19
- Decision: status-card launch tokens remain persistent and bound to the
  group/Collage/action, not to the member who mentioned the bot. When the
  opening user is absent from the local membership projection, the API calls
  Telegram `getChatMember`, fails closed on error/non-membership, and refreshes
  the local projection before authorizing the action.
- Reason: Telegram may not have delivered historic `chat_member` updates, so
  limiting a group button to previously observed users incorrectly makes a
  shared button appear user-bound. Possession of a forwarded opaque token alone
  is still insufficient.

## D-048 — Interactive bot responses reply to their triggering message

- Date: 2026-07-19
- Decision: `/collage`, `/status`, `/rules`, `/help`, and mention-triggered
  responses use Telegram `reply_parameters` with
  `allow_sending_without_reply=true`. Proactive financial notifications remain
  standalone group messages.
- Reason: the reply relationship makes the bot's response attributable in a
  busy group without coupling durable notifications to an ephemeral source
  message.

## D-049 — Registration completion refreshes every current-state projection

- Date: 2026-07-19
- Decision: after manual registration completes, the Mini App invalidates the
  member registration, Collage, status, and completion projections. The final
  member receives an explicit “starting the first cycle” state from the
  transaction response while durable worker processing moves the Collage from
  `STARTING` to `ACTIVE`.
- Reason: refreshing only the completion query left the surrounding Collage
  state stale even though the exactly-once database transition and outbox event
  had succeeded.

## D-050 — Start retries are event-scoped and short windows charge at opening

- Date: 2026-07-19
- Decision: every `collage.start.requested` outbox event receives a distinct
  deterministic BullMQ job ID containing the event ID. If the next preferred
  charge occurrence is later than the cycle deadline, the contribution is
  scheduled at cycle opening. A repair migration returns fully registered
  `ACTIVE` Collages with zero cycles to `STARTING` and emits a new durable start
  request.
- Reason: a permanently failed BullMQ job must not block a later explicit
  recovery event. A charge-time preference is best effort and cannot prevent
  the required immediate start when the remaining collection window is shorter
  than the time until that preference.

## D-051 — Active-cycle APIs return presentation DTOs, not raw cycle rows

- Date: 2026-07-19
- Decision: the status API explicitly maps the Collage contribution amount to
  `currentCycle.amountPerMemberMinor`. The Mini App continues to reject
  responses that do not satisfy its Zod contract.
- Reason: `Cycle.expectedAmountMinor` is the full group pot and cannot be used
  as the member's payable amount. Returning the raw Prisma cycle omitted the
  per-member amount and made every active status response invalid.

## D-052 — Render demo shares one scale-to-zero container

- Date: 2026-07-19
- Decision: the free Render demo runs API, bot, worker, Mini App, and a
  path-routing gateway as separate processes in one Docker Web Service at
  `https://collage-apiconf.onrender.com`. PostgreSQL and Redis-compatible Key
  Value remain managed external resources. Provider calls remain disabled by
  default, migrations complete before processes start, and any critical child
  exit terminates the whole container.
- Reason: Render does not offer free background workers, and multiple
  always-running free web services exceed the shared free-hour allowance.
  Co-location wakes the worker with the user-facing demo while preserving
  application code boundaries. Scale-to-zero, non-durable free queues, and
  expiring unbacked free PostgreSQL make this explicitly unsuitable for real
  money or production data.

## D-053 — Demo reminders use the real durable worker path

- Date: 2026-07-21
- Decision: an explicitly enabled, token-protected demo endpoint queues one
  normal reminder job for every collecting or overdue cycle with unpaid
  contributions. The self-contained static console accepts the API origin and
  token at runtime and does not persist either value. No payout trigger is
  exposed because verified final payment already causes immediate cycle
  evaluation and payout initiation through the outbox and worker.
- Reason: hackathon timing needs an operator-controlled reminder without
  bypassing source-of-truth checks, notification deduplication, or financial
  state machines. Keeping payout automatic avoids a second money-moving path.

## D-054 — Sandbox payout pending states may auto-settle only in hackathon mode

- Date: 2026-07-21
- Decision: `HACKATHON_DEMO_MODE=true` may be used only with
  `MONNIFY_ENV=sandbox`. In that mode, a transfer result classified as pending,
  in progress, or pending authorization is passed through the existing
  idempotent payout-success ledger, cycle, outbox, notification, and next-cycle
  path and is recorded in the audit log as simulated. The default remains
  disabled and the configuration is rejected for Monnify production.
- Reason: the hackathon merchant flow cannot complete payout MFA unattended.
  A conspicuous sandbox-only switch supports the demo without changing live
  provider classification or creating a second payout transition path.

## D-055 — SMSGate public cloud requires an explicit deployed-demo override

- Date: 2026-07-21
- Decision: production-mode processes continue to require private HTTPS
  SMSGate by default. A hackathon deployment may explicitly set
  `SMSGATE_ALLOW_PUBLIC_CLOUD_IN_PRODUCTION=true`; startup and OTP-send logs
  expose only topology, operation, safe provider failure metadata, and the OTP
  challenge ID. Credentials, phone numbers, and OTP content remain redacted.
- Reason: Render correctly runs with `NODE_ENV=production`, while the demo uses
  SMSGate public cloud. Making the exception explicit preserves the secure
  default and makes a missing provider switch or failed cloud request visible.

## D-058 — Phone OTP is not an opt-in invariant

- Date: 2026-07-21
- Decision: Collage registration still collects and encrypts a phone number for
  direct-debit provider use, but no longer requires a successful OTP challenge.
  Existing encrypted phone evidence, OTP history, SMSGate integration, and
  routes are retained for compatibility. Identity, verified payout account,
  unique position, schedule, current-rule acceptance, recurring-payment
  consent, and the selected payment-mode rules remain mandatory.
- Reason: phone possession verification adds unnecessary friction to group
  opt-in and is not evidence that settles a contribution or payout. Removing it
  from registration must not weaken the financial and position invariants or
  destroy already collected sensitive evidence.
