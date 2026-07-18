# Monnify Integration Specification

> Codex must consult the current official Monnify documentation before implementing or changing any endpoint, payload, status map, signature rule, retry policy, or production prerequisite. The official documentation is the source of truth.

## 1. Capabilities used

- API authentication.
- One-time checkout/manual payment.
- Transaction verification.
- Card tokenization and reusable token charge.
- Direct-debit mandate creation and activation.
- Direct-debit debit initiation and status lookup.
- Supported-bank list.
- Account/name enquiry.
- Webhooks.
- Single transfers/disbursements.
- Transfer status lookup.
- Platform wallet balance for reconciliation only.
- NIN verification where live access is available.

## 2. Provider adapter rules

All Monnify calls live in `packages/monnify`.

The adapter must:

- use typed requests and normalized responses;
- set explicit timeouts;
- attach correlation IDs where supported;
- redact credentials, headers, NIN, phone, account number, card token, and mandate data;
- classify outcomes as successful, pending/unknown, retryable failure, or terminal failure;
- prevent route handlers from inspecting arbitrary provider payloads;
- retain raw payload only where necessary, encrypted, access-controlled, and legally permitted;
- never log a complete provider response.

## 3. Authentication

- Authenticate server-side.
- Cache access token with an expiry safety margin.
- Use a Redis lock to prevent token refresh stampede.
- Keep sandbox and production base URLs/credentials separate.
- Never expose Monnify API key, secret key, contract code, access token, or wallet account to Mini App or bot.

## 4. Card tokenization

Official behavior requires a successful first card payment before a reusable card token is available.

Flow:

1. initialize the configured setup payment;
2. user completes provider checkout;
3. server verifies the transaction;
4. in production, securely retrieve/store reusable card token;
5. bind the token to the correct customer identity/email required by Monnify;
6. mark payment method active;
7. use token for future server-side charges;
8. verify every future charge.

Important:

- tokenization must be enabled on the Monnify merchant account;
- sandbox may not return a production token and may expose tokenization capability through a different field;
- development UI/fixtures must label sandbox simulation honestly;
- token is encrypted at rest and never returned to browser;
- token expiry or rejection moves the method to replacement-required state.

The card setup policy is configuration-driven:

- a commitment deposit credited to the first cycle;
- the first contribution paid in advance; or
- explicit sandbox-only simulation.

## 5. Direct debit

For a fixed-value, fixed-participant Collage, prefer the mandate type that matches fixed amount and end date after confirming current provider semantics.

Flow:

1. validate the customer's bank account;
2. create a unique mandate reference;
3. create mandate through Monnify;
4. persist provider mandate identity and authorization URL securely;
5. return authorization URL only to the member's Mini App session;
6. track all documented statuses;
7. complete registration only after activation;
8. initiate each cycle debit with a unique payment reference;
9. poll debit status because a failed/pending debit may not generate a failure webhook;
10. respect bank/provider retry limits.

Normalize mandate states such as:

- pending;
- pending authorization;
- pending activation;
- activated;
- authorization expired;
- expired;
- suspended;
- cancelled;
- failed/unknown where applicable.

Do not post a direct authorization URL in the Telegram group.

## 6. Manual payment

Initialize one transaction for one member's current-cycle obligation.

Metadata/reference must map deterministically to:

- member;
- Collage;
- cycle;
- obligation;
- attempt.

After the provider redirects back:

- show a pending confirmation screen;
- verify server-side;
- wait for webhook or polling;
- compare status, amount, currency, reference, member, Collage, and cycle;
- mark paid exactly once.

Handle:

- paid;
- pending;
- failed;
- expired;
- reversed;
- partial/overpayment if provider can produce it.

Default behavior should reject or explicitly reconcile partial/overpayment rather than silently treating it as full payment.

## 7. Webhooks

Production verification must:

- retain exact raw request bytes;
- validate `monnify-signature` using the current official HMAC-SHA512 procedure and client secret;
- use constant-time comparison;
- validate documented source IPs as defense in depth;
- fail closed in production.

