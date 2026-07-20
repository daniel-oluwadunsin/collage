# Environment, Docker, Setup, and Deployment Runbook

## 1. Prerequisites

- Git.
- Docker Engine/Desktop with Compose.
- Active-LTS Node.js for non-Docker development.
- Corepack and pnpm.
- Telegram bot created through BotFather.
- Telegram Mini App short name and HTTPS URL.
- Monnify sandbox account and credentials.
- Public HTTPS tunnel/domain for Telegram and Monnify webhooks during development.

## 2. Environment layout

Use app-specific `.env` files and root Compose configuration. Never commit real secrets.

### 2.1 Shared server values

```dotenv
NODE_ENV=development
LOG_LEVEL=debug

DATABASE_URL=postgresql://collage:collage@postgres:5432/collage
REDIS_URL=redis://redis:6379

APP_ENCRYPTION_KEY_ID=
APP_ENCRYPTION_KEY_BASE64=
APP_HASH_PEPPER=
INTERNAL_SERVICE_TOKEN=
LAUNCH_TOKEN_HASH_SECRET=
PROVIDER_CALLS_ENABLED=false

PUBLIC_APP_URL=https://example.ng
API_PUBLIC_URL=https://api.example.ng
MINI_APP_PUBLIC_URL=https://app.example.ng
```

`APP_ENCRYPTION_KEY_BASE64` must decode to exactly 32 bytes.
`APP_HASH_PEPPER`, `INTERNAL_SERVICE_TOKEN`, and
`LAUNCH_TOKEN_HASH_SECRET` must each be independently generated with at least
32 bytes of entropy. `PROVIDER_CALLS_ENABLED` remains `false` until provider
enablement is approved.

### 2.2 API

```dotenv
API_PORT=4000
API_TRUST_PROXY=1
CORS_ALLOWED_ORIGINS=https://app.example.ng

TELEGRAM_BOT_TOKEN=
TELEGRAM_INIT_DATA_MAX_AGE_SECONDS=3600

MONNIFY_ENV=sandbox
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER=

MONNIFY_CARD_TOKENIZATION_ENABLED=false
MONNIFY_DIRECT_DEBIT_ENABLED=true
MONNIFY_DISBURSEMENT_ENABLED=true
MONNIFY_IDENTITY_VERIFICATION_MODE=mock
MONNIFY_DISBURSEMENT_MFA_MODE=manual
MONNIFY_WEBHOOK_ALLOWED_IPS=
MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS=false

CARD_SETUP_POLICY=commitment_deposit
CARD_SETUP_AMOUNT_MINOR=10000

OTP_PROVIDER=smsgate
OTP_TTL_SECONDS=600
SMSGATE_API_BASE_URL=https://api.sms-gate.app/3rdparty/v1
SMSGATE_DEPLOYMENT_MODE=cloud
SMSGATE_AUTH_MODE=jwt
SMSGATE_USERNAME=
SMSGATE_PASSWORD=
SMSGATE_DEVICE_ID=
SMSGATE_SIM_NUMBER=1
SMSGATE_PRIORITY=100
SMSGATE_REQUEST_TIMEOUT_MS=10000
SMSGATE_TOKEN_TTL_SECONDS=3600

SWAGGER_ENABLED=true
SWAGGER_PATH=/docs
```

Production rules:

- require webhook signature;
- exact CORS origins;
- private HTTPS SMSGate server for production OTP data;
- no fixed OTP or logged SMS payload;
- protect/disable Swagger if desired;
- use production Monnify URL;
- load secrets from a secret manager.

SMSGate deployment notes:

- Android Public Cloud mode uses
  `https://api.sms-gate.app/3rdparty/v1` with JWT authentication. Official
  SMSGate guidance describes the public cloud as appropriate only for
  non-sensitive data, so Collage rejects that host when
  `NODE_ENV=production`. Set `SMSGATE_DEPLOYMENT_MODE=cloud`.
- A private server uses the full
  `https://sms.example.ng/api/3rdparty/v1` prefix and JWT authentication. This
  is the production-recommended mode; set
  `SMSGATE_DEPLOYMENT_MODE=private`.
- Android Local Server mode is useful for development on the same network. Set
  `SMSGATE_API_BASE_URL=http://<phone-ip>:8080`,
  `SMSGATE_DEPLOYMENT_MODE=local`, and `SMSGATE_AUTH_MODE=basic`. Collage then
  uses the documented `/message` endpoint. A Docker container must be able to
  route to the phone; `localhost` inside the container is not the Android
  device.
- Copy the generated username/password from the Android SMSGate app into a
  local secret store. Never commit them. Optionally pin `SMSGATE_DEVICE_ID` and
  `SMSGATE_SIM_NUMBER` when the account has multiple devices or SIMs.
