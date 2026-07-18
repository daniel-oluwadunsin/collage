# Security, Compliance, and Financial Risk Requirements

## 1. Engineering posture

Build Collage as though every state transition will be audited after a financial dispute.

Favor:

- explicit invariants;
- fail-closed security;
- immutable financial records;
- idempotency;
- least privilege;
- compensating entries;
- deterministic references;
- typed status mapping;
- verifiable provider evidence.

Do not make a demo pass by hard-coding success, bypassing verification, mutating balances directly, or swallowing errors.

## 2. Threat model

Protect against:

- forged or stale Telegram Mini App identity;
- replayed launch links;
- non-admin Collage creation;
- payout-position race conditions;
- duplicate registration;
- duplicate charge or payout;
- webhook forgery/replay;
- provider timeout ambiguity;
- amount/reference substitution;
- insecure direct object references;
- a member changing another member's account;
- sensitive data leakage;
- group-admin abuse;
- a member leaving after early payout;
- queue replay;
- worker crash around provider side effects;
- Redis loss;
- database/queue partial failure;
- stale bank validation;
- unsafe payment-method replacement.

## 3. Telegram security

- Validate raw Mini App `initData` server-side.
- Reject stale `auth_date`.
- Implement Telegram HMAC exactly from official docs.
- Never trust `initDataUnsafe`.
- Bind opaque launch token to action, Collage, chat, expiry, and optional single use.
- Verify current group-admin status for creator actions.
- Verify Telegram webhook secret header.
- Escape every user-controlled value in group messages.
- Store Telegram IDs without JavaScript precision loss.
- Request private write access only through supported Telegram flows and never assume private messaging is possible.

## 4. Authentication and authorization

Authorization is resource-based and server-side:

- create/manage Collage: current Telegram group admin;
- join/view own registration: authenticated Telegram identity;
- update payout/payment method: owner of that Collage membership;
- payout retry/account change: scheduled recipient and definite retryable payout state;
- reconciliation/reminder request: group admin;
- internal bot API: service credential;
- worker: private network/process, no public financial API.

Hidden buttons are not authorization.

## 5. Sensitive data

Sensitive values include:

- NIN;
- phone number;
- OTP;
- account number and account identity;
- card token;
- mandate code/reference where sensitive;
- Monnify credentials;
- SMSGate credentials and access/refresh tokens;
- Telegram bot token;
- encryption keys;
- internal service credentials.

Controls:

- AES-256-GCM field encryption with unique nonce and versioned envelope;
- keys supplied through secret manager/environment, never database;
- deterministic keyed hash/pepper only for controlled lookup/deduplication;
- masked serialization by default;
- no sensitive values in queue names, job IDs, logs, analytics, or Sentry;
- Pino redaction and sensitive-route body logging disabled;
- encrypted backups;
- explicit access methods for unmask/decrypt;
- rotation strategy for encryption key versions.

Production OTP transport uses a private HTTPS SMSGate server. SMSGate public
cloud is development-only because the provider documents it as unsuitable for
sensitive data. The Android Local Server is development-only, same-network,
Basic-authenticated transport. OTP payloads and recipient phone numbers are
never logged.

## 6. NIN handling

NIN is highly sensitive:

- collect only for the documented purpose;
- obtain clear consent;
- never show it after entry except masked last digits where necessary;
- never use it as a public identifier;
- never add it to payment metadata/reference;
- define retention/deletion policy;
- require privacy/legal review before live launch.

## 7. Money integrity

- Store NGN in kobo/minor units as `BigInt`.
- Parse provider decimals explicitly.
- Never use floating-point balance arithmetic.
- Use append-only double-entry ledger.
- Require balanced debit/credit totals before commit.
- One ledger transaction represents one economic event.
- Use compensating entries for reversal/correction.
- Never mutate ledger history.
- Any cached totals are derived and rebuildable.

## 8. Idempotency

Every external operation has:

- internal operation ID;
- provider reference;
- idempotency/deduplication key;
- current normalized status;
- immutable attempt history.

Examples:

