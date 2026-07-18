---
name: collage
description: Use when building or reviewing Collage payments, registration, Telegram, Monnify, ledger, queue, webhook, payout, cycle, or Mini App flows. Enforce official provider docs, state machines, idempotency, privacy, and test evidence.
---

# Collage Skill

## Trigger

Use this skill for changes touching:

- money or ledger;
- Monnify;
- payment methods;
- direct debit;
- card tokenization;
- manual payment;
- payout;
- registration/NIN/phone/bank data;
- Telegram Mini App authentication;
- webhook processing;
- BullMQ financial jobs;
- cycle/default state.

## Required workflow

1. Read the relevant `docs/` files.
2. Identify affected invariants and state machines.
3. Consult current official Monnify/Telegram docs for provider behavior.
4. Write/update tests before claiming completion.
5. Use integer minor units, idempotency, and explicit pending/terminal status.
6. Verify authorization and sensitive-data handling.
7. Check concurrency, replay, timeout, duplicate, and reversal behavior.
8. Update `docs/IMPLEMENTATION_STATUS.md` and provider references.
9. Report commands and evidence.

## Never

- infer a provider payload;
- mark paid from redirect;
- retry an unknown payout outcome;
- expose sensitive data;
- use floats for money;
- write unbalanced ledger entries;
- bypass a failing test;
- use fake provider success outside explicit test adapters;
- claim production readiness without listing provider/compliance blockers.

## Review questions

- Can this operation run twice?
- Can two workers race?
- What happens after a timeout?
- What happens when a webhook is duplicated or out of order?
- What if the process dies immediately after the provider call?
- Is amount and currency verified?
- Is the user authorized for this exact Collage?
- Is any sensitive value logged or serialized?
- Does reversal have a compensating path?
- Can state be reconciled from provider evidence?
