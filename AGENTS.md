# AGENTS.md — Collage

## Mission

Build Collage, a Telegram-native Ajo/group-contribution platform, according to the documents in `docs/`.

This is fintech software. Work like a staff/principal engineer who expects every payment, payout, webhook, state transition, and log line to be reviewed after a dispute.

## Mandatory reading order

Before implementation:

1. `docs/01_PRD.md`
2. `docs/02_ARCHITECTURE.md`
3. `docs/03_DESIGN.md`
4. `docs/04_MONNIFY_INTEGRATION.md`
5. `docs/05_SECURITY_AND_RISK.md`
6. `docs/06_API_EVENTS_AND_JOBS.md`
7. `docs/07_ENV_DOCKER_RUNBOOK.md`
8. `docs/08_TESTING_AND_ACCEPTANCE.md`

Maintain `docs/IMPLEMENTATION_STATUS.md` while working.

## First action

Before writing feature code:

1. inspect the repository;
2. inspect `docs/DESIGN.md` or the supplied design document;
3. ensure it reflects Collage Yellow `#FFD85C`, Collage Blue `#0357EE`, dark/light themes, Telegram webview constraints, and complete loading/error/provider-pending states;
4. document any deviation before proceeding.

## Stack constraints

### Server applications

- Node.js active LTS;
- TypeScript strict mode;
- Express, not NestJS;
- PostgreSQL;
- Prisma;
- Redis;
- BullMQ;
- Pino;
- Swagger/OpenAPI;
- Docker.

### Mini App

- Next.js App Router;
- TypeScript;
- Tailwind CSS;
- TanStack Query;
- React Hook Form;
- Zod;
- Telegram Mini Apps SDK;
- Framer Motion;
- Lucide React;
- shadcn/ui;
- Zustand only when clearly justified.

### Repository

- pnpm;
- Turborepo;
- applications: `api`, `bot`, `worker`, `mini-app`;
- no central admin application.

## Provider documentation

Always consult current official documentation before implementing provider-specific behavior.

For Monnify, use only official documentation under `https://developers.monnify.com/` as the source of truth. Do not infer endpoints, payloads, statuses, signature behavior, retry rules, or feature availability.

For Telegram, use official `https://core.telegram.org/` documentation.

Record the exact pages consulted in `docs/PROVIDER_REFERENCES.md` with the date.

## Financial invariants

Never:

- use floating-point money arithmetic;
- mark paid from a client redirect;
- blindly retry a timeout;
- retry a payout while its original status is unresolved;
- trust an unverified webhook;
- expose card token, NIN, full account, or phone;
- calculate a group's pot from the complete Monnify wallet;
- allow a creator to mark someone paid;
- open the next cycle before all contributions and payout success;
- mutate ledger history;
- silently swallow reconciliation mismatch.

Use:

- integer minor units;
- append-only balanced ledger;
- idempotency keys;
- unique constraints;
- locks or serializable transactions;
- server-side provider verification;
- transactional outbox;
- explicit state machines;
- compensating entries.

## Code quality

- no `any` unless isolated, justified, and documented;
- no unsafe non-null assertions in financial paths;
- no giant route handlers;
- pure domain functions;
- typed provider adapters;
- Zod validation at external boundaries;
- centralized errors;
- dependency injection through factories/interfaces, not a framework container;
- small modules with explicit responsibility;
- no duplicated request schemas;
- no raw Prisma models sent to clients;
- no unbounded retry loops;
- graceful shutdown;
- health/readiness endpoints;
- exhaustive provider status mapping.

## Clarifications

Ask the product owner when a missing answer materially changes:

- custody/settlement behavior;
- card setup/deposit policy;
- live Monnify feature availability;
- identity/OTP production provider;
- payout MFA model;
- legal/compliance behavior;
- a financial invariant.

Do not interrupt for minor naming/style choices. Choose a reasonable option, record it in `docs/DECISIONS.md`, and continue.

If a material answer is unavailable, choose the safest non-money-moving behavior and mark the feature blocked rather than faking success.

## Testing

Do not claim completion without executing and reporting:

- format check;
- lint;
- typecheck;
- unit tests;
- database/API/bot/worker integration tests;
- build;
- critical Playwright flow where the environment permits;
- Docker Compose smoke test.

## Final response

At the end, provide:

- architecture summary;
- file/change summary;
- all environment variables;
- local setup;
- Docker commands;
- Telegram setup;
- Monnify setup and enablement requirements;
- webhook setup;
- tests and results;
- end-to-end demo steps;
- known limitations;
- open compliance/provider questions;
- production-readiness checklist.

ALL UNIT TESTS SHOULD BE DELETED AFTER VERIFIED