```text
card-setup:{registrationId}:{attempt}
cycle-charge:{cycleId}:{memberId}:{attempt}
manual-pay:{cycleId}:{memberId}:{attempt}
payout:{cycleId}:{attempt}
telegram-notification:{eventId}:{templateVersion}
```

Use database unique constraints. Redis locks are not sufficient alone.

## 9. Provider ambiguity

A network timeout means **unknown**, not failed.

After an ambiguous charge or payout:

- preserve original reference;
- poll/requery provider;
- prohibit a new provider operation until the old one is terminal;
- show pending state to user;
- use reconciliation worker;
- alert after maximum pending age.

## 10. Webhooks

- Verify exact raw body.
- Validate signature and documented source controls.
- Deduplicate before processing.
- Return `200` quickly after durable acceptance.
- Process asynchronously.
- Record event hash and safe metadata.
- Do not fulfill a financial obligation solely from an unverified event.
- Handle duplicate and out-of-order events.
- Reject terminal-state regression except legitimate reversal handling.

## 11. Early-recipient/default risk

Ajo contains credit risk. A first-position member may receive substantially more than they have contributed.

MVP controls:

- legal name, verified phone, NIN collection/verification abstraction;
- verified payout account;
- recurring payment authorization;
- explicit agreement;
- strict cycle;
- outstanding-obligation calculation;
- leave-group detection;
- obligations survive Telegram departure;
- at-risk, delinquent, and defaulted states;
- blocked payout when a member fails.

These controls do not guarantee recovery. Do not market them as insurance.

Potential later controls:

- contribution history/trust score;
- deposits;
- guarantors;
- licensed protection reserve;
- early-position eligibility rules.

## 12. Group-admin powers

A group administrator cannot:

- mark a member paid;
- change amount/order after start;
- redirect another member's payout;
- force payout when ledger is short;
- erase audit history;
- remove obligations after a member has received payout.

Every creator action is audited.

## 13. Queue safety

- Validate job payload with Zod.
- Use deterministic job IDs.
- Bound attempts and backoff.
- Reload current DB state in every handler.
- Never assume a job runs once.
- Check operation state before external side effect.
- Persist attempt/reference safely around provider call.
- Treat unknown result as pending.
- Use graceful shutdown and stalled-job monitoring.
- Separate concurrency limits for payment, payout, and Telegram.
- Redis outage must not corrupt source-of-truth state.

## 14. Database resilience

- Review migrations manually.
- Mirror invariants with constraints.
- Use serializable transactions/locks for critical transitions.
- Set transaction timeout and retry serialization conflicts.
- Never hold a transaction open during a slow provider call.
- Use transactional outbox.
- Document backup/restore testing.
- Never casually delete financial rows.

## 15. HTTP security

- Helmet.
- Strict production CORS allowlist.
- Body-size limits.
- Endpoint-specific rate limits.
- TLS.
- No secrets in URLs.
- Internal endpoints authenticated and network-restricted where possible.
- Swagger protected/disabled in production if required.
- Health endpoints expose no secrets.
- Error responses contain stable safe codes.

## 16. Mini App security

- Do not store NIN, account number, card token, or raw provider data in localStorage.
- Avoid persistent raw Telegram init data.
- Do not collect card details directly; use provider-hosted flow.
- Allowlist external payment/authorization destinations.
- Validate return state.
- Refresh server state before a financial action.
- Prevent double submission.
- Use Content Security Policy compatible with Telegram and Monnify.
- Prevent open redirects.

## 17. Audit and incident response

Produce:

- request/job correlation IDs;
- safe provider references;
- audit timeline;
- webhook hashes;
- reconciliation reports;
- invariant failure alerts;
- leaked-token/key rotation runbook;
- duplicate-payout incident runbook;
- missed-webhook runbook;
- database/provider mismatch runbook.

## 18. Production gates

Do not call the product production-ready until:

- legal/compliance review is complete;
- Monnify features are enabled and limits understood;
- static-IP/MFA payout mode is confirmed;
- privacy notice and consent are reviewed;
- encryption keys are managed securely;
- NIN retention policy is approved;
- production webhook verification is tested;
- reconciliation is tested;
- backup/restore is tested;
- incident contacts/monitoring are established;
- wallet funding and settlement timing are understood.
