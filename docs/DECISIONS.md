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