- SMSGate HTTP `202` means queued, not delivered. Collage never treats it as
  proof of phone ownership; only the user-entered OTP verifies the phone.
- A send timeout or `5xx` has an unknown outcome and is not retried
  automatically. The challenge remains usable if the SMS later arrives; the
  user may also request a new challenge/code.

### 2.3 Bot

```dotenv
BOT_PORT=4001
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_MINI_APP_SHORT_NAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_WEBHOOK_PUBLIC_URL=https://bot.example.ng/telegram/webhook
BOT_INTERNAL_REQUEST_TIMEOUT_MS=5000
TELEGRAM_NOTIFICATION_CONCURRENCY=10
TELEGRAM_RATE_LIMIT_MAX_RETRIES=2

INTERNAL_API_URL=http://api:4000
INTERNAL_SERVICE_TOKEN=
REDIS_URL=redis://redis:6379
```

BotFather/deployment setup:

1. Configure the Mini App short name used by
   `TELEGRAM_MINI_APP_SHORT_NAME`.
2. Add the bot to the group, promote it to administrator, and enable
   **Pin messages**. Collage reports actionable guidance when this permission
   is absent.
3. Keep BotFather privacy mode enabled; Collage reacts to its commands,
   explicit `@bot` mentions, and Telegram service/member updates.
4. Expose `TELEGRAM_WEBHOOK_PUBLIC_URL` over public HTTPS. Startup registers
   that URL with the configured secret and exactly `message`,
   `my_chat_member`, and `chat_member` allowed updates.
5. Use a random 32–256 character `TELEGRAM_WEBHOOK_SECRET` containing only
   letters, digits, underscore, or hyphen. Do not reuse the bot token.

### 2.4 Worker

```dotenv
WORKER_HEALTH_PORT=4002
DATABASE_URL=postgresql://collage:collage@postgres:5432/collage
REDIS_URL=redis://redis:6379

MONNIFY_ENV=sandbox
MONNIFY_BASE_URL=https://sandbox.monnify.com
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER=
API_PUBLIC_URL=https://api.example.ng

APP_ENCRYPTION_KEY_ID=
APP_ENCRYPTION_KEY_BASE64=
APP_HASH_PEPPER=
INTERNAL_SERVICE_TOKEN=
LAUNCH_TOKEN_HASH_SECRET=
PROVIDER_CALLS_ENABLED=false

WORKER_MAX_AUTOMATIC_CHARGE_ATTEMPTS=3
WORKER_PENDING_POLL_SECONDS=60
WORKER_STALE_OPERATION_MINUTES=15
WORKER_OUTBOX_CONCURRENCY=1
WORKER_LIFECYCLE_CONCURRENCY=4
WORKER_PAYMENT_CONCURRENCY=10
WORKER_PAYOUT_CONCURRENCY=2
WORKER_REMINDER_CONCURRENCY=2
```

### 2.5 Mini App

Only public values:

```dotenv
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=
NEXT_PUBLIC_TELEGRAM_MINI_APP_SHORT_NAME=
NEXT_PUBLIC_APP_ENV=development
```

No Monnify secret, bot token, encryption key, internal service token, or database URL may be present.
These values are compiled into the Next.js browser bundle. Supply them as Mini
App image build arguments. Test-only runtime bridges are not shipped.

### 2.6 Optional observability

```dotenv
SENTRY_DSN=
SENTRY_ENVIRONMENT=
OTEL_EXPORTER_OTLP_ENDPOINT=
```

Sensitive scrubbing is mandatory before enabling.

### 2.7 Complete variable reference

This section covers every key in the root `.env.example`. “Generate” commands
must be run independently for each secret; never reuse one generated value for
two variables. Values marked **browser-public** are embedded in JavaScript and
must never contain credentials.

#### Runtime and local infrastructure

