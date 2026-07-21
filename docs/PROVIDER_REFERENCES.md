# Provider and Platform References

Re-consulted on 2026-07-21 for the Groq-powered Collage assistant:

- [Groq — Rate Limits](https://console.groq.com/docs/rate-limits) — provider
  limits are organization-level ceilings across request and token windows;
  exact limits are account-specific and cannot be raised by Collage runtime
  environment variables.

- [Groq — OpenAI GPT-OSS 20B model](https://console.groq.com/docs/model/openai-gpt-oss-20b) —
  confirms the selected `openai/gpt-oss-20b` deployment model supports local
  tool use, function calling, reasoning, and low/medium/high reasoning modes.
  It is used only as the one-shot intent router and remains configurable.
- [Groq — Local Tool Calling](https://console.groq.com/docs/tool-use/local-tool-calling) —
  local functions are defined by the application and returned in
  `message.tool_calls`; arguments arrive as a JSON string and malformed tool
  generation can produce an HTTP 400. Collage validates every selected call
  with strict Zod and never sends tool results back for final wording.
- [Groq — Chat Completions API](https://console.groq.com/docs/api-reference) —
  confirms the OpenAI-compatible chat-completions endpoint,
  `tool_choice`, `parallel_tool_calls`, model-specific `reasoning_effort`, and
  completion-token controls. Collage sets required tool choice, disables
  parallel tool calls, caps output, performs one request, and implements no
  provider retry.
- [Telegram Bot API — MessageEntity](https://core.telegram.org/bots/api#messageentity) —
  entity offsets and lengths are UTF-16 code units; `text_mention` carries the
  referenced user. The bot parses the untouched Telegram message before
  stripping its own mention.
- [Telegram Bot API — ReplyParameters](https://core.telegram.org/bots/api#replyparameters) —
  confirms `message_id` and `allow_sending_without_reply`; assistant answers
  retain the original forum `message_thread_id` as well.

Consulted on: 2026-07-18

Re-consulted on 2026-07-19 after Monnify rejected a date-only direct-debit
mandate start value:

- [Monnify — Direct Debits, Create Mandate](https://developers.monnify.com/docs/collections/recurring-payments/direct-debit#create-mandate) —
  the official request uses `startDate` and `endDate` with full
  `YYYY-MM-DDTHH:MM:SS` timestamps. The start must be in the future. Collage
  retains those documented field names, sends full timestamps, and rejects
  same-day/past or reversed ranges before contacting Monnify.
- The observed sandbox error text said `mandateStartDate is required`, but no
  consulted official request schema uses that JSON key. Collage therefore does
  not invent an undocumented alias; the date-only value and already-current
  start date were corrected according to the published schema.

Re-consulted on 2026-07-19 after observing a successful sandbox verification
with `cardDetails.cardToken: null`:

- [Monnify — Card Tokenization](https://developers.monnify.com/docs/collections/recurring-payments/card-tokenization) —
  Monnify explicitly states that sandbox does not return a real `cardToken`;
  sandbox exposes tokenization capability through `supportsTokenization`.
  Production returns a reusable token only when tokenization is enabled on the
  merchant integration. The adapter now accepts the documented nullable
  sandbox field without fabricating a credential.
- [Monnify — Verify Transactions](https://developers.monnify.com/docs/collections/manage-payments/verify-transactions) —
  Collage continues to require authoritative server-side status, exact amount,
  currency, and payment method evidence. A successful setup payment without a
  reusable credential is not enough to activate recurring card collection.

Re-consulted on 2026-07-19 while correcting persistent group actions,
post-creation status delivery, and card-setup return/reconciliation:

- [Telegram Bot API — `InlineKeyboardButton` and `WebAppInfo`](https://core.telegram.org/bots/api#inlinekeyboardbutton) —
  inline message buttons may open HTTPS Mini Apps; Collage continues using
  official `t.me` Main Mini App links for group cards.
- [Telegram Mini Apps — Main Mini App links](https://core.telegram.org/api/links#bot-links) —
  `startapp` is passed as the Mini App start parameter. Collage launch tokens
  now remain reusable for the bounded lifetime of a current group card; every
  bootstrap still revalidates Telegram identity, membership, action, chat, and
  Collage authorization.
- [Monnify — Card Tokenization](https://developers.monnify.com/docs/collections/recurring-payments/card-tokenization) —
  reusable card activation still requires a successful initial payment and
  server-side transaction verification. Provider redirect and webhook receipt
  are not treated as payment success.
- [Monnify — Webhooks](https://developers.monnify.com/docs/webhooks) —
  webhook acknowledgement is separated from durable queued processing,
  deduplication, reference lookup, and server-side verification.

Re-consulted on 2026-07-19 while correcting group creation launches:

- [Telegram Mini Apps — Launching the main Mini App](https://core.telegram.org/bots/webapps#launching-the-main-mini-app) —
  the official Main Mini App direct-link form is
  `https://t.me/<bot_username>?startapp=<parameter>&mode=compact`.
- [Telegram Mini Apps — Direct Link Mini Apps](https://core.telegram.org/bots/webapps#direct-link-mini-apps) —
  named Mini Apps use
  `https://t.me/<bot_username>/<short_name>?startapp=<parameter>`, while the
  `startapp` value is delivered to the Mini App as its start parameter.
- [Telegram Mini Apps — Validating data received via the Mini App](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) —
  re-consulted on 2026-07-19 after Telegram began supplying the additional
  third-party `signature` field. Bot-token HMAC validation removes `hash` and
  signs the remaining alphabetically sorted fields; the separate third-party
  Ed25519 procedure excludes both `hash` and `signature`.

Re-consulted on 2026-07-19 while separating payment-method add and replacement:

- [Monnify — Card Tokenization](https://developers.monnify.com/docs/collections/recurring-payments/card-tokenization) —
  a reusable token is obtained only after a successful first card payment,
  retrieved through server-side transaction verification, and stored securely;
  tokenization must be enabled for the merchant.
- [Monnify — Direct Debit](https://developers.monnify.com/docs/collections/recurring-payments/direct-debit) —
  recurring bank collection requires mandate creation and activation. Collage
  continues to treat authorization as pending until verified activation.

## Telegram

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) — official
  reference for `themeParams`, `colorScheme`, `ready()`, BackButton,
  `safeAreaInset`, `contentSafeAreaInset`, compact launch mode, and fullscreen
  capability. The validating data received via the Mini App section was
  re-consulted for the foundation: remove `hash`, sort remaining fields, join
  them with newlines, derive the `WebAppData` HMAC secret from the bot token,
  compare the SHA-256 HMAC in constant time, and independently enforce
  `auth_date` freshness. No Telegram network call was made.

Re-consulted on 2026-07-18 before implementing the complete Mini App:

- [Telegram Mini Apps — Designing Mini Apps](https://core.telegram.org/bots/webapps#designing-mini-apps) —
  mobile-first behavior, responsive controls, accessible labels, live host
  themes, and safe/content-safe-area requirements.
- [Telegram Mini Apps — Direct Link Mini Apps](https://core.telegram.org/bots/webapps#direct-link-mini-apps) —
  opaque `startapp` delivery, chat-aware direct links, compact launch mode, and
  the rule that direct-link Mini Apps cannot read or send chat messages.
- [Telegram Mini Apps — Initializing Mini Apps](https://core.telegram.org/bots/webapps#initializing-mini-apps) —
  raw `initData` as the server-verification input, untrusted
  `initDataUnsafe`, real-time `colorScheme`/theme parameters, stable viewport,
  safe-area fields, `ready()`, BackButton, and user-gesture fullscreen.

The implementation uses `@telegram-apps/sdk-react` for initialization, theme
and viewport CSS binding, and readiness. The official Telegram page remains
the platform source of truth. No Telegram network request was made by the
test-only bridge.

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

Reconsulted on 2026-07-18 for the durable worker milestone:

- [Card Tokenization](https://developers.monnify.com/docs/collections/recurring-payments/card-tokenization) —
  initialize a transaction before a token charge, bind the saved token to the
  same customer email, and verify every resulting transaction before value is
  credited.
- [Direct Debits](https://developers.monnify.com/docs/collections/recurring-payments/direct-debit) and
  [Retry & Failure Handling](https://developers.monnify.com/docs/collections/recurring-payments/retry-failure-handling) —
  debit-status polling, successful-payment verification, and the maximum of two
  NIP mandate debits per day. Collage applies the stricter rolling-24-hour
  interpretation because the page does not specify a provider day boundary.
- [Verify Transactions](https://developers.monnify.com/docs/collections/manage-payments/verify-transactions) —
  payment reference, amount, and currency are checked before a contribution is
  ledgered.
- [Single Transfers](https://developers.monnify.com/docs/disbursements/single-transfers) —
  caller references, asynchronous transfer initiation, pending/MFA states, and
  status polling before any retry or payout completion.

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

## Final integration audit

Reconsulted on 2026-07-18 during the final provider-state and reconciliation
audit:

- [Retry & Failure Handling](https://developers.monnify.com/docs/collections/recurring-payments/retry-failure-handling)
  for bounded debit retries and unresolved outcomes.
- [Webhooks](https://developers.monnify.com/docs/webhooks/overview) and
  [Webhook Event Types](https://developers.monnify.com/docs/webhooks/event-types)
  for signature verification, raw payload handling, replay, and event mapping.
- [Single Transfers](https://developers.monnify.com/docs/disbursements/single-transfers)
  for asynchronous transfer states, MFA, polling, and live static-egress/IP
  allowlisting requirements.
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) and
  [Telegram Bot API](https://core.telegram.org/bots/api) for init-data
  validation, webhook secret tokens, message updates, and pinning behavior.

## Optional manual-checkout collection

Reconsulted on 2026-07-19 before implementing optional recurring-payment setup:

- [Monnify Checkout API](https://developers.monnify.com/docs/collections/checkout) —
  server-side transaction initialization, provider checkout URL, payment
  reference, redirect URL, and the documented checkout lifetime. Collage
  initializes the checkout only for the authenticated owing member.
- [Verify Transactions](https://developers.monnify.com/docs/collections/manage-payments/verify-transactions) —
  server-side reference, amount, currency, and terminal-status verification
  before ledger credit.
- [Monnify Webhooks](https://developers.monnify.com/docs/webhooks) and
  [Webhook Event Types](https://developers.monnify.com/docs/webhooks/event-types) —
  signed raw-body processing, deduplication, fast acknowledgement, and queued
  normalization. The browser return is not payment evidence.
- [Telegram Bot API](https://core.telegram.org/bots/api#inlinekeyboardbutton) and
  [Formatting options](https://core.telegram.org/bots/api#formatting-options) —
  URL buttons, HTML escaping, and `tg://user?id=...` mentions. The reminder
  resolves an opaque launch token at delivery time rather than embedding
  financial state in the button URL.

## Shared group actions and replies

Reconsulted on 2026-07-19:

- [Telegram `getChatMember`](https://core.telegram.org/bots/api#getchatmember) —
  authoritative current membership lookup. Telegram documents that querying
  other users is guaranteed when the bot is an administrator; Collage fails
  closed when the lookup is unavailable or returns a non-member state.
- [Telegram `ReplyParameters`](https://core.telegram.org/bots/api#replyparameters) —
  message replies using `message_id` and
  `allow_sending_without_reply`, used only for interactive bot responses.
- [Telegram Mini Apps initialization](https://core.telegram.org/bots/webapps#initializing-mini-apps) —
  server validation of init data remains mandatory for the actual user opening
  a shared group action.

## Mini App return navigation

Reconsulted on 2026-07-21:

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) — the official
  `WebApp.close()` bridge emits the Mini App close event; Collage uses the SDK
  bridge first and requests return to the app that opened an external deep
  link. A bot `t.me` link is retained only as a regular-browser fallback.

## Public landing and `/mini-app` route split

Reconsulted on 2026-07-21:

- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) — Main Mini Apps
  are configured through BotFather and Telegram passes `startapp` context to
  the configured Mini App URL. Collage therefore registers the canonical
  deployed `/mini-app` URL while retaining `/` as the public website.
