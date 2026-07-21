# Testing Strategy and Acceptance Scenarios

## 1. Tooling

Recommended:

- Vitest for unit/package tests;
- Supertest for Express API tests;
- Testcontainers or Compose-backed PostgreSQL/Redis integration tests;
- Playwright for Mini App E2E;
- Undici MockAgent, MSW, or equivalent for provider HTTP fixtures;
- Telegram update fixtures;
- Prisma test migrations;
- fake timers only for pure schedule logic.

## 2. Unit tests

### Domain

- Collage creation validation.
- Rule locking and reconfirmation.
- Daily, weekly, monthly, and yearly cycle generation.
- First/second/third/fourth/last weekday calculations.
- Leap-year and invalid-date policy.
- Preferred charge time inside cycle window.
- Position reservation/expiration.
- Registration state transitions.
- Exactly-once start invariant.
- Strict-cycle readiness.
- Outstanding obligation after early payout.
- Leave-group risk transition.
- Payout retry eligibility.
- Money minor-unit conversion.
- Ledger balancing.

### Security

- valid/invalid/stale Telegram init data;
- valid/invalid webhook signature;
- constant-time comparison;
- encryption round trip;
- tampered ciphertext rejection;
- Pino redaction;
- launch-token expiry/action/chat binding.

### Provider normalization

- every documented payment status;
- mandate statuses;
- transfer statuses;
- timeout/unknown;
- duplicate reference;
- amount/currency mismatch;
- reversal.

## 3. Database/integration tests

- concurrent position selection has one winner;
- duplicate Telegram user rejected;
- participant limit cannot be exceeded;
- concurrent registration completion starts once;
- duplicate webhook processed once;
- duplicate payment confirms one obligation;
- one payout per cycle;
- outbox survives queue publication failure;
- job replay is safe;
- ledger transaction balances;
- rollback leaves no partial state;
- partial unique index enforces one current Collage per chat;
- payment-method replacement preserves old method until new activation;
- payout-account history is preserved.

## 4. API tests

- group admin may create;
- non-admin forbidden;
- invalid/stale Telegram auth;
- every registration resume state;
- bank resolve/masked response;
- card setup initialization;
- direct-debit setup initialization;
- already-paid manual-payment request;
- unresolved payment prevents duplicate;
- expired/wrong launch token;
- object-level authorization;
- recipient-only payout retry;
- OpenAPI generation and route coverage.

## 5. Bot tests

With mocked Telegram API:

- bot added sends creation/status prompt;
- missing pin permission warning;
- mention with no Collage;
- mention during registration;
- mention during active/blocked states;
- direct Mini App links are correct;
- pinned message created then edited;
- hostile names are escaped;
- new-member prompt;
- registered member leave event;
- unregistered member leave ignored;
- notification deduplication;
- Telegram rate-limit retry behavior.

## 6. Worker tests

- charge scheduled at correct preferred time;
- already-paid job exits;
- pending provider attempt is requeried;
- timeout does not create second charge;
- final failure creates manual-payment-required state;
- reminder tags only owing members;
- one reminder message for all owing members;
- cycle is ready only after all paid;
- payout starts once;
- pending transfer is requeried;
- terminal failure exposes retry;
- success completes cycle/opens next;
- final cycle completes Collage;
- stalled-job recovery;
- graceful shutdown.

## 7. Mini App E2E

Use a development/test Telegram bridge that injects signed fixtures only in test mode.

Flows:

1. App boot and theme.
2. Invalid Telegram context.
3. Collage creation.
4. Form validation.
5. Light/dark theme.
6. Identity and phone collection without an OTP verification gate.
7. Bank search/account resolution.
8. Live position conflict.
9. Charge-preference fields per frequency.
10. Rules/consent.
11. Card redirect, pending, success.
12. Direct-debit redirect, pending activation, activated.
13. Registration resume.
14. Already registered/full/closed.
15. Collage status/history.
16. Manual payment pending/success/already paid.
17. Update payout account.
18. Replace payment method.
19. Failed-payout retry.
20. Expired launch link.
21. Offline/retry states.
22. Compact mobile and fullscreen/desktop.
23. Keyboard/accessibility smoke tests.
24. Every critical loading state.

## 8. Provider contract tests

Use documented fixtures without real secrets:

- authentication;
- transaction initialization;
- transaction verification;
- tokenization behavior;
- token charge;
- mandate create/status/debit/debit status;
- banks;
- name enquiry;
- transfer/status;
- webhook normalization.

Fail tests when provider schema changes unexpectedly.

## 9. Security tests

- unauthorized internal API;
- rate limiting/body limits;
- open redirect prevention;
- launch-token brute-force/replay resistance;
- sensitive values absent from logs and client JSON;
- webhook replay;
- queue payload validation;
- SQL injection resistance through parameterized ORM access;
- object-level authorization;
- CSP behavior.

## 10. End-to-end demo scenario

Use a three-member Collage.

### A. Creation and registration

1. Add/tag bot.
2. Create Collage: ₦1,000 weekly, three members, short demo deadlines.
3. Registration message is pinned.
4. Member A submits details and completes card setup.
5. Group gets A's registration once.
6. Member B activates direct debit.
7. Group gets B's registration once.
8. Member C completes setup.
9. Collage starts exactly once.

### B. Collection

1. A's automatic charge succeeds; group is not spammed.
2. B's charge is confirmed failed.
3. Group tags B with Complete Payment button.
4. B pays manually.
5. C succeeds automatically.
6. Cycle becomes ready.

### C. Payout

1. Group sees payout processing for A.
2. Transfer succeeds.
3. Cycle completes.
4. Next cycle opens for B.

### D. Leave-group risk

1. A leaves after receiving payout.
2. Group sees factual obligation/risk message.
3. A remains a Collage member.
4. Future charge remains scheduled.

### E. Failed payout

1. Simulate definite recipient-account failure in a later cycle.
2. Group sees safe failure.
3. Recipient opens Mini App, validates new account, and requests retry.
4. Only one retry transfer is initiated and succeeds.

## 11. Definition of done

- all apps compile;
- no TypeScript errors;
- lint passes;
- unit/integration/E2E critical tests pass;
- Docker Compose starts cleanly;
- migrations work from empty database;
- seed/demo works;
- Swagger is usable;
- no secrets are committed;
- no TODO hides critical financial behavior;
- provider blockers are documented honestly;
- final report lists files, commands, envs, tests, limitations, and security decisions.
