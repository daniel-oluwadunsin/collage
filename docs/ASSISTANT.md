# Groq-Powered Collage Assistant

## Boundary

The assistant is a backend-owned natural-language router. The Telegram bot
does not call Groq, and Groq cannot access Prisma, PostgreSQL, Redis, Monnify,
Telegram, launch-token storage, or application services.

```text
Telegram update
  -> apps/bot trusted context extraction
  -> signed POST /internal/assistant/query
  -> apps/api actor/chat/Collage/permission resolution
  -> deterministic tool-family pre-router
  -> one Groq local-tool selection request
  -> strict Zod validation and authorization
  -> one backend read or action-link tool
  -> deterministic Telegram HTML
  -> reply to the original message/topic
```

There is no Groq retry, fallback AI provider, conversation history, tool-result
follow-up request, or model-written financial answer.

## Internal contract

`POST /internal/assistant/query` uses the existing signed, timestamped,
nonce-protected internal service authentication. The bot sends:

- Telegram chat, message, and optional topic IDs;
- verified sender ID/display metadata, or `sentAnonymously=true`;
- the command/bot-mention-stripped question;
- Telegram mention entities and the replied-to sender when present.

The API returns escaped HTML, the original message ID as `replyToMessageId`,
the original topic ID, and optional HTTPS Mini App buttons. The bot sends with
Telegram `ReplyParameters` and does not derive financial facts.

## Identity and target resolution

“I”, “me”, “my”, “mine”, and “myself” always identify the trusted Telegram
sender. No model argument may contain a Telegram user ID, database ID, Collage
ID, cycle ID, or provider reference.

Mention entities become `<MENTION_N>` and replied-to contributors become
`<REPLY_TARGET>` before Groq is called. The backend maps those placeholders to
the local Collage membership. Plain names resolve in this order:

1. exact Telegram username;
2. exact Telegram display name;
3. exact normalized registered legal name;
4. safe case-insensitive partial match;
5. deterministic ambiguity/no-match response.

Anonymous administrator messages may access only the two limited group status
tools. Any anonymous personal question receives the fixed anonymous-identity
response.

## Tool catalogue

Personal tools derive their subject only from the authenticated sender:

- `get_my_payout_schedule`
- `get_my_payout_position`
- `get_my_current_payment_status`
- `get_my_next_charge_schedule`
- `get_my_outstanding_obligation`
- `get_my_remaining_contributions`
- `get_my_registration_status`
- `get_my_payment_method_status`
- `get_my_current_cycle_summary`

Group/cycle tools:

- `get_collage_status`
- `get_current_cycle_status`
- `get_collage_pot_balance`
- `get_next_payout_recipient`
- `get_previous_payout_recipient`
- `get_remaining_cycles`
- `get_collage_expected_end`
- `get_public_payout_order`
- `get_member_at_position`
- `list_recent_payouts`
- `list_current_pending_contributors`
- `explain_current_cycle_block`

Other-member tools accept only a trusted placeholder or a backend-resolved
plain-name query:

- `get_member_payout_schedule`
- `get_member_payout_position`
- `get_member_public_payment_status`
- `get_member_public_payout_status`
- `get_recipient_after_member`

`explain_collage_rule` accepts one enumerated topic and formats the locked rule
version using stored Collage configuration and platform invariants.

Action tools never perform the underlying financial mutation:

- `create_my_manual_payment_action`
- `create_update_payment_method_action`
- `create_update_payout_account_action`
- `create_registration_resume_action`
- `create_join_collage_action`
- `create_view_payment_method_action`
- `create_view_payout_account_action`
- `create_my_payout_recovery_action`

The two model escape tools are `request_clarification` and
`unsupported_question`.

## Permission and privacy policy

| Capability                                  | Registered contributor                             | Current group admin                  | Outsider/anonymous  |
| ------------------------------------------- | -------------------------------------------------- | ------------------------------------ | ------------------- |
| Own schedule, obligation, contribution      | Own only                                           | Own only                             | No                  |
| Own registration/payment-method state       | Own only, including in-progress registration       | Own only                             | No                  |
| Limited Collage/current-cycle status        | Yes                                                | Yes                                  | Group question only |
| Pot, order, history, pending members, rules | Yes                                                | Yes without contributor registration | No                  |
| Other-member public status                  | Yes                                                | Yes                                  | No                  |
| Own payment/account action                  | Own only                                           | Own only                             | No                  |
| Payout recovery                             | Current recipient after terminal retryable outcome | No override                          | No                  |
| NIN, phone, account/card/mandate credential | Never in assistant                                 | Never                                | Never               |

Payment method type/state may be summarized without credentials. Payout
account and card details are never written to the group; the owner receives a
secure Mini App button where a supported private screen exists. Other-member
responses contain only Telegram display identity, payout position/schedule,
and public contribution/payout state—never provider failure reason.

## Action-link checks

Before issuing a link the API verifies sender, fresh group membership, Collage
membership, state, ownership, and the relevant current contribution/payout.
Manual payment is unavailable while an original provider attempt remains
`CREATED`, `PENDING`, or `UNKNOWN`. Payout recovery is available only to the
scheduled recipient after `FAILED`, `REVERSED`, or `EXPIRED`.

Tokens expire after ten minutes, are single use, and bind the user, chat,
Collage, action, and relevant cycle/payout. Mini App bootstrap and the normal
financial endpoint repeat authorization and source-of-truth checks.

## Limits and failure behavior

- question length: `ASSISTANT_MAX_MESSAGE_LENGTH` (default 1000);
- per-user: `ASSISTANT_USER_RATE_LIMIT_PER_MINUTE` (default 5);
- per-chat: `ASSISTANT_CHAT_RATE_LIMIT_PER_MINUTE` (default 20);
- Groq requests per question: exactly one;
- tool calls executed per question: at most one.

Timeout, rate limit, HTTP failure, malformed JSON/tool arguments, an unknown or
unexposed tool, and backend execution failure all fail closed. Provider details
and the raw user message are not logged.

## Local configuration

Set the API-only values listed in `.env.example`. With no Groq credentials,
set `ASSISTANT_ENABLED=false`. Run the normal repository format, lint,
typecheck, database/API/bot/worker integration, build, Playwright, and Compose
checks. A live provider smoke additionally requires an operator-owned Groq key
and enabled tool-capable model. The selected deployment model is
`openai/gpt-oss-20b`; it can be overridden through `GROQ_MODEL` without an
application code change.

The runtime default and deployed Render Blueprint keep
`ASSISTANT_ENABLED=false` so an existing deployment without Groq configuration
continues to start unchanged. Enable it only after the new API secret is
installed and staging smoke tests pass.