| Variable            | Owner / secrecy                                  | Meaning                                                                        | How to choose or obtain it                                                                                                                                                          |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`          | API, bot, worker, Mini App / public              | Activates development, test, or production safeguards.                         | Use `development` locally and `production` only in deployed services. Do not invent another value.                                                                                  |
| `LOG_LEVEL`         | API, bot, worker / public                        | Lowest Pino severity emitted.                                                  | Choose `debug` locally; normally `info` or `warn` in production.                                                                                                                    |
| `POSTGRES_DB`       | Compose PostgreSQL / sensitive configuration     | Database created by the PostgreSQL image.                                      | Choose a stable database name such as `collage`; your managed-database provider supplies it in production.                                                                          |
| `POSTGRES_USER`     | Compose PostgreSQL / sensitive configuration     | PostgreSQL login role created by the image.                                    | Choose a dedicated least-privilege role locally; obtain the assigned username from the managed-database console in production.                                                      |
| `POSTGRES_PASSWORD` | Compose PostgreSQL / **secret**                  | Password for `POSTGRES_USER`.                                                  | Generate with `openssl rand -base64 32`, or use the password issued/rotated by the managed-database secret manager.                                                                 |
| `DATABASE_URL`      | API, worker, migrate / **secret**                | PostgreSQL connection URL, including database, role, password, host, and port. | Compose uses `postgresql://<user>:<password>@postgres:5432/<db>`. In production copy the TLS connection string from the database provider; URL-encode reserved password characters. |
| `REDIS_URL`         | API, bot, worker / **secret** when authenticated | Redis/BullMQ connection URL.                                                   | Compose uses `redis://redis:6379`. Copy the TLS/authenticated URL from the managed Redis provider in production, normally `rediss://...`.                                           |
| `POSTGRES_PORT`     | Compose host binding / public                    | Host port forwarded to container port 5432 for local access.                   | Use `5432` unless another local PostgreSQL already owns it; then choose an unused port such as `55432`. It is not published by the production overlay.                              |
| `REDIS_PORT`        | Compose host binding / public                    | Host port forwarded to container port 6379 for local access.                   | Use `6379` unless occupied; then choose an unused port such as `56379`. It is not published by the production overlay.                                                              |

#### URLs and service ports

| Variable              | Owner / secrecy      | Meaning                                                                                       | How to choose or obtain it                                                                                                                  |
| --------------------- | -------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_APP_URL`      | Reserved / public    | Intended umbrella product URL. The current runtime does not read it.                          | Use the canonical public Collage website URL if retained for deployment metadata; otherwise leave blank.                                    |
| `API_PUBLIC_URL`      | API, worker / public | Browser/provider-reachable API origin without `/v1`. Used when creating public callback URLs. | Use the HTTPS API domain configured in DNS/reverse proxy, for example `https://api.example.ng`.                                             |
| `MINI_APP_PUBLIC_URL` | API / public         | Canonical HTTPS origin of the Telegram Mini App.                                              | Use the deployed Next.js URL registered with BotFather, without a trailing route.                                                           |
| `INTERNAL_API_URL`    | bot / internal       | Base URL used by the bot to call the API over the private network.                            | In Compose use `http://api:4000`; outside Compose use the API’s private service-discovery URL. Never point it at an untrusted public proxy. |
| `API_PORT`            | API / public         | API listen port inside its process/container.                                                 | Keep `4000` unless the platform requires another port. Compose currently fixes the container value to `4000`.                               |
| `BOT_PORT`            | bot / public         | Bot health/webhook HTTP listen port.                                                          | Keep `4001` unless the platform requires another port.                                                                                      |
| `WORKER_HEALTH_PORT`  | worker / public      | Worker liveness/readiness/metrics HTTP port.                                                  | Keep `4002` unless the platform requires another port.                                                                                      |
| `PORT`                | Mini App / public    | Next.js server listen port.                                                                   | Use `3000` locally/Compose or the port injected by the hosting platform.                                                                    |

#### API, cryptography, and internal authentication

