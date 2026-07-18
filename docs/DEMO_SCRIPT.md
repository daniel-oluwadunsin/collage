# Reproducible Demo Script

## Seed and start

```bash
cp .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
docker compose up --build api bot worker mini-app
```

The seed is idempotent and contains synthetic Telegram/group/Collage data only.

## Three-member scenario

1. Add/tag Collage bot and open the creation action as a current group admin.
2. Create a weekly ₦1,000 strict Collage with three positions.
3. Register A by card, B by direct debit, and C by the enabled method. Confirm
   one registration notice per member and one Collage start.
4. Confirm A automatically, force B to a definite failed fixture/provider
   status, and confirm C automatically. Verify only B is mentioned in one
   reminder.
5. Complete B's manual payment and wait for server/provider verification.
6. Verify ledger/expected amount reconciliation, one payout initiation, payout
   success, pinned status update, and Cycle 2 opening.
7. Mark A as having left Telegram after receiving payout; verify obligations
   and future collection remain.
8. In a later cycle, use a definite failed payout, let the recipient validate a
   new account, and retry once. Pending/unknown original transfers must block
   retry.
9. Replace a payment method and verify the old method remains active until the
   new authorization activates.

Provider calls stay disabled unless the operator intentionally supplies enabled
sandbox credentials. Never simulate provider success through a production
adapter.
