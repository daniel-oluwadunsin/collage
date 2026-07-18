# Operations Runbook

## Health and metrics

- API: `/health/live`, `/health/ready`
- Bot: `/health/live`, `/health/ready`
- Worker: `/health/live`, `/health/ready`, `/metrics`
- Mini App: `/health/live`, `/health/ready`

Alert safely on readiness failure, queue failures/stalls, old unpublished
outbox rows, provider operations pending beyond policy, reconciliation mismatch,
blocked cycles, repeated webhook verification failures, and payout states that
need manual MFA. Alerts contain opaque IDs and safe references only.

## Unknown payment or payout

1. Do not create a replacement provider operation.
2. Locate the original internal operation and provider reference.
3. Requery provider status and inspect webhook inbox history.
4. Compare reference, amount, currency, member/recipient, Collage, and cycle.
5. Leave the operation pending until definite success, failure, reversal, or
   documented expiry.

## Reconciliation mismatch

1. Stop payout progression for the affected cycle.
2. Compare paid contribution rows, confirmed totals, ledger entries, provider
   verification, and provider wallet/settlement evidence.
3. Preserve the mismatch audit/outbox event.
4. Correct only with an approved compensating ledger transaction.
5. Never edit or delete ledger history.

## Duplicate-payout concern

Disable provider calls for the worker if necessary, keep the original attempt
pending, query its provider reference, verify the one-payout-per-cycle and
one-unresolved-attempt constraints, and escalate with the audit timeline.

## Secret or token leak

Disable the affected integration, rotate the secret, invalidate sessions where
applicable, inspect redacted logs and audit history, and document scope. Never
paste NIN, phone, account number, card token, mandate credential, or OTP into an
incident channel.

## Graceful shutdown

Stop accepting new HTTP work, pause queue intake, finish bounded active jobs,
close BullMQ/Redis/Prisma clients, then exit. Compose grants 20 seconds to API,
bot, and Mini App and 30 seconds to worker.