| Variable                    | Owner / secrecy                       | Meaning                                                                            | How to choose or obtain it                                                                                                                                                       |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_TRUST_PROXY`           | Reserved / public                     | Intended Express trusted-proxy hop count. The current runtime does not read it.    | Do not rely on this key for security. Configure the deployment proxy/network explicitly until runtime support is added.                                                          |
| `CORS_ALLOWED_ORIGINS`      | API / public                          | Comma-separated exact browser origins allowed to call the API.                     | Enter the deployed Mini App origin(s), including scheme and port when non-default; never use `*` with authenticated traffic.                                                     |
| `SWAGGER_ENABLED`           | Reserved / public                     | Intended Swagger switch. The current runtime does not read it.                     | Do not rely on it to hide documentation; protect `/docs` at the proxy/network layer until runtime support is added.                                                              |
| `SWAGGER_PATH`              | Reserved / public                     | Intended Swagger route. The current runtime does not read it.                      | Keep `/docs` only as documentation metadata; changing it currently has no runtime effect.                                                                                        |
| `APP_ENCRYPTION_KEY_ID`     | API, worker / sensitive configuration | Operator-managed identifier stored beside ciphertext to support key rotation.      | Choose a non-secret immutable label such as `collage-data-2026-07`; map it to the actual key in the secret manager.                                                              |
| `APP_ENCRYPTION_KEY_BASE64` | API, worker / **secret**              | AES-256-GCM application-data key; it must decode to exactly 32 bytes.              | Generate once with `openssl rand -base64 32`; store in a KMS/secret manager and back it up under the matching key ID. Losing it makes encrypted payout/provider data unreadable. |
| `APP_HASH_PEPPER`           | API, worker / **secret**              | Server-side pepper for irreversible sensitive-value hashes.                        | Generate independently with `openssl rand -hex 32` and store in the secret manager. Rotation requires an explicit migration strategy.                                            |
| `INTERNAL_SERVICE_TOKEN`    | API, bot, worker / **secret**         | Shared HMAC/authentication secret for bot/worker-to-API requests.                  | Generate independently with `openssl rand -hex 32`; distribute only to those three services.                                                                                     |
| `LAUNCH_TOKEN_HASH_SECRET`  | API, worker / **secret**              | Secret used to hash opaque Telegram launch tokens before persistence/verification. | Generate independently with `openssl rand -hex 32`; store in the secret manager.                                                                                                 |
| `API_SESSION_SECRET`        | API / **secret**                      | Key material used to sign Mini App API sessions.                                   | Generate independently with `openssl rand -hex 32`; changing it invalidates active sessions.                                                                                     |
| `PROVIDER_CALLS_ENABLED`    | API, worker / public switch           | Master fail-closed switch for outbound money/provider calls.                       | Keep `false` for local/demo and until credentials, webhooks, allowlists, reconciliation, and approvals are verified; set `true` only through an audited deployment change.       |

#### Telegram

| Variable                             | Owner / secrecy       | Meaning                                                                                      | How to choose or obtain it                                                                                                                  |
| ------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`                 | API, bot / **secret** | Authenticates Telegram Bot API calls and validates Mini App init data.                       | Create/select the bot in `@BotFather`, use `/token`, and store the returned token in the secret manager. Revoke it in BotFather if exposed. |
| `TELEGRAM_BOT_USERNAME`              | bot / public          | Bot username used in mentions and direct Mini App links.                                     | Copy the username assigned in BotFather, with or without the leading `@`.                                                                   |
| `TELEGRAM_MINI_APP_SHORT_NAME`       | bot / public          | BotFather short name in `t.me/<bot>/<short-name>` direct links.                              | Create/configure the Mini App in BotFather and copy its short name exactly; allowed characters are letters, digits, and underscore.         |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | API / public policy   | Maximum accepted age of signed Telegram Mini App init data.                                  | Use `3600` by default. Keep this bounded; lowering it below realistic Mini App startup/reload time causes false authentication failures.    |
| `TELEGRAM_WEBHOOK_SECRET`            | bot / **secret**      | Telegram `secret_token` checked on every webhook request. It is separate from the bot token. | Generate with `openssl rand -hex 32`; valid characters are letters, digits, `_`, and `-`, length 32–256.                                    |
| `TELEGRAM_WEBHOOK_PUBLIC_URL`        | bot / public          | Public HTTPS endpoint Telegram sends updates to.                                             | Deploy/expose the bot, then use its exact URL ending in `/telegram/webhook`, for example `https://bot.example.ng/telegram/webhook`.         |
| `BOT_INTERNAL_REQUEST_TIMEOUT_MS`    | bot / public policy   | Maximum duration for a bot-to-API request.                                                   | Start with `5000`; tune from latency metrics, never to mask a persistently unhealthy API. Allowed range is 500–30000.                       |
| `TELEGRAM_NOTIFICATION_CONCURRENCY`  | bot / public policy   | Maximum concurrent notification deliveries.                                                  | Start with `10`; lower it if Telegram 429s rise. Allowed range is 1–50.                                                                     |
| `TELEGRAM_RATE_LIMIT_MAX_RETRIES`    | bot / public policy   | Maximum Telegram 429 retries using Telegram’s documented `retry_after`.                      | Keep `2` initially; allowed range is 0–5. This does not permit blind retries of other failures.                                             |

#### Monnify

