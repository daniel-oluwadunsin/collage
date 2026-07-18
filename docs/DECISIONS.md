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
