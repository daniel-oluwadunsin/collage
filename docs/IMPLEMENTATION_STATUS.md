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

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass |
| `pnpm db:generate` | Pass — Prisma 7.8 client generated |
| `pnpm format:check` | Pass |
| `pnpm lint` | Pass — 19 Turbo tasks |
| `pnpm typecheck` | Pass — 19 Turbo tasks |
| `pnpm test` | Pass — API, bot, and worker health suites |
| `pnpm test:integration` | Pass — application health integration suites |
| `pnpm test:e2e` | Pass; visual browser evidence recorded separately below |
| `pnpm build` | Pass — 15 Turbo build tasks |
| Application Docker image builds | Pass — API, bot, worker, Mini App |
| `docker compose config --quiet` | Pass |
| Docker Compose smoke | Pass — all six long-running services healthy |

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

Prompt 2 may begin when the verification table is green. It should implement the
database/foundation milestone only, preserve the package boundaries, and treat
every financial invariant in the architecture and risk documents as binding.