| Variable                                     | Owner / secrecy                               | Meaning                                                                                           | How to choose or obtain it                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MONNIFY_ENV`                                | API, worker / public                          | Selects `sandbox` or `production` provider behavior.                                              | Use `sandbox` with sandbox credentials. Change to `production` only after Monnify go-live approval.                                                                |
| `MONNIFY_BASE_URL`                           | API, worker / public                          | Monnify API origin.                                                                               | Use `https://sandbox.monnify.com` for sandbox. Copy the current live base URL from official Monnify documentation for production; do not guess it.                 |
| `MONNIFY_API_KEY`                            | API, worker / **secret**                      | Merchant API key used to obtain Monnify access tokens.                                            | Copy from the Monnify dashboard for the selected environment and store in the secret manager.                                                                      |
| `MONNIFY_SECRET_KEY`                         | API, worker / **secret**                      | Merchant secret used for authentication and webhook HMAC verification.                            | Copy from the Monnify dashboard for the selected environment; never expose to the browser. Rotate in Monnify if leaked.                                            |
| `MONNIFY_CONTRACT_CODE`                      | API, worker / sensitive configuration         | Monnify merchant contract code attached to collections/transfers.                                 | Copy the contract code shown in the Monnify dashboard for the same environment as the API/secret keys.                                                             |
| `MONNIFY_DISBURSEMENT_WALLET_ACCOUNT_NUMBER` | worker / sensitive financial configuration    | Source wallet/account used for payouts and balance checks.                                        | Obtain from the enabled Monnify disbursement wallet in the dashboard or from Monnify support; confirm it belongs to the same contract before enabling calls.       |
| `MONNIFY_CARD_TOKENIZATION_ENABLED`          | Reserved capability record / public switch    | Records intended card-tokenization enablement; current runtime does not read it.                  | Set to `true` only after Monnify confirms the feature for this contract, but keep `PROVIDER_CALLS_ENABLED=false` until runtime and operational gates are complete. |
| `MONNIFY_DIRECT_DEBIT_ENABLED`               | Reserved capability record / public switch    | Records intended direct-debit enablement; current runtime does not read it.                       | Obtain written/dashboard confirmation from Monnify for the selected environment before recording `true`.                                                           |
| `MONNIFY_DISBURSEMENT_ENABLED`               | Reserved capability record / public switch    | Records intended payout enablement; current runtime does not read it.                             | Set from Monnify’s contract/dashboard enablement status only; also complete static-egress and wallet checks.                                                       |
| `MONNIFY_IDENTITY_VERIFICATION_MODE`         | Reserved capability record / sensitive policy | Records the intended identity provider mode; current runtime does not read it.                    | Keep `mock` only for non-production demos. Production requires a product/compliance decision and confirmed provider access.                                        |
| `MONNIFY_DISBURSEMENT_MFA_MODE`              | Reserved capability record / sensitive policy | Records intended manual/provider MFA operations; current runtime does not read it.                | Choose only after Monnify confirms the merchant’s transfer MFA workflow and operations assigns accountable approvers.                                              |
| `MONNIFY_WEBHOOK_ALLOWED_IPS`                | API / public security policy                  | Comma-separated source IP allowlist checked before accepting Monnify webhooks.                    | Copy the current production webhook source IPs from official Monnify docs; the documented value at the final audit was `35.242.133.146`. Reverify before go-live.  |
| `MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS`    | API / high-risk switch                        | Allows unsigned webhooks only in sandbox because Monnify documents sandbox signature differences. | Keep `false` by default. Set `true` only for an isolated sandbox when official behavior requires it; it is rejected as a production practice.                      |

#### Registration and SMSGate

| Variable                     | Owner / secrecy                                             | Meaning                                                                                         | How to choose or obtain it                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CARD_SETUP_POLICY`          | Reserved product policy / public                            | Intended setup policy label; current runtime does not read it.                                  | Keep `commitment_deposit` only if product/compliance has approved that flow; do not assume it changes runtime behavior.                                                           |
| `CARD_SETUP_AMOUNT_MINOR`    | Reserved product policy / sensitive financial configuration | Intended commitment deposit in integer kobo; current runtime does not read it.                  | Product/compliance must approve the amount. `10000` means ₦100.00. Never enter naira decimals or floating-point values.                                                           |
| `OTP_PROVIDER`               | API / public switch                                         | Selects `unconfigured` or the SMSGate transport.                                                | Use `unconfigured` until a gateway is ready; use `smsgate` only with valid credentials and a production-private deployment where required.                                        |
| `OTP_TTL_SECONDS`            | API / public policy                                         | OTP validity window.                                                                            | Start with `600` (10 minutes); choose 30–3600 based on security/support policy.                                                                                                   |
| `SMSGATE_API_BASE_URL`       | API / sensitive configuration                               | Base URL for the SMSGate API.                                                                   | Public cloud: `https://api.sms-gate.app/3rdparty/v1`; private: the deployed HTTPS server plus `/api/3rdparty/v1`; local: the Android device’s reachable `http://<phone-ip>:8080`. |
| `SMSGATE_DEPLOYMENT_MODE`    | API / public policy                                         | Declares `cloud`, `local`, or `private` so production safety checks can reject unsafe topology. | Match the deployment actually selected in SMSGate. Production Collage requires `private`.                                                                                         |
| `SMSGATE_AUTH_MODE`          | API / public policy                                         | Selects JWT or Basic authentication.                                                            | Use `jwt` for public/private server APIs; the Android Local Server requires `basic`.                                                                                              |
| `SMSGATE_USERNAME`           | API / **secret**                                            | SMSGate API username.                                                                           | Copy the credential generated by the Android SMSGate app or private-server admin; store in the secret manager.                                                                    |
| `SMSGATE_PASSWORD`           | API / **secret**                                            | SMSGate API password.                                                                           | Copy the paired generated credential; store in the secret manager and rotate if exposed.                                                                                          |
| `SMSGATE_DEVICE_ID`          | API / sensitive configuration                               | Optional exact Android device to use when multiple devices are connected.                       | Copy the device ID from the SMSGate device/admin screen; leave blank to let the account choose.                                                                                   |
| `SMSGATE_SIM_NUMBER`         | API / sensitive configuration                               | SIM slot number on the selected device.                                                         | Read the slot in the SMSGate Android app; allowed values are 1–3.                                                                                                                 |
| `SMSGATE_PRIORITY`           | API / public policy                                         | SMSGate queue priority.                                                                         | Start with `100`; allowed range is -128 to 127. Change only with an explicit queue policy.                                                                                        |
| `SMSGATE_REQUEST_TIMEOUT_MS` | API / public policy                                         | HTTP timeout for gateway requests.                                                              | Start with `10000`; tune from private-gateway latency within 1000–60000. Timeouts remain ambiguous and are not proof of failure.                                                  |
| `SMSGATE_TOKEN_TTL_SECONDS`  | API / public policy                                         | Requested/cached JWT lifetime.                                                                  | Start with `3600`; choose 300–86400 according to the private-server token policy.                                                                                                 |