Sandbox behavior may differ and must be enabled only by explicit environment setting.

Processing pattern:

1. receive raw event;
2. verify source/signature;
3. compute event fingerprint;
4. insert `WebhookEvent` with unique constraint;
5. return `200` quickly;
6. queue processing;
7. normalize the event;
8. verify related transaction/transfer when required;
9. apply idempotent transition;
10. emit outbox events.

Support relevant event families:

- successful transaction;
- successful, failed, and reversed disbursement;
- mandate status updates;
- settlement/wallet activity if used for platform reconciliation.

Do not assume failed recurring collection notifications exist; polling is required.

## 8. Transaction verification

For every contribution:

- verify final provider status;
- compare `amountPaid` to expected amount;
- verify currency is NGN;
- verify the provider reference maps to the exact obligation;
- ensure the obligation is not already fulfilled;
- handle later reversal with compensating ledger/state changes.

A redirect, JavaScript callback, or Mini App success screen is only a UX event.

## 9. Banks and name enquiry

- Fetch and cache supported banks with a refresh policy.
- Store provider bank code and display name.
- Run name enquiry before accepting payout account.
- Display resolved account name for explicit confirmation.
- Pass required destination account name when creating transfers.
- Revalidate when account changes or validation becomes stale.
- Store account number encrypted and return only masked value.

## 10. Payouts

Production prerequisites may include:

- disbursement feature activation;
- configured source wallet account;
- static live-server egress IP whitelisting;
- MFA/OTP operating mode;
- sufficient available wallet balance;
- destination account name.

Normalize transfer states including:

- pending;
- awaiting processing;
- in progress;
- pending authorization;
- OTP dispatch failure where applicable;
- successful/completed;
- failed;
- reversed;
- expired;
- unknown.

Rules:

- pending-like: requery; never duplicate;
- pending authorization: surface operational requirement and do not call failed;
- failed/reversed/expired: retry may be allowed after reconciliation;
- successful/completed: write economic ledger result and transition cycle;
- timeout/unknown: requery original reference.

Support environment configuration:

```text
MONNIFY_DISBURSEMENT_MFA_MODE=disabled|manual
```

- `disabled`: merchant account is approved for programmatic payout without OTP.
- `manual`: payout remains pending authorization; the system documents the action needed and never falsely marks it failed.

## 11. Wallet and settlement

A Monnify wallet balance is platform-wide.

- Never use it as a Collage balance.
- Use it only for platform solvency/reconciliation checks.
- The group pot comes from the internal ledger.
- Before payout, verify internal liability and, where useful, provider available balance.
- Model settlement/availability delays instead of assuming a successful collection is immediately disbursable unless the actual merchant configuration guarantees it.

## 12. NIN verification

- NIN verification may be live-only, chargeable, or require approval.
- Implement `IdentityVerificationProvider`.
- Provide `MonnifyIdentityVerificationProvider` for approved live use.
- Provide `MockIdentityVerificationProvider` for development/sandbox.
- Mark mocked verification clearly.
- Do not block the entire MVP because sandbox verification is unavailable.
- Minimize and protect identity data.

## 13. Retry policy

Provider retries are state-aware:

- use unique references;
- query before retry after uncertain outcome;
- never blindly retry a payout;
- use durable BullMQ jobs;
- use capped attempts and jittered backoff for polling;
- respect provider-specific debit limits;
- terminal failure moves to user/manual action;
- verified manual payment cancels future automatic retries.

A reasonable configurable collection flow is:

1. initial preferred-time attempt;
2. poll unresolved status;
3. retry only when provider permits and status is definitely retryable;
4. final manual-payment-required state before grace deadline.

## 14. Official reference pages Codex must consult

- Recurring payments overview.
- Card tokenization.
- Direct debit.
- Retry and failure handling.
- Verify transactions.
- Webhooks.
- Verification/name enquiry.
- BVN/NIN update guide.
- Disbursements.
- Single transfers.
- Wallet/settlement documentation relevant to the merchant configuration.

Record exact URLs and date consulted in `docs/PROVIDER_REFERENCES.md`.
