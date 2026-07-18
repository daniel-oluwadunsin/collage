# Provider and Platform References

Consulted on: 2026-07-18

## Telegram

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) — official
  reference for `themeParams`, `colorScheme`, `ready()`, BackButton,
  `safeAreaInset`, `contentSafeAreaInset`, compact launch mode, and fullscreen
  capability. The validating data received via the Mini App section was
  re-consulted for the foundation: remove `hash`, sort remaining fields, join
  them with newlines, derive the `WebAppData` HMAC secret from the bot token,
  compare the SHA-256 HMAC in constant time, and independently enforce
  `auth_date` freshness. No Telegram network call was made.

Re-consulted on 2026-07-18 before implementing the Telegram bot service:

- [Telegram Bot API — Updates and `setWebhook`](https://core.telegram.org/bots/api#getting-updates) —
  webhook retry behavior, the exact
  `X-Telegram-Bot-Api-Secret-Token` header, secret-token character/length
  constraints, and explicit `allowed_updates`. `chat_member` is requested
  explicitly because it is excluded from the default update set.
- [Telegram Bot API — `ChatMemberUpdated` and `getChatMember`](https://core.telegram.org/bots/api#chatmemberupdated) —
  bot/member lifecycle fields and the requirement that the bot be an
  administrator for reliable membership lookups and `chat_member` updates.
- [Telegram Bot API — `pinChatMessage`](https://core.telegram.org/bots/api#pinchatmessage) —
  administrator and `can_pin_messages` requirements.
- [Telegram Bot API — `ResponseParameters`](https://core.telegram.org/bots/api#responseparameters) —
  bounded flood-control retry using Telegram's `retry_after` value.
- [Telegram Bot Features — Privacy Mode](https://core.telegram.org/bots/features#privacy-mode) —
  commands addressed to the bot, replies, service messages, and the
  administrator/privacy-mode visibility model.
- [Telegram Mini Apps — Direct Link Mini Apps](https://core.telegram.org/bots/webapps#direct-link-mini-apps) —
  `https://t.me/<bot>/<short-name>?startapp=<opaque-token>&mode=compact`,
  chat context, and compact/full-height behavior.

The implementation uses grammY's Express webhook adapter but treats the
official Telegram Bot API pages above as the provider source of truth.

## Monnify

Consulted on 2026-07-18 before implementing the adapter:

- [Monnify API Reference](https://developers.monnify.com/api) — authentication
  and the authoritative endpoint catalogue.
- [Quickstart — Accept Payments](https://developers.monnify.com/docs/collections/quickstart) —
  access-token lifetime, authentication, and initialization examples.
- [Checkout API](https://developers.monnify.com/docs/collections/one-time-payments/checkout-api) —
  transaction initialization and safe redirect behavior.
- [Verify Transactions](https://developers.monnify.com/docs/collections/manage-payments/verify-transactions) —
  verification by payment or transaction reference and the requirement to
  verify server-side before crediting value.
- [Recurring Payments](https://developers.monnify.com/docs/collections/recurring-payments) —
  supported recurring collection approaches.
- [Card Tokenization](https://developers.monnify.com/docs/collections/recurring-payments/card-tokenization) —
  feature enablement, token retrieval after verified first payment, email/token
  binding, token charge flow, and mandatory charge verification.
- [Direct Debits](https://developers.monnify.com/docs/collections/recurring-payments/direct-debit) —
  closed-fixed mandates, create/status/debit/debit-status endpoints,
  authorization-link behavior, and mandate statuses.
- [Retry & Failure Handling](https://developers.monnify.com/docs/collections/recurring-payments/retry-failure-handling) —
  successful-payment-only webhook behavior, polling requirements, durable
  retries, and the documented two-debits-per-day NIP mandate limit.
- [Webhooks](https://developers.monnify.com/docs/webhooks) and
  [Webhook Event Types](https://developers.monnify.com/docs/webhooks/event-types) —
  exact raw-body HMAC-SHA512 validation with the client secret, production-only
  signature header, source IP `35.242.133.146`, and event envelopes.
- [Verifying Your Customers](https://developers.monnify.com/docs/verification-api/verifying-your-customers) —
  bank account name enquiry availability and live-only identity verification
  restrictions.
- [Supported Banks](https://developers.monnify.com/docs/supported-banks) —
  current bank-code catalogue.
- [Single Transfers](https://developers.monnify.com/docs/disbursements/single-transfers) —
  transfer/status/wallet-balance endpoints, destination-name requirement,
  asynchronous processing, MFA states, live IP whitelisting, status mapping,
  and disbursement enablement.
- [Going Live](https://developers.monnify.com/docs/live) — production
  credentials, webhook configuration, and go-live prerequisites.

No undocumented endpoint, provider success, retry rule, or sandbox signature
was added. Account identity verification remains abstract because NIN
verification is documented as live-only and feature access is merchant-specific.

## SMSGate

Consulted on 2026-07-18 before implementing the OTP transport:

- [SMSGate documentation](https://docs.sms-gate.app/) — official product and
  deployment overview for using an Android device as an SMS gateway.
- [Getting started](https://docs.sms-gate.app/getting-started/) — local,
  public-cloud, and private-server deployment choices. The public cloud is
  documented as suitable only for non-sensitive data; Collage therefore treats
  it as development-only for OTPs and recommends a private server in production.
- [Public Cloud Server](https://docs.sms-gate.app/getting-started/public-cloud-server/) —
  Android device connection, generated credentials, and device connectivity.
- [Local Server](https://docs.sms-gate.app/getting-started/local-server/) —
  same-network operation and Basic-auth-only behavior.
- [Private Server](https://docs.sms-gate.app/getting-started/private-server/) —
  HTTPS requirement and the private-server `/api/3rdparty/v1` API prefix.
- [API integration](https://docs.sms-gate.app/integration/api/) and
  [Authentication](https://docs.sms-gate.app/integration/authentication/) —
  JWT token issuance/refresh, Basic authentication, the `messages:send` and
  `messages:read` scopes, token rotation, and message authorization.
- [Sending messages](https://docs.sms-gate.app/features/sending-messages/) —
  `POST /messages`, E.164 recipients, caller-supplied message IDs, TTL,
  priority, SIM/device selection, delivery reports, and queued acceptance.
- [Status tracking](https://docs.sms-gate.app/features/status-tracking/) —
  `GET /messages/{id}` and the `Pending`, `Processed`, `Sent`, `Delivered`, and
  `Failed` lifecycle.
- [Private-server feature](https://docs.sms-gate.app/features/private-server/) —
  self-hosting guidance for sensitive communications.
- [Official OpenAPI document](https://capcom6.github.io/android-sms-gateway/swagger.json)
  (version 1.68.0 when consulted) — request constraints and response schemas.

Collage does not equate HTTP `202` or a `Pending` state with SMS delivery. It
does not retry an ambiguous send timeout or server failure because the original
message may already have been queued. Authentication recovery may replay once
with the same caller-supplied message ID.

## Toolchain references

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases) —
  verified Node 24 as an LTS release line.
- [Next.js App Router](https://nextjs.org/docs/app) and
  [Next.js deployment](https://nextjs.org/docs/app/getting-started/deploying) —
  standalone output and App Router health route foundation.