#### Worker controls

| Variable                               | Owner / secrecy                       | Meaning                                                                    | How to choose or obtain it                                                                                             |
| -------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `WORKER_MAX_AUTOMATIC_CHARGE_ATTEMPTS` | worker / sensitive financial policy   | Maximum bounded automatic charge attempts before manual fallback.          | Use the approved risk/provider policy; default `3`, allowed 1–10. This does not permit retrying an unresolved attempt. |
| `WORKER_PENDING_POLL_SECONDS`          | worker / public policy                | Delay between status polls for ambiguous provider operations.              | Start with `60`; tune within 15–3600 against provider rate limits and settlement latency.                              |
| `WORKER_STALE_OPERATION_MINUTES`       | worker / sensitive operational policy | Age at which unresolved operations trigger stale-operation reconciliation. | Start with `15`; tune within 1–1440 using observed provider latency. It never converts unknown to failed.              |
| `WORKER_OUTBOX_CONCURRENCY`            | worker / public capacity              | Concurrent transactional-outbox publications.                              | Keep `1` initially; allowed range 1–4. Increase only after observing database/Redis capacity.                          |
| `WORKER_LIFECYCLE_CONCURRENCY`         | worker / public capacity              | Concurrent Collage/cycle lifecycle jobs.                                   | Start with `4`; allowed range 1–20.                                                                                    |
| `WORKER_PAYMENT_CONCURRENCY`           | worker / sensitive provider capacity  | Concurrent payment jobs.                                                   | Start with `10`; lower to honor Monnify limits or raise within 1–50 after load evidence.                               |
| `WORKER_PAYOUT_CONCURRENCY`            | worker / sensitive provider capacity  | Concurrent payout jobs.                                                    | Keep low (`2`) to limit blast radius; allowed range 1–10. Database/idempotency invariants still enforce payout once.   |
| `WORKER_REMINDER_CONCURRENCY`          | worker / public capacity              | Concurrent owing-member reminder jobs.                                     | Start with `2`; allowed range 1–10 and tune against Telegram limits.                                                   |

#### Mini App and optional observability

