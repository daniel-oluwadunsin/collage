# API, Events, and Jobs

This is the proposed contract map. Codex may refine naming while preserving behavior and documenting deviations.

## 1. Public API conventions

Base path: `/v1`

Success:

```json
{
  "success": true,
  "data": {},
  "requestId": "..."
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "COLLAGE_NOT_FOUND",
    "message": "This Collage could not be found.",
    "details": {},
    "requestId": "..."
  }
}
```

Generate OpenAPI from, or keep it automatically synchronized with, shared Zod contracts.

## 2. Telegram bootstrap/authentication

```text
POST /v1/auth/telegram/bootstrap
```

Input:

- Telegram raw init data or authorization header;
- opaque launch token.

Output:

- authenticated user summary;
- resolved launch action;
- Collage context;
- permitted next step;
- short-lived session if that architecture is chosen.

## 3. Collage endpoints

```text
POST   /v1/collages
GET    /v1/collages/:collageId
GET    /v1/collages/:collageId/status
GET    /v1/collages/:collageId/rules
PATCH  /v1/collages/:collageId
POST   /v1/collages/:collageId/open-registration
GET    /v1/collages/:collageId/positions
GET    /v1/collages/:collageId/history
POST   /v1/collages/:collageId/reconcile
POST   /v1/collages/:collageId/reminders/send
```

Creation/mutation/reconciliation actions require current Telegram group-admin authorization.

## 4. Registration endpoints

```text
GET  /v1/collages/:collageId/me/registration
POST /v1/collages/:collageId/registrations/details
POST /v1/collages/:collageId/registrations/phone/request-otp
POST /v1/collages/:collageId/registrations/phone/verify
POST /v1/collages/:collageId/registrations/confirm-rules
POST /v1/collages/:collageId/registrations/cancel
```

The details endpoint transactionally reserves the selected position. The response communicates reservation expiry.

## 5. Banks and payout accounts

```text
GET  /v1/banks
POST /v1/bank-accounts/resolve
GET  /v1/collages/:collageId/me/payout-account
PUT  /v1/collages/:collageId/me/payout-account
```

After creation, return masked account data only.

## 6. Payment methods

```text
GET  /v1/collages/:collageId/me/payment-method
POST /v1/collages/:collageId/me/payment-methods/card/setup
POST /v1/collages/:collageId/me/payment-methods/direct-debit/setup
GET  /v1/payment-authorizations/:authorizationId
POST /v1/collages/:collageId/me/payment-methods/replace/card
POST /v1/collages/:collageId/me/payment-methods/replace/direct-debit
```

Setup responses contain only safe authorization URL/status information. They never contain reusable credentials.

## 7. Contribution payments

```text
GET  /v1/collages/:collageId/cycles/current/me
POST /v1/collages/:collageId/cycles/current/payments/manual
GET  /v1/payment-attempts/:attemptId
POST /v1/payment-attempts/:attemptId/recheck
```

Manual-payment initialization is idempotent and refuses to duplicate an unresolved attempt.

## 8. Payout recovery

```text
GET  /v1/collages/:collageId/payouts/:payoutId
PUT  /v1/collages/:collageId/payouts/:payoutId/retry-account
POST /v1/collages/:collageId/payouts/:payoutId/retry
```

Only the scheduled recipient may use these endpoints, and retry requires a reconciled terminal retryable state.

## 9. Internal Telegram API

Base path: `/internal/telegram`

```text
POST /chats/upsert
GET  /chats/:telegramChatId/status-card
POST /events/member-joined
POST /events/member-left
POST /events/bot-membership-changed
POST /messages/pinned
POST /actions/create-launch-token
```

All require internal service authentication.

Status-card response should be a presentation view model:

```json
{
  "state": "ACTIVE",
  "text": "...",
  "parseMode": "HTML",
  "buttons": [
    {
      "label": "Pay contribution",
      "url": "https://t.me/..."
    }
  ],
  "pin": true,
  "replaceMessageId": "..."
}
```

The bot may perform final HTML escaping/rendering but must not derive financial facts independently.

## 10. Webhooks and health

```text
POST /webhooks/monnify
POST /telegram/webhook

GET /health/live
GET /health/ready
```

Telegram webhook belongs to the bot app. Monnify webhook belongs to the API.

Readiness checks:

- API: PostgreSQL and Redis;
- bot: internal API/Redis configuration and process readiness;
- worker: PostgreSQL and Redis;
- Mini App: Next.js process readiness.

## 11. Domain events

Suggested event catalogue:

```text
telegram.chat_registered
telegram.member_left

collage.created
collage.registration_opened
collage.rules_changed
collage.started
collage.blocked
collage.completed

registration.details_submitted
registration.payment_authorization_started
registration.completed
registration.expired

payment_method.activated
payment_method.replaced
payment_method.invalidated

cycle.opened
cycle.overdue
cycle.blocked
cycle.ready_for_payout
cycle.completed

contribution.charge_scheduled
contribution.charge_started
contribution.payment_confirmed
contribution.payment_failed
contribution.manual_payment_required
contribution.reversed

payout.started
payout.pending_authorization
payout.succeeded
payout.failed
payout.reversed

notification.requested
reconciliation.mismatch_detected
```

Every event contains:

- event ID;
- event type;
- occurred-at timestamp;
- aggregate ID and version;
- correlation and causation IDs;
- safe payload;
- schema version.

## 12. Queues

```text
outbox
collage-lifecycle
payment-scheduling
payment-processing
payment-reconciliation
payout-processing
payout-reconciliation
reminders
telegram-notifications
maintenance
```

## 13. Job catalogue

### Outbox

```text
publish-outbox-event
```

### Lifecycle

```text
expire-position-reservation
attempt-collage-start
open-cycle
mark-cycle-overdue
evaluate-cycle-readiness
complete-cycle-and-open-next
complete-collage
```

### Payments

```text
schedule-member-charge
initiate-card-token-charge
initiate-direct-debit
check-card-charge-status
check-direct-debit-status
retry-collection
create-manual-payment
reconcile-pending-payment
handle-payment-reversal
```

### Payouts

```text
initiate-cycle-payout
check-transfer-status
handle-payout-webhook
reconcile-pending-payout
retry-terminal-failed-payout
```

### Reminders

```text
send-group-payment-reminder
send-cycle-deadline-warning
send-default-blocked-notice
send-private-payment-method-warning
```

### Telegram

```text
send-group-message
edit-pinned-status
pin-status-message
send-private-message
```

### Maintenance

```text
refresh-bank-list
expire-launch-tokens
expire-authorizations
rebuild-ledger-projection
provider-reconciliation-sweep
```

## 14. Job handler contract

Every job handler:

1. validates payload with Zod;
2. loads current source-of-truth database state;
3. exits safely if already terminal/completed;
4. acquires domain lock where needed;
5. performs at most one external operation per provider attempt;
6. records provider attempt/reference safely;
7. treats timeout as pending;
8. writes state, ledger, audit, and outbox transactionally;
9. emits safe metrics/logs;
10. throws only when BullMQ retry is correct.

## 15. Telegram message contract

Use HTML parse mode with escaping helpers.

Every financial message includes:

- Collage name;
- cycle where relevant;
- amount where relevant;
- current action/status;
- one clear next action.

Never put a sensitive authorization URL in plain text. Group buttons open a per-user Mini App action.