| Variable                                   | Owner / secrecy                                  | Meaning                                                                      | How to choose or obtain it                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `API_INTERNAL_URL`                         | Mini App server / internal                       | API origin used by the same-origin Next.js `/api/v1` rewrite.                | Use `http://127.0.0.1:4000` locally or the private service address in deployment; never expose credentials in this value.                  |
| `NEXT_PUBLIC_API_URL`                      | Mini App / **browser-public**                    | API base path/origin compiled into the browser bundle.                       | Use `/api/v1` for the same-origin proxy so Telegram on a phone never tries to contact its own `127.0.0.1`; an HTTPS API origin also works. |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`        | Mini App / **browser-public**                    | Public bot username used by the UI.                                          | Copy `TELEGRAM_BOT_USERNAME`; never put the bot token here.                                                                                |
| `NEXT_PUBLIC_TELEGRAM_MINI_APP_SHORT_NAME` | Mini App / **browser-public**                    | Public BotFather Mini App short name.                                        | Copy `TELEGRAM_MINI_APP_SHORT_NAME` exactly.                                                                                               |
| `NEXT_PUBLIC_APP_ENV`                      | Mini App / **browser-public**                    | Non-secret label displayed/used for client environment behavior.             | Use `development`, `staging`, or `production` to match the deployed build.                                                                 |
| `SENTRY_DSN`                               | Reserved observability / sensitive configuration | Intended error-ingestion DSN; current runtime does not read it.              | Obtain a project DSN from Sentry only after configuring server/client scrubbing. Never use a DSN that permits sensitive payload capture.   |
| `SENTRY_ENVIRONMENT`                       | Reserved observability / public                  | Intended Sentry environment label; current runtime does not read it.         | Use the deployment label from the observability project, such as `staging` or `production`.                                                |
| `OTEL_EXPORTER_OTLP_ENDPOINT`              | Reserved observability / sensitive configuration | Intended OpenTelemetry collector endpoint; current runtime does not read it. | Obtain the internal HTTPS/gRPC endpoint from the telemetry platform after redaction and access controls are approved.                      |

If a variable is marked reserved, setting it does not currently change runtime
behavior. It remains documented so operators do not mistake a placeholder for
an enforced financial or security control.

## 3. Expected repository scripts

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "db:generate": "pnpm --filter @collage/database prisma:generate",
    "db:migrate": "pnpm --filter @collage/database prisma:migrate"
  }
}
```

The product owner required all test files and test scripts to be removed after
the recorded verification run. See `docs/IMPLEMENTATION_STATUS.md` for the
pre-removal evidence.

## 4. Compose services

`compose.yaml` must define:

- `postgres`;
- `redis`;
- `migrate`;
- `api`;
- `bot`;
- `worker`;
- `mini-app`.

Required behavior:

- Postgres healthcheck using `pg_isready`.
- Redis healthcheck using `redis-cli ping`.
- One-shot migration service runs `prisma migrate deploy`.
- API, bot, and worker wait for successful migration and healthy dependencies.
- Each app has a healthcheck.
- Named volumes for development data.
- App containers run as non-root.
- Graceful stop period.
- Secrets injected at runtime.
- Production Compose does not bind-mount source.

Start:

```bash
cp .env.example .env
docker compose up --build
```

Inspect:

```bash
docker compose ps
docker compose logs -f api bot worker
```

Development-only destructive reset:

```bash
docker compose down -v
docker compose up --build
```

Never run destructive reset automatically.

## 5. Dockerfiles

Use multi-stage builds:

1. base/corepack;
2. Turborepo prune for target;
3. frozen dependency install;
4. target build;
5. minimal runtime image;
6. non-root user;
7. only required workspace output and Prisma engine.

The Mini App should use Next.js standalone production output.

## 6. Telegram setup

1. Create bot through BotFather.
2. Set bot username.
3. Configure Mini App/Main App or direct-link short name.
4. Set the public HTTPS domain.
5. Configure commands:
   - `/collage`;
   - `/status`;
   - `/rules`;
   - `/help`.
6. Add bot to test group.
7. Promote it with permission to pin messages.
8. Set webhook to bot service URL and supply Telegram secret token.
9. Subscribe to required update types, including membership events.

Group buttons use direct links similar to:

```text
https://t.me/<bot_username>/<short_name>?startapp=<opaque-token>&mode=compact
```

## 7. Monnify setup

Sandbox checklist:

- create integration;
- obtain API key, secret key, contract code;
- configure transaction webhook;
- configure disbursement webhook;
- confirm direct-debit sandbox availability;
- confirm card-tokenization sandbox behavior;
- request sandbox disbursement enablement if required;
- configure source wallet account;
- fund/test wallet when required.

Live prerequisites may include:

- card-tokenization enablement;
- disbursement enablement;
- static server egress IP whitelisting;
- MFA operating decision;
- production webhook signature validation;
- identity-verification access;
- legal/compliance approvals;
- bank/provider configuration.

## 8. Local webhook development

Use a public HTTPS tunnel.

Route:

- Telegram webhook to bot port;
- Monnify webhook to API port;
- Mini App URL to Next.js port.

Do not accidentally route Telegram and Monnify events to the same wrong process. Document the exact tunnel commands selected by the developer rather than forcing one vendor.

## 9. Demo/test mode

Provide safe seed fixtures:

- Telegram chat/user fixtures;
- a draft Collage;
- a registration-open Collage;
- mocked identity verification;
- test OTP provider;
- no real secrets;
- no fake provider success in production adapters.

Provider mocks are enabled only through explicit test/development configuration.

## 10. Deployment topology

Supported options:

- one container host running Compose;
- separate container services;
- Mini App on a Next.js host;
- managed PostgreSQL and Redis.

Requirements:

- stable HTTPS;
- static egress where Monnify live payouts require it;
- worker always running;
- bot webhook always reachable;
- no scale-to-zero unless scheduled jobs are guaranteed to wake;
- one migration job per deployment;
- horizontal workers rely on queue + DB invariants;
- bot scaling preserves safe update processing.

### 10.1 Render free demo deployment

The repository includes a deliberately non-production Render Blueprint at
`render.yaml`. It deploys the API, bot, worker, Mini App, and a small routing
gateway as separate processes inside one free Docker Web Service. Render
Postgres and Render Key Value remain separate managed free resources; they
must never be placed in the application container because its filesystem is
ephemeral.

Canonical demo origin:

```text
https://collage-apiconf.onrender.com
```

Public routes:

| Route                                            | Destination                         |
| ------------------------------------------------ | ----------------------------------- |
| `/`                                              | Mini App on internal port `3000`    |
| `/api/v1/*`                                      | API `/v1/*` on internal port `4000` |
| `/api/webhooks/monnify`                          | API `/webhooks/monnify`             |
| `/telegram/webhook`                              | bot on internal port `4001`         |
| `/bot/health/live` and `/bot/health/ready`       | bot health routes                   |
| `/worker/health/live` and `/worker/health/ready` | worker health routes                |
| `/health/live` and `/health/ready`               | combined deployment health          |

The gateway removes only the leading `/api` segment before forwarding. It
streams request bodies instead of parsing them, preserving the exact Monnify
webhook bytes required for signature validation.

Deploy through **New → Blueprint** in Render and select this repository.
Before the first deployment, provide every Blueprint variable marked
`sync: false`. Generate independent values:

```bash
openssl rand -base64 32 # APP_ENCRYPTION_KEY_BASE64
openssl rand -hex 32    # APP_HASH_PEPPER
openssl rand -hex 32    # INTERNAL_SERVICE_TOKEN
openssl rand -hex 32    # LAUNCH_TOKEN_HASH_SECRET
openssl rand -hex 32    # API_SESSION_SECRET
openssl rand -hex 32    # TELEGRAM_WEBHOOK_SECRET
```

Set `APP_ENCRYPTION_KEY_ID` to an immutable label such as
`collage-render-demo-2026-07`. Obtain the Telegram bot token, username, and Mini
App short name from BotFather. The two `NEXT_PUBLIC_TELEGRAM_*` values must
match their server-side counterparts because the browser values are compiled
into the Mini App.

The container invokes the already-installed Prisma CLI directly to run
`prisma migrate deploy` before starting any long-running process. Runtime
migrations do not invoke Corepack or reinstall workspace dependencies, and the
application continues to run as a non-root user. It then starts all application
processes and the public gateway. A critical child-process exit terminates the
container so Render restarts the whole demo consistently. Graceful termination
is forwarded to API, bot, worker, and Mini App.

After deployment:

1. Open `https://collage-apiconf.onrender.com/health/ready` and wait for `200`.
2. Open the Mini App origin and confirm the design shell loads.
3. In BotFather, set the Mini App URL to the canonical demo origin.
4. Confirm Telegram webhook configuration points to
   `https://collage-apiconf.onrender.com/telegram/webhook`.
5. If Monnify sandbox is intentionally enabled later, configure its webhook as
   `https://collage-apiconf.onrender.com/api/webhooks/monnify` and reverify the
   current official signature/source rules first.

Free-demo limitations are binding:

- `PROVIDER_CALLS_ENABLED` stays `false` by default;
- the whole service scales to zero after inactivity, stopping scheduled work;
- the next HTTP request wakes API, bot, worker, and Mini App together;
- free Key Value is non-durable, so queued jobs can disappear after restart;
- free Postgres expires after 30 days and provides no backup;
- this topology must not process real contributions, production identity data,
  payouts, or other live financial activity.

## 11. CI pipeline

On pull request:

1. frozen install;
2. Prisma client generation;
3. lint;
4. typecheck;
5. unit tests;
6. integration tests with PostgreSQL/Redis;
7. build all apps;
8. critical Playwright E2E where feasible;
9. dependency/security scan;
10. Docker image build smoke test.

Never run production migrations from a pull request.

## 12. Required final handoff

Codex must produce:

- `.env.example` for each app;
- variable-by-variable explanation;
- exact local startup commands;
- migration and seed commands;
- Telegram configuration steps;
- Monnify dashboard/configuration checklist;
- Docker Compose commands;
- webhook test steps;
- end-to-end demo script;
- known limitations;
- provider-dependent items;
- production-readiness blockers.
